import { sweepInstances } from "../../lib/instance-sweep"
import { COMFYUI_PORT } from "../../lib/pony"
import { provisioningStatus } from "../../lib/provisioning"
import { destroyInstance, findExposedPort, listInstances, type Instance } from "../../lib/vastai"

export async function resolveReadyInstance(
  id: number,
): Promise<{ instance: Instance; host: string; port: number; token?: string }> {
  const instance = (await listInstances()).find((candidate) => candidate.id === id)
  if (!instance || instance.actual_status !== "running")
    throw new Error(`Instance ${id} is not running`)
  const provisioning = await provisioningStatus(instance)
  if (provisioning !== "ready" && provisioning !== "cached")
    throw new Error(`Instance ${id} is not ready (${provisioning})`)
  const endpoint = findExposedPort(instance, COMFYUI_PORT)
  if (!endpoint) throw new Error(`ComfyUI endpoint is unavailable for instance ${id}`)
  return {
    instance,
    ...endpoint,
    ...(instance.jupyter_token ? { token: instance.jupyter_token } : {}),
  }
}

export function startInstanceSweep(idleMinutes: number): void {
  const sweep = () =>
    void sweepInstances({ idleMinutes, onIdle: (instance) => destroyInstance(instance.id) }).catch(
      (error) =>
        console.error(`Instance sweep failed: ${error instanceof Error ? error.message : error}`),
    )
  sweep()
  setInterval(sweep, 30_000)
}
