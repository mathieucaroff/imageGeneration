import { REUSE_PRICE_THRESHOLD } from "./pricing"
import { destroyInstance, setInstanceState, type Instance } from "./vastai"

export async function stopOrDestroyInstance(instance: Instance): Promise<"stopped" | "destroyed"> {
  if (instance.dph_total > REUSE_PRICE_THRESHOLD) {
    console.log(
      `Destroying instance ${instance.id} (${instance.gpu_name}, $${instance.dph_total.toFixed(3)}/hr > $${REUSE_PRICE_THRESHOLD}/hr threshold)...`,
    )
    await destroyInstance(instance.id)
    return "destroyed"
  }

  console.log(
    `Stopping instance ${instance.id} (${instance.gpu_name}, $${instance.dph_total.toFixed(3)}/hr)...`,
  )
  await setInstanceState(instance.id, "stopped")
  return "stopped"
}
