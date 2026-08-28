#!/usr/bin/env bun
/**
 * Connects to a running Vast.ai instance with the project's SSH key.
 */
import { listInstances } from "../lib/vastai"

const sshKeyPath = process.env.VASTAI_PRIVATE_SSH_KEY_PATH || ".ssh/vastai_ed25519"

function parseArgs(argv: string[]): { instanceId: number | undefined; sshArgs: string[] } {
  const sshArgs: string[] = []
  let instanceId: number | undefined

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === "--instance") {
      const value = argv[++index]
      if (!value || !Number.isInteger(Number(value))) {
        throw new Error("Usage: just ssh [--instance ID] [ssh arguments]")
      }
      instanceId = Number(value)
    } else if (arg) {
      sshArgs.push(arg)
    }
  }

  return { instanceId, sshArgs }
}

async function main() {
  const { instanceId, sshArgs } = parseArgs(process.argv.slice(2))
  const running = (await listInstances()).filter((instance) => instance.actual_status === "running")
  const instance = instanceId
    ? running.find((candidate) => candidate.id === instanceId)
    : running[0]

  if (!instance) {
    throw new Error(
      instanceId
        ? `No running instance with id ${instanceId}.`
        : "No running Vast.ai instance found. Provision one first with `just provision`.",
    )
  }
  if (!instance.ssh_host || !instance.ssh_port) {
    throw new Error(`Could not determine the SSH endpoint for instance ${instance.id}.`)
  }

  const sshProcess = Bun.spawn(
    [
      "ssh",
      "-o",
      "StrictHostKeyChecking=no",
      "-i",
      sshKeyPath,
      "-p",
      String(instance.ssh_port),
      `root@${instance.ssh_host}`,
      ...sshArgs,
    ],
    { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
  )
  process.exit(await sshProcess.exited)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
