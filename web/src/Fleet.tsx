import type { Instance } from "./types"
import { elapsedSeconds, shortInstanceId } from "./utils"

export function Fleet({
  instances,
  now,
  onAction,
}: {
  instances: Instance[]
  now: number
  onAction: (path: string, init?: RequestInit) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#30332e] py-3 pb-5">
      <div className="mr-1 w-full font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286] sm:w-auto">
        VAST.AI FLEET
      </div>
      {instances.map((instance) => (
        <div
          className="flex items-center gap-2 bg-[#20231f] px-2 py-1.5 font-['DM_Mono'] text-[11px] text-[#bfc2b5]"
          key={instance.id}
        >
          <span
            className={`inline-block size-[7px] rounded-full ${instance.ready ? "bg-[#b8c457] shadow-[0_0_0_4px_#b8c4571c]" : "bg-[#777b71]"}`}
          />
          #{shortInstanceId(instance.id)} {instance.provisioning}
          {!instance.ready && (
            <span className="text-[#8d9286]">{elapsedSeconds(instance.start_date, now)}</span>
          )}
          <button
            className="px-0.5 text-[#777d70] hover:text-[#dc9b8f]"
            title="Stop instance"
            onClick={() => {
              if (window.confirm(`Stop instance #${instance.id}?`))
                onAction(`/instances/${instance.id}/stop`, { method: "POST" })
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="border border-[#42473d] bg-[#20231f] px-3 py-2 text-[12px] text-[#c5c9b8] hover:border-[#cfdc6a] hover:text-[#cfdc6a]"
        onClick={() => onAction("/instances/provision", { method: "POST" })}
      >
        + Provision
      </button>
      <button
        className="border border-[#5b3b37] bg-[#20231f] px-3 py-2 text-[12px] text-[#db9d91]"
        onClick={() => {
          if (window.confirm("Stop all instances?"))
            onAction("/instances/stop-all", { method: "POST" })
        }}
      >
        Stop all
      </button>
    </div>
  )
}
