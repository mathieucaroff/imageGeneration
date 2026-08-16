#!/usr/bin/env bun
/**
 * Stops every running Vast.ai instance. Instances priced at or below the reuse
 * threshold are just stopped (data and disk preserved, billing drops to
 * storage-only cost); pricier ones are destroyed outright instead, since
 * they're not worth paying idle storage on or preferring for reuse later.
 */
import { destroyInstance, listInstances, setInstanceState } from "../lib/vastai"
import { REUSE_PRICE_THRESHOLD } from "../lib/pricing"

async function main() {
  const instances = await listInstances()
  const running = instances.filter((i) => i.actual_status !== "stopped")

  if (running.length === 0) {
    console.log("No running instances to stop.")
    return
  }

  for (const instance of running) {
    if (instance.dph_total > REUSE_PRICE_THRESHOLD) {
      console.log(
        `Destroying instance ${instance.id} (${instance.gpu_name}, $${instance.dph_total.toFixed(3)}/hr > $${REUSE_PRICE_THRESHOLD}/hr threshold)...`,
      )
      await destroyInstance(instance.id)
    } else {
      console.log(
        `Stopping instance ${instance.id} (${instance.gpu_name}, $${instance.dph_total.toFixed(3)}/hr)...`,
      )
      await setInstanceState(instance.id, "stopped")
    }
  }

  console.log(`Processed ${running.length} instance(s).`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
