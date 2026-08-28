import { execFile } from "node:child_process"
import { isAbsolute } from "node:path"
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

// Both script/ and server/ processes run one directory below the repo root.
const configuredSshKeyPath = process.env.VASTAI_PRIVATE_SSH_KEY_PATH
const SSH_KEY_PATH =
  configuredSshKeyPath && isAbsolute(configuredSshKeyPath)
    ? configuredSshKeyPath
    : `../${configuredSshKeyPath || ".ssh/vastai_ed25519"}`

const portConnectionRefusedRegex =
  /banner\s+exchange:\s+Connection\s+to\s+UNKNOWN\s+port\s+-1:\s+Connection\s+refused/

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
    if (portConnectionRefusedRegex.test(errMessage)) {
      return "ssh-port-connection-refused"
    } else if (errMessage.includes("Connection refused")) {
      return "ssh-other-connection-refused"
    } else if (errMessage.includes("Permission denied (publickey).")) {
      return "ssh-wrong-key"
    } else if (errMessage.includes("Connection closed by")) {
      return "ssh-connection-closed"
    } else if (errMessage.includes("Connection reset by")) {
      return "ssh-connection-reset"
    } else if (errMessage.includes("Connection timed out")) {
      return "ssh-connection-timed-out"
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
