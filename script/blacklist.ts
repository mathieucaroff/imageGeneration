#!/usr/bin/env bun
/**
 * Blacklists a machine ID so provision-rtx4090.ts never offers it again
 * (e.g. after hitting a host-side failure like a broken GPU/CDI setup).
 */
import { blacklistMachineId } from "../lib/history"

async function main() {
  const id = Number(process.argv[2])
  if (!id) throw new Error("Usage: just blacklist <machine_id>")
  await blacklistMachineId(id)
  console.log(`Machine ${id} blacklisted; provision-rtx4090.ts will skip it from now on.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
