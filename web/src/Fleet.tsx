import { useState } from "react"
import { Button } from "./components/Button"
import { Modal } from "./components/Modal"
import { StatusDot } from "./components/StatusDot"
import { elapsedSeconds, shortInstanceId } from "./utils"

function isStopped(instance: Instance) {
  return instance.actual_status === "stopped" || instance.cur_state === "stopped"
}

export function Fleet({
  instances,
  now,
  onAction,
}: {
  instances: Instance[]
  now: number
  onAction: (path: string, init?: RequestInit) => void
}) {
  const [instanceToDelete, setInstanceToDelete] = useState<Instance>()

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
            {instance.provisioning}
            {!instance.ready && (
              <span className="text-[#8d9286]">{elapsedSeconds(instance.start_date, now)}</span>
            )}
            <Button
              className="px-0.5 text-[#777d70] hover:text-[#dc9b8f]"
              variant="quiet"
              title={isStopped(instance) ? "Delete instance" : "Stop instance"}
              onClick={() => {
                if (isStopped(instance)) setInstanceToDelete(instance)
                else if (window.confirm(`Stop instance #${instance.id}?`))
                  onAction(`/instances/${instance.id}/stop`, { method: "POST" })
              }}
            >
              ×
            </Button>
          </div>
        ))}
        <Button
          className="px-3 py-2 text-[12px]"
          onClick={() => onAction("/instances/provision", { method: "POST" })}
        >
          + Provision
        </Button>
        <Button
          className="border-[#5b3b37] px-3 py-2 text-[12px] text-[#db9d91]"
          onClick={() => {
            if (window.confirm("Stop all instances?"))
              onAction("/instances/stop-all", { method: "POST" })
          }}
        >
          Stop all
        </Button>
      </div>
      {instanceToDelete && (
        <Modal labelledBy="delete-instance-title">
          <h2 className="font-['Fraunces'] text-xl text-[#e9e5dc]" id="delete-instance-title">
            Delete instance?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#bfc2b5]">
            Instance #{shortInstanceId(instanceToDelete.id)} is stopped. Deleting it is permanent.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button
              className="bg-transparent px-3 py-2 text-xs"
              onClick={() => setInstanceToDelete(undefined)}
            >
              Cancel
            </Button>
            <Button
              className="px-3 py-2 text-xs font-bold"
              variant="danger"
              onClick={() => {
                onAction(`/instances/${instanceToDelete.id}`, { method: "DELETE" })
                setInstanceToDelete(undefined)
              }}
            >
              Delete instance
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
