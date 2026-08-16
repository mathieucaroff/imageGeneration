#!/usr/bin/env bun
/**
 * Provisions a single RTX 4090 instance on Vast.ai from the cheapest
 * eligible offer.
 */
import { createInstance, searchRtx4090Offers } from "../lib/vastai"
import { loadBlacklistedMachineIds } from "../lib/history"
import { CHECKPOINT_DIR, CHECKPOINT_FILE, CHECKPOINT_URL, COMFYUI_PORT } from "../lib/pony"
import { MAX_PRICE_PER_HOUR } from "../lib/pricing"

// No known docker image bundles Pony Diffusion V6 XL directly; it's a
// checkpoint, not a container. This falls back to ai-dock's ComfyUI image,
// which serves it once the checkpoint is downloaded (e.g. via CivitAI).
const IMAGE = process.env.VASTAI_IMAGE ?? "ghcr.io/ai-dock/comfyui:latest-cuda"

// Confirmed to fail container start with "unresolvable CDI devices ... gpu=0:
// unknown" (broken NVIDIA CDI generation) across multiple independent hosts.
const KNOWN_BAD_DRIVER_VERSIONS = new Set(["595.58.03"])

function buildOnstartScript(): string {
  return `#!/bin/bash
set -uo pipefail
mkdir -p "${CHECKPOINT_DIR}"
DEST="${CHECKPOINT_DIR}/${CHECKPOINT_FILE}"
if [ -s "$DEST" ]; then
  echo "Pony Diffusion V6 XL already present, skipping download."
else
  echo "Downloading Pony Diffusion V6 XL..."
  curl --fail --location --silent --show-error \\
    --header "Authorization: Bearer \${CIVITAI_TOKEN:-}" \\
    --output "$DEST" "${CHECKPOINT_URL}" \\
    && echo "Pony Diffusion V6 XL ready." \\
    || { echo "WARNING: failed to download Pony Diffusion V6 XL checkpoint."; rm -f "$DEST"; }
fi
  ln -sfn "$DEST" "/opt/ComfyUI/models/checkpoints/${CHECKPOINT_FILE}"
type init.sh && init.sh
`
}

async function main() {
  const offers = await searchRtx4090Offers(MAX_PRICE_PER_HOUR)
  if (offers.length === 0) {
    throw new Error(
      `No RTX 4090 offers currently available on Vast.ai at or below $${MAX_PRICE_PER_HOUR}/hr`,
    )
  }

  const blacklistedMachineIds = await loadBlacklistedMachineIds()
  const available = offers.filter(
    (o) =>
      !blacklistedMachineIds.has(o.machine_id) && !KNOWN_BAD_DRIVER_VERSIONS.has(o.driver_version),
  )
  if (available.length === 0) {
    throw new Error(
      `All RTX 4090 offers at or below $${MAX_PRICE_PER_HOUR}/hr are blacklisted or on a known-bad driver. Raise VASTAI_MAX_PRICE or clear the blacklist.`,
    )
  }

  const chosen = available[0]
  if (!chosen)
    throw new Error(
      `No RTX 4090 offers currently available on Vast.ai at or below $${MAX_PRICE_PER_HOUR}/hr`,
    )

  console.log(`Choosing cheapest eligible offer at $${chosen.dph_total.toFixed(3)}/hr`)

  const envVars: Record<string, string | undefined> = {
    CIVITAI_TOKEN: process.env.CIVITAI_API_KEY,
  }
  const envArgs = [`-p ${COMFYUI_PORT}:${COMFYUI_PORT}`, "-p 22:22"]
    .concat(
      Object.entries(envVars)
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
        .map(([key, value]) => `-e ${key}=${value}`),
    )
    .join(" ")

  const result = await createInstance(chosen.id, {
    image: IMAGE,
    env: envArgs,
    disk: 40,
    onstart: buildOnstartScript(),
  })

  console.log(`Created instance ${result.new_contract} (
    offer ${chosen.id}
    machine ${chosen.machine_id}
    image ${IMAGE}
)`)
  console.log("Pony Diffusion V6 XL will download on first boot if not already on disk.")
  console.log("Check status at https://cloud.vast.ai/instances/")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
