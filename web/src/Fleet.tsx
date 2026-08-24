import { useState } from "react"
import { Button } from "./components/Button"
import { Modal } from "./components/Modal"
import { StatusDot } from "./components/StatusDot"
import { elapsedSeconds, shortInstanceId } from "./utils"

function isStopped(instance: Instance) {
  return instance.actual_status === "stopped" || instance.cur_state === "stopped"
}

type PendingAction =
  | { kind: "delete"; instance: Instance }
  | { kind: "stop"; instance: Instance }
  | { kind: "stop-all" }

export function Fleet({
  instances,
  now,
  onAction,
}: {
  instances: Instance[]
  now: number
  onAction: (path: string, init?: RequestInit) => void
}) {
  const [pendingAction, setPendingAction] = useState<PendingAction>()
  const [provisionCount, setProvisionCount] = useState("")

  function confirmAction() {
    if (!pendingAction) return
    if (pendingAction.kind === "delete")
      onAction(`/instances/${pendingAction.instance.id}`, { method: "DELETE" })
    else if (pendingAction.kind === "stop")
      onAction(`/instances/${pendingAction.instance.id}/stop`, { method: "POST" })
    else onAction("/instances/stop-all", { method: "POST" })
    setPendingAction(undefined)
  }

  async function provision() {
    const count = provisionCount === "" ? 1 : Number(provisionCount)
    for (let instance = 0; instance < count; instance += 1) {
      onAction("/instances/provision", { method: "POST" })
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#30332e] py-3 pb-5">
        <div className="mr-1 w-full font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286] sm:w-auto">
          VAST.AI FLEET
        </div>
        {instances.map((instance) => (
          <div
            className="flex items-center gap-2 bg-[#20231f] px-2 py-1.5 font-['DM_Mono'] text-[11px] text-[#bfc2b5]"
            key={instance.id}
          >
            <StatusDot ready={instance.ready} />#{shortInstanceId(instance.id)}{" "}
            {instance.provisioning} ${instance.dph_total.toFixed(2)}/h
            {!instance.ready && (
              <span className="text-[#8d9286]">{elapsedSeconds(instance.start_date, now)}</span>
            )}
            <Button
              className="px-0.5 text-[#777d70] hover:text-[#dc9b8f]"
              variant="quiet"
              title={isStopped(instance) ? "Delete instance" : "Stop instance"}
              onClick={() => {
                setPendingAction(
                  isStopped(instance) ? { kind: "delete", instance } : { kind: "stop", instance },
                )
              }}
            >
              ×
            </Button>
          </div>
        ))}
        <div className="flex h-8 border border-[#42473d] bg-[#20231f] focus-within:border-[#cfdc6a]">
          <input
            aria-label="Number of instances to provision"
            className="w-12 border-r border-[#42473d] bg-transparent px-2 font-['DM_Mono'] text-xs text-[#e9e5dc] outline-none"
            inputMode="numeric"
            min="1"
            max="9"
            placeholder="1"
            type="number"
            value={provisionCount}
            onChange={(event) => {
              if (event.target.value === "" || /^[1-9]$/.test(event.target.value))
                setProvisionCount(event.target.value)
            }}
          />
          <Button className="px-3 text-[12px]" onClick={provision}>
            + Provision
          </Button>
        </div>
        <Button
          className="border-[#5b3b37] px-3 py-2 text-[12px] text-[#db9d91]"
          onClick={() => setPendingAction({ kind: "stop-all" })}
        >
          Stop all
        </Button>
      </div>
      {pendingAction && (
        <Modal labelledBy="confirm-fleet-action-title">
          <h2 className="font-['Fraunces'] text-xl text-[#e9e5dc]" id="confirm-fleet-action-title">
            {pendingAction.kind === "delete"
              ? "Delete instance?"
              : pendingAction.kind === "stop"
                ? "Stop instance?"
                : "Stop all instances?"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#bfc2b5]">
            {pendingAction.kind === "delete"
              ? `Instance #${shortInstanceId(pendingAction.instance.id)} is stopped. Deleting it is permanent.`
              : pendingAction.kind === "stop"
                ? `Stop instance #${shortInstanceId(pendingAction.instance.id)}?`
                : "Stop every active instance in the fleet?"}
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button
              className="bg-transparent px-3 py-2 text-xs"
              onClick={() => setPendingAction(undefined)}
            >
              Cancel
            </Button>
            <Button
              className="px-3 py-2 text-xs font-bold"
              variant={pendingAction.kind === "delete" ? "danger" : "primary"}
              onClick={confirmAction}
            >
              {pendingAction.kind === "delete" ? "Delete instance" : "Stop instances"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
