import { getLastActivityAt, recordActivity } from "./history"
import { provisioningStatus } from "./provisioning"
import { destroyInstance, listInstances, type Instance } from "./vastai"

// Instances that never progress past these statuses were never usable; give
// them a short fixed grace period after creation, then discard them.
const STUCK_CREATION_STATUSES = new Set(["created", "loading"])
export const STUCK_CREATION_MS = 5 * 60_000

function createdAtMs(instance: Instance): number | undefined {
  return instance.start_date ? instance.start_date * 1000 : undefined
}

/**
 * Destroys instances stuck during creation (actual_status never evolved past
 * "loading" within STUCK_CREATION_MS of creation). Returns the instances kept.
 */
export async function destroyStuckCreatingInstances(
  instances: Instance[],
  now = Date.now(),
): Promise<Instance[]> {
  const kept: Instance[] = []
  for (const instance of instances) {
    const createdAt = createdAtMs(instance)
    const isStuck =
      STUCK_CREATION_STATUSES.has(instance.actual_status) &&
      createdAt !== undefined &&
      now - createdAt >= STUCK_CREATION_MS
    if (isStuck) {
      console.log(
        `Destroying instance ${instance.id}: stuck in "${instance.actual_status}" since ${new Date(createdAt).toISOString()}.`,
      )
      await destroyInstance(instance.id)
    } else {
      kept.push(instance)
    }
  }
  return kept
}

/**
 * One pass of the shared reclamation policy:
 * - destroys instances stuck during creation (see above),
 * - destroys instances still unready past the idle timeout,
 * - applies `onIdle` to running instances inactive past the idle timeout.
 *
 * The idle action is injected so callers choose their own policy (the CLI
 * stops cheap instances to keep their disks; the server destroys outright).
 */
export async function sweepInstances(options: {
  idleMinutes: number
  onIdle: (instance: Instance) => Promise<unknown>
}): Promise<void> {
  const cutoff = Date.now() - options.idleMinutes * 60_000
  const instances = await destroyStuckCreatingInstances(await listInstances())

  for (const instance of instances) {
    // Creation stalls were handled above. Only running instances participate
    // in provisioning and idle checks; stopped instances must remain reusable.
    if (instance.actual_status !== "running") continue

    const provisioning = await provisioningStatus(instance)
    const createdAt = createdAtMs(instance)
    const isUnready = provisioning !== "ready" && provisioning !== "cached"

    // Unready instances have no valid activity clock; use creation time as a
    // provisioning deadline and discard them once the grace period expires.
    if (isUnready && createdAt !== undefined && createdAt <= cutoff) {
      console.log(
        `Destroying unready instance ${instance.id}; it was created ${new Date(createdAt).toISOString()}.`,
      )
      await destroyInstance(instance.id)
      continue
    }

    const lastActivityAt = await getLastActivityAt(instance.id)
    if (!lastActivityAt) {
      // Do not start the inactivity window until the model download has
      // completed, so slow but healthy provisioning is never stopped early.
      if (isUnready) {
        console.log(`Keeping instance ${instance.id}: provisioning is ${provisioning}.`)
        continue
      }
      await recordActivity(instance.id)
      console.log(`Started idle timer for ready instance ${instance.id}.`)
      continue
    }

    if (lastActivityAt.getTime() > cutoff) continue

    console.log(
      `Instance ${instance.id} is idle; last activity was ${lastActivityAt.toISOString()}.`,
    )
    await options.onIdle(instance)
  }
}
