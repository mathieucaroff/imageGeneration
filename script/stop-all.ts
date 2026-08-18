#!/usr/bin/env bun
/**
 * Stops every running Vast.ai instance. Instances priced at or below the reuse
 * threshold are just stopped (data and disk preserved, billing drops to
 * storage-only cost); pricier ones are destroyed outright instead, since
 * they're not worth paying idle storage on or preferring for reuse later.
 */
import { stopOrDestroyInstance } from "../lib/instance-lifecycle"
import { listInstances } from "../lib/vastai"

async function main() {
  const instances = await listInstances()
  const running = instances.filter((i) => i.actual_status !== "stopped")

  if (running.length === 0) {
    console.log("No running instances to stop.")
    return
  }

  for (const instance of running) {
    await stopOrDestroyInstance(instance)
  }

  console.log(`Processed ${running.length} instance(s).`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
