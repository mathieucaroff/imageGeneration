#!/usr/bin/env bun
/**
 * Destroys every Vast.ai instance so nothing keeps incurring cost
 * (unlike stopping, this discards the instance's disk).
 */
import { destroyInstance, listInstances } from "../lib/vastai"

async function main() {
  const instances = await listInstances()

  if (instances.length === 0) {
    console.log("No instances to delete.")
    return
  }

  for (const instance of instances) {
    console.log(
      `Destroying instance ${instance.id} (${instance.gpu_name}, ${instance.actual_status})...`,
    )
    await destroyInstance(instance.id)
  }

  console.log(`Destroyed ${instances.length} instance(s). No further cost will be incurred.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
