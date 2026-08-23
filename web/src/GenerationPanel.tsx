import type { FormEvent } from "react"
import { Button } from "./components/Button"
import { ErrorNotice } from "./components/ErrorNotice"
import { FormField } from "./components/FormField"
import { randomSeed } from "./utils"

type Props = {
  prompt: string
  negative: string
  width: number
  height: number
  seed: number
  instanceId: number | ""
  instances: Instance[]
  busy: boolean
  error: string
  onPrompt: (value: string) => void
  onNegative: (value: string) => void
  onWidth: (value: number) => void
  onHeight: (value: number) => void
  onSeed: (value: number) => void
  onInstance: (value: number | "") => void
  onSubmit: (event: FormEvent) => void
}

export function GenerationPanel(props: Props) {
  const ready = props.instances.filter((instance) => instance.ready)
  const field =
    "h-10 w-full border border-[#3a3e37] bg-[#20231f] px-3 text-[13px] text-[#e7e5dc] outline-none focus:border-[#bfc963]"
  return (
    <aside className="border-b border-[#30332e] px-5 py-8 md:border-r md:border-b-0 md:px-8 lg:px-10 lg:py-14">
      <div className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
        GENERATION DESK
      </div>
      <h1 className="my-5 font-['Fraunces'] text-[34px] leading-none text-[#f1eee5] lg:text-[39px]">
        Make something
        <br />
        <em className="text-[#cfdc6a]">strange.</em>
      </h1>
      <form className="grid max-w-[620px] gap-5" onSubmit={props.onSubmit}>
        <FormField label="Prompt">
          <textarea
            className="resize-y border border-[#3a3e37] bg-[#20231f] p-3 text-[13px] leading-relaxed text-[#e7e5dc] outline-none focus:border-[#bfc963]"
            rows={5}
            required
            value={props.prompt}
            onChange={(event) => props.onPrompt(event.target.value)}
            placeholder="a luminous creature in a glasshouse..."
          />
        </FormField>
        <FormField label="Negative prompt">
          <textarea
            className="resize-y border border-[#3a3e37] bg-[#20231f] p-3 text-[13px] leading-relaxed text-[#e7e5dc] outline-none focus:border-[#bfc963]"
            rows={3}
            value={props.negative}
            onChange={(event) => props.onNegative(event.target.value)}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Width">
            <input
              className={field}
              type="number"
              min={64}
              max={2048}
              step={64}
              value={props.width}
              onChange={(event) => props.onWidth(Number(event.target.value))}
            />
          </FormField>
          <FormField label="Height">
            <input
              className={field}
              type="number"
              min={64}
              max={2048}
              step={64}
              value={props.height}
              onChange={(event) => props.onHeight(Number(event.target.value))}
            />
          </FormField>
        </div>
        <FormField label="Seed">
          <div className="flex gap-1">
            <input
              className={field}
              type="number"
              value={props.seed}
              onChange={(event) => props.onSeed(Number(event.target.value))}
            />
            <Button
              className="w-10 border-[#3a3e37] bg-[#2a2d27] text-xl text-[#cfdc6a]"
              variant="secondary"
              type="button"
              title="Randomize seed"
              onClick={() => props.onSeed(randomSeed())}
            >
              ↻
            </Button>
          </div>
        </FormField>
        <FormField label="Ready instance">
          <select
            className={field}
            value={props.instanceId}
            required
            onChange={(event) =>
              props.onInstance(event.target.value ? Number(event.target.value) : "")
            }
          >
            <option value="">Select instance</option>
            {ready.map((instance) => (
              <option value={instance.id} key={instance.id}>
                #{instance.id} · {instance.gpu_name} · ${instance.dph_total.toFixed(2)}/h
              </option>
            ))}
          </select>
        </FormField>
        <Button
          className="flex justify-between px-4 py-3 text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
          variant="primary"
          disabled={props.busy || props.instanceId === ""}
          type="submit"
        >
          {props.busy ? "Queueing..." : "Generate image"}
          <span className="text-lg">↗</span>
        </Button>
        {props.error && <ErrorNotice>{props.error}</ErrorNotice>}
      </form>
      <div className="mt-10 grid gap-2 border-t border-[#30332e] pt-5">
        <span className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
          FIXED PIPELINE
        </span>
        <b className="font-['DM_Mono'] text-[11px] font-normal text-[#d7d9cb]">
          25 steps · CFG 7 · Euler A · Karras
        </b>
        <small className="text-[11px] text-[#777c70]">Pony Diffusion V6 XL</small>
      </div>
    </aside>
  )
}
