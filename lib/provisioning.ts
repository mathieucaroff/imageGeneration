import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { CHECKPOINT_DIR, CHECKPOINT_FILE, CHECKPOINT_URL } from "./pony"
import { findExposedPort, type Instance } from "./vastai"

const execFileAsync = promisify(execFile)

// Log markers shared between the onstart script (writer) and the status
// parser (reader). Keeping both here guarantees they never drift apart.
const MARKERS = {
  cached: "Pony Diffusion V6 XL already present",
  ready: "Pony Diffusion V6 XL ready.",
  failed: "WARNING: failed to download Pony Diffusion V6 XL checkpoint.",
  downloading: "Downloading Pony Diffusion V6 XL...",
} as const

/**
 * Builds the instance onstart script that downloads the checkpoint and emits
 * the exact log markers `provisioningStatus` relies on.
 */
export function buildOnstartScript(): string {
  return `#!/bin/bash
set -uo pipefail
mkdir -p "${CHECKPOINT_DIR}"
DEST="${CHECKPOINT_DIR}/${CHECKPOINT_FILE}"
if [ -s "$DEST" ]; then
  echo "${MARKERS.cached}, skipping download."
else
  echo "${MARKERS.downloading}"
  curl --fail --location --silent --show-error \\
    --header "Authorization: Bearer \${CIVITAI_TOKEN:-}" \\
    --output "$DEST" "${CHECKPOINT_URL}" \\
    && echo "${MARKERS.ready}" \\
    || { echo "${MARKERS.failed}"; rm -f "$DEST"; }
fi
  ln -sfn "$DEST" "/opt/ComfyUI/models/checkpoints/${CHECKPOINT_FILE}"
type init.sh && init.sh
`
}

function provisioningState(log: string): string {
  if (log.includes(MARKERS.cached)) return "cached"
  if (log.includes(MARKERS.ready)) return "ready"
  if (log.includes(MARKERS.failed)) return "failed"
  if (log.includes(MARKERS.downloading)) return "downloading"
  return "empty"
}

// Resolved from this file so status checks work regardless of the process
// working directory (repo root for scripts, server/ for the API server).
const SSH_KEY_PATH = fileURLToPath(new URL("../.ssh/vastai_ed25519", import.meta.url))

export async function provisioningStatus(instance: Instance): Promise<string> {
  if (instance.cur_state === "stopped") return "poweredoff"
  if (instance.actual_status !== "running") return `pending(${instance.actual_status})`
  if (!instance.ssh_host || !instance.ssh_port) return "no-ssh-location"

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
        SSH_KEY_PATH,
        "-p",
        String(instance.ssh_port),
        `root@${instance.ssh_host}`,
        "--",
        "cat /var/log/onstart.log",
      ],
      { timeout: 10_000 },
    )
    const status = provisioningState(stdout)
    if (status !== "ready" && status !== "cached") {
      return status
    }
    if (!(await isComfyUiReady(instance))) {
      return `waiting-for-comfyui(${status})`
    }
    return status
  } catch (e) {
    console.log("error", e)
    const errMessage = e instanceof Error ? e.message : String(e)
    if (
      errMessage.includes(" banner exchange: Connection to UNKNOWN port -1: Connection refused")
    ) {
      return "ssh-port-connection-refused"
    } else if (errMessage.includes("Permission denied (publickey).")) {
      return "ssh-wrong-key"
    }
    return `ssh-failed(${errMessage})`
  }
}

export async function isComfyUiReady(instance: Instance): Promise<boolean> {
  let endpoint = findExposedPort(instance, 8188)
  if (!endpoint) return false
  try {
    const response = await fetch(`http://${endpoint.host}:${endpoint.port}/system_stats`, {
      headers: instance.jupyter_token ? { Authorization: `Bearer ${instance.jupyter_token}` } : {},
      signal: AbortSignal.timeout(5_000),
    })
    return response.ok
  } catch {
    return false
  }
}
