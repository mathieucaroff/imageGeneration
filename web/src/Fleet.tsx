import { useEffect, useState } from "react"
import { Button } from "./components/Button"
import { Modal } from "./components/Modal"
import { elapsedSeconds, shortInstanceId } from "./utils"
import { StatusIndicator } from "./components/StatusIndicator"

function isStopped(instance: Instance) {
  return instance.actual_status === "stopped" || instance.cur_state === "stopped"
}

type PendingAction =
  | { kind: "delete"; instance: Instance }
  | { kind: "stop"; instance: Instance }
  | { kind: "stop-all" }

const provisionCountStorageKey = "pony-studio.provision-count.v1"

function loadProvisionCount() {
  try {
    const value = localStorage.getItem(provisionCountStorageKey)
    return value && /^[1-9]$/.test(value) ? value : ""
  } catch {
    return ""
  }
}

export function Fleet({
  instances,
  now,
  instanceId,
  onInstance,
  onAction,
}: {
  instances: Instance[]
  now: number
  instanceId: number | ""
  onInstance: (id: number | "") => void
  onAction: (path: string, init?: RequestInit) => Promise<void>
}) {
  const [pendingAction, setPendingAction] = useState<PendingAction>()
  const [provisionCount, setProvisionCount] = useState(loadProvisionCount)
  const [provisioning, setProvisioning] = useState<{ instanceCount: number }>()
  const [changingInstances, setChangingInstances] = useState<
    Record<number, { actualStatus: string; curState: string; untilRemoved?: boolean }>
  >({})

  useEffect(() => {
    if (provisioning && instances.length !== provisioning.instanceCount) setProvisioning(undefined)
    setChangingInstances((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id, previous]) => {
          const instance = instances.find((candidate) => candidate.id === Number(id))
          return (
            instance &&
            (previous.untilRemoved ||
              (instance.actual_status === previous.actualStatus &&
                instance.cur_state === previous.curState))
          )
        }),
      ),
    )
  }, [instances, provisioning])

  useEffect(() => {
    try {
      localStorage.setItem(provisionCountStorageKey, provisionCount)
    } catch {
      /* Provisioning remains available when browser storage is unavailable. */
    }
  }, [provisionCount])

  async function requestInstanceChange(
    instance: Instance,
    path: string,
    init: RequestInit,
    untilRemoved = false,
  ) {
    setChangingInstances((current) => ({
      ...current,
      [instance.id]: {
        actualStatus: instance.actual_status,
        curState: instance.cur_state,
        untilRemoved,
      },
    }))
    try {
      await onAction(path, init)
    } catch {
      setChangingInstances((current) => {
        const { [instance.id]: _, ...remaining } = current
        return remaining
      })
    }
  }

  async function confirmAction() {
    if (!pendingAction) return
    if (pendingAction.kind === "delete")
      void requestInstanceChange(
        pendingAction.instance,
        `/instances/${pendingAction.instance.id}`,
        {
          method: "DELETE",
        },
        true,
      )
    else if (pendingAction.kind === "stop")
      void requestInstanceChange(
        pendingAction.instance,
        `/instances/${pendingAction.instance.id}/stop`,
        {
          method: "POST",
        },
      )
    else onAction("/instances/stop-all", { method: "POST" })
    setPendingAction(undefined)
  }

  async function provision() {
    const count = provisionCount === "" ? 1 : Number(provisionCount)
    setProvisioning({ instanceCount: instances.length })
    try {
      for (let instance = 0; instance < count; instance += 1) {
        await onAction("/instances/provision", { method: "POST" })
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    } catch {
      setProvisioning(undefined)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#30332e] py-3 pb-5">
        <div className="mr-1 w-full font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286] sm:w-auto">
          VAST.AI FLEET
        </div>
        <select
          aria-label="Ready instance"
          className="h-8 max-w-48 border border-[#42473d] bg-[#20231f] px-2 font-['DM_Mono'] text-[11px] text-[#d7d8ce] outline-none focus:border-[#cfdc6a]"
          value={instanceId}
          onChange={(event) => onInstance(event.target.value ? Number(event.target.value) : "")}
        >
          <option value="">Select instance</option>
          {instances
            .filter((instance) => instance.ready)
            .map((instance) => (
              <option value={instance.id} key={instance.id}>
                #{shortInstanceId(instance.id)} {instance.gpu_name}
              </option>
            ))}
        </select>
        {instances.map((instance) => (
          <div
            className="flex items-center gap-2 bg-[#20231f] px-2 py-1.5 font-['DM_Mono'] text-[11px] text-[#bfc2b5]"
            key={instance.id}
          >
            <StatusIndicator changing={!!changingInstances[instance.id]} ready={instance.ready} />#
            {shortInstanceId(instance.id)} {instance.provisioning} ${instance.dph_total.toFixed(2)}
            /h
            {!instance.ready && (
              <span className="text-[#8d9286]">{elapsedSeconds(instance.start_date, now)}</span>
            )}
            {isStopped(instance) && (
              <Button
                className="px-0.5 text-[#777d70] hover:text-[#cfdc6a]"
                variant="quiet"
                title="Start instance"
                onClick={() =>
                  void requestInstanceChange(instance, `/instances/${instance.id}/start`, {
                    method: "POST",
                  })
                }
              >
                ▶
              </Button>
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
          <Button
            className="px-3 text-[12px]"
            disabled={Boolean(provisioning)}
            onClick={() => void provision()}
          >
            {provisioning ? <span className="inline-block animate-spin">⟳</span> : "+ Provision"}
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
