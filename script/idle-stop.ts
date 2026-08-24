#!/usr/bin/env bun
/**
 * Stops idle instances and destroys both stalled provisioning and instances
 * stuck during creation.
 */
import { stopOrDestroyInstance } from "../lib/instance-lifecycle"
import { sweepInstances } from "../lib/instance-sweep"

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
        throw new Error("Usage: just idle-stop [--once] [--minutes N]")
      }
      idleMinutes = value
    } else {
      throw new Error("Usage: just idle-stop [--once] [--minutes N]")
    }
  }

  return { idleMinutes, once }
}

/**
 * Stops or destroys ready instances after inactivity, and destroys instances
 * that are stuck during creation or have not finished provisioning in time.
 * The CLI's idle policy preserves cheap disks but deletes expensive instances.
 */
async function stopIdleInstances(idleMinutes: number): Promise<void> {
  await sweepInstances({ idleMinutes, onIdle: stopOrDestroyInstance })
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
