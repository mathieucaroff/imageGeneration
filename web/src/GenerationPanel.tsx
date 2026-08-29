import clsx from "clsx"
import type { FormEvent, KeyboardEvent } from "react"
import { Button } from "./components/Button"
import { ErrorNotice } from "./components/ErrorNotice"
import { FormField } from "./components/FormField"
import { IconButton } from "./components/IconButton"
import { ResponsiveImage } from "./components/ResponsiveImage"
import { Switch } from "./components/Switch"

type Props = {
  prompt: string
  negative: string
  width: number
  height: number
  seed: number | ""
  randomizedSeed: boolean
  lastPreview?: GalleryPreview
  onOpenPreview: (preview: GalleryPreview) => void
  continuous: boolean
  generationDisabled: boolean
  retracted: boolean
  busy: boolean
  error: string
  onPrompt: (value: string) => void
  onNegative: (value: string) => void
  onWidth: (value: number) => void
  onHeight: (value: number) => void
  onSeed: (value: number | "") => void
  onRandomizedSeed: (value: boolean) => void
  onContinuous: (enabled: boolean) => void
  onRetract: () => void
  onSubmit: (event: FormEvent) => void
}

export function GenerationPanel(props: Props) {
  const field =
    "h-10 w-full border border-[#3a3e37] bg-[#20231f] px-3 text-[13px] text-[#e7e5dc] outline-none focus:border-[#bfc963]"
  function submitOnCtrlEnter(event: KeyboardEvent<HTMLFormElement>) {
    if (
      event.key === "Enter" &&
      event.ctrlKey &&
      (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault()
      event.currentTarget.requestSubmit()
    }
  }
  return (
    <aside
      className={clsx(
        "relative border-b border-[#30332e] px-5 py-8 md:sticky md:top-[68px] md:h-[calc(100vh-68px)] md:overflow-y-auto md:border-r md:border-b-0 md:px-8 lg:px-10 lg:py-14",
        { "md:hidden": props.retracted },
      )}
    >
      <IconButton
        className="absolute top-4 right-4 hidden text-lg md:grid"
        title="Retract generation panel"
        onClick={props.onRetract}
      >
        ‹
      </IconButton>
      <div className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
        GENERATION DESK
      </div>
      <h1 className="my-5 font-['Fraunces'] text-[34px] leading-none text-[#f1eee5] lg:text-[39px]">
        Make something
        <br />
        <em className="text-[#cfdc6a]">strange.</em>
      </h1>
      <div className="mb-3 border-y border-[#30332e] py-4">
        <div className="flex items-center justify-between">
          <span className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
            GENERATION MODE
          </span>
          <div className="flex border border-[#42473d]">
            <Button
              className="size-8 text-sm"
              title="One-at-a-time generation"
              variant={props.continuous ? "quiet" : "primary"}
              onClick={() => props.onContinuous(false)}
            >
              1
            </Button>
            <Button
              className="size-8 text-lg"
              title="Continuous generation"
              variant={props.continuous ? "primary" : "quiet"}
              onClick={() => props.onContinuous(true)}
            >
              ∞
            </Button>
          </div>
        </div>
      </div>
      <form
        className="grid max-w-[620px] gap-5"
        onKeyDown={submitOnCtrlEnter}
        onSubmit={props.onSubmit}
      >
        <FormField label="Prompt">
          <textarea
            className="resize-y border border-[#3a3e37] bg-[#20231f] p-3 text-[16px] leading-relaxed text-[#e7e5dc] outline-none focus:border-[#bfc963]"
            rows={12}
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
        <div className="grid gap-2 text-[11px] text-[#aeb1a5]">
          <div className="flex items-center justify-between gap-3">
            <span>Seed</span>
            <Switch
              checked={props.randomizedSeed}
              label="Randomized"
              onChange={props.onRandomizedSeed}
            />
          </div>
          <input
            className={`${field} disabled:cursor-not-allowed disabled:opacity-45`}
            disabled={props.randomizedSeed}
            type="number"
            value={props.seed}
            onChange={(event) => props.onSeed(event.target.value ? Number(event.target.value) : "")}
          />
        </div>
        <Button
          className="flex justify-between px-4 py-3 text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
          variant="primary"
          disabled={props.busy || props.generationDisabled}
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
      <section className="mt-8 border-t border-[#30332e] pt-5">
        <div className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
          LAST IMAGE VIEW
        </div>
        {props.lastPreview?.kind === "image" &&
        (props.lastPreview.job.thumbnailUrls?.length || props.lastPreview.job.imageUrls?.length) ? (
          <button
            className="mt-3 block w-full cursor-zoom-in outline-offset-4 outline-[#d4df6f]"
            title="View full image"
            type="button"
            onClick={() => props.onOpenPreview(props.lastPreview!)}
          >
            <ResponsiveImage
              alt={props.lastPreview.job.config.prompt}
              className="aspect-square w-full object-cover"
              imageUrls={props.lastPreview.job.imageUrls}
              sizes="390px"
              thumbnailUrls={props.lastPreview.job.thumbnailUrls}
              width={props.lastPreview.job.config.width}
            />
          </button>
        ) : props.lastPreview?.kind === "config" ? (
          <button
            className="mt-3 block w-full cursor-pointer border-[0.375rem] border-solid bg-[#080a08] p-3 text-left text-[#d7d8ce] outline-offset-4 outline-[#d4df6f] sm:border-[1rem]"
            style={{ borderColor: props.lastPreview.color }}
            title="View full configuration"
            type="button"
            onClick={() => props.onOpenPreview(props.lastPreview!)}
          >
            <div className="font-['DM_Mono'] text-[10px] font-bold tracking-[.14em]">CONFIG</div>
            <div className="mt-3 text-xs leading-relaxed whitespace-pre-wrap">
              {props.lastPreview.config.prompt}
            </div>
            <div className="mt-3 text-[10px] leading-relaxed whitespace-pre-wrap opacity-75">
              {props.lastPreview.config.negative_prompt}
            </div>
            <div className="mt-4 font-['DM_Mono'] text-[10px]">
              {props.lastPreview.config.width} x {props.lastPreview.config.height}
              <br />
              seed {props.lastPreview.config.seed}
            </div>
          </button>
        ) : (
          <div className="mt-3 grid aspect-square place-items-center border border-[#3a3e37] bg-[#20231f] px-5 text-center font-['DM_Mono'] text-[10px] text-[#777c70]">
            No completed images yet
          </div>
        )}
      </section>
    </aside>
  )
}
