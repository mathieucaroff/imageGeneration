#!/usr/bin/env bun
/**
 * Lists every Vast.ai instance, with running ones shown first, or as JSON.
 */
import { provisioningStatus } from "../lib/provisioning"
import { type Instance, listInstances } from "../lib/vastai"

function statusRank(status: string): number {
  return { running: 0, created: 1, loading: 2 }[status] ?? 2
}

function country(instance: Instance): string {
  return instance.country_code ?? instance.geolocation?.split(",").at(-1)?.trim() ?? "-"
}

function sshCommand(instance: Instance): string {
  return `bun run vastai:ssh -- --instance ${instance.id}`
}

function getPortString(instance: Instance): string {
  if (!instance.ports) return "-"

  const portMapping: Record<string, string> = {}
  Object.entries(instance.ports).forEach(([containerPort, mappings]) => {
    portMapping[containerPort] = [...new Set(mappings.map((m) => m.HostPort).filter(Boolean))].join(
      " ",
    )
  })

  const portArray = [22, 8188]
    .map((internalPort) => portMapping[`${internalPort}/tcp`])
    .filter(Boolean)

  return portArray.join(", ")
}

async function main() {
  const instances = await listInstances()

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(instances, null, 2))
    return
  }

  if (instances.length === 0) {
    console.log("No instances found.")
    return
  }

  const sorted = [...instances].sort((a, b) => {
    const rankDiff = statusRank(a.actual_status) - statusRank(b.actual_status)
    return rankDiff !== 0 ? rankDiff : a.dph_total - b.dph_total
  })
  const provisioning = await Promise.all(sorted.map(provisioningStatus))

  console.table(
    sorted.map((i, index) => ({
      id: i.id,
      status: i.actual_status,
      "$/hr": i.dph_total.toFixed(3),
      "..": country(i),
      host: i.public_ipaddr ?? "-",
      machine_id: i.machine_id,
      "port[22, 8188]": getPortString(i),
      provisioning: provisioning[index],
      ssh_command: sshCommand(i),
    })),
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
