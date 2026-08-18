#!/usr/bin/env bun
/**
 * Stops idle instances and destroys stalled provisioning after the timeout.
 */
import { getLastActivityAt, recordActivity } from "../lib/history"
import { stopOrDestroyInstance } from "../lib/instance-lifecycle"
import { provisioningStatus } from "../lib/provisioning"
import { destroyInstance, listInstances } from "../lib/vastai"

const DEFAULT_IDLE_MINUTES = 20
const POLL_MS = 60_000

function parseArgs(argv: string[]): { idleMinutes: number; once: boolean } {
  let idleMinutes = DEFAULT_IDLE_MINUTES
  let once = false

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === "--once") {
      once = true
    } else if (arg === "--minutes") {
      const value = Number(argv[++index])
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Usage: bun run vastai:idle-stop [--once] [--minutes N]")
      }
      idleMinutes = value
    } else {
      throw new Error("Usage: bun run vastai:idle-stop [--once] [--minutes N]")
    }
  }

  return { idleMinutes, once }
}

/**
 * Stops or destroys ready instances after inactivity, and destroys instances
 * that have not finished provisioning within the same timeout.
 */
async function stopIdleInstances(idleMinutes: number): Promise<void> {
  const cutoff = Date.now() - idleMinutes * 60_000
  const instances = await listInstances()

  for (const instance of instances) {
    const provisioning = await provisioningStatus(instance)
    const createdAt = instance.start_date ? instance.start_date * 1000 : undefined
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

    if (instance.actual_status !== "running") continue

    let lastActivityAt = await getLastActivityAt(instance.id)
    if (!lastActivityAt) {
      // Do not start the inactivity window until the model download has
      // completed, so slow but healthy provisioning is never stopped early.
      if (provisioning !== "ready" && provisioning !== "cached") {
        console.log(`Keeping instance ${instance.id}: provisioning is ${provisioning}.`)
        continue
      }
      await recordActivity(instance.id)
      console.log(`Started idle timer for ready instance ${instance.id}.`)
      continue
    }

    if (lastActivityAt.getTime() > cutoff) continue

    // The shared policy preserves cheap disks but immediately deletes
    // expensive instances once they become idle.
    console.log(
      `Instance ${instance.id} is idle; last activity was ${lastActivityAt.toISOString()}.`,
    )
    await stopOrDestroyInstance(instance)
  }
}

async function main() {
  const { idleMinutes, once } = parseArgs(process.argv.slice(2))
  await stopIdleInstances(idleMinutes)
  if (once) return

  console.log(`Monitoring instances with a ${idleMinutes}-minute idle and provisioning timeout.`)
  setInterval(() => {
    void stopIdleInstances(idleMinutes).catch((err) => {
      console.error(err instanceof Error ? err.message : err)
    })
  }, POLL_MS)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
