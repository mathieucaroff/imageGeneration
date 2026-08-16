import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { type Instance } from "./vastai"

const execFileAsync = promisify(execFile)

function provisioningState(log: string): string {
  if (log.includes("Pony Diffusion V6 XL already present")) return "cached"
  if (log.includes("Pony Diffusion V6 XL ready.")) return "ready"
  if (log.includes("WARNING: failed to download Pony Diffusion V6 XL checkpoint.")) return "failed"
  if (log.includes("Downloading Pony Diffusion V6 XL...")) return "downloading"
  return "empty"
}

export async function provisioningStatus(instance: Instance): Promise<string> {
  if (instance.actual_status !== "running") return "pending"
  if (!instance.ssh_host || !instance.ssh_port) return "unavailable"

  try {
    const { stdout } = await execFileAsync(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=5",
        "-o",
        "StrictHostKeyChecking=no",
        "-i",
        ".ssh/vastai_ed25519",
        "-p",
        String(instance.ssh_port),
        `root@${instance.ssh_host}`,
        "--",
        "cat /var/log/onstart.log",
      ],
      { timeout: 10_000 },
    )
    return provisioningState(stdout)
  } catch (e) {
    console.log("error", e)
    return "unavailable"
  }
}
