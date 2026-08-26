import { useState } from "react"
import { IconButton } from "../components/IconButton"
import { Modal } from "../components/Modal"
import { diffTags } from "../utils"
import { GalleryNavigation } from "./GalleryNavigation"

function DiffText({ value, previous }: { value: string; previous?: string }) {
  return (
    <span>
      {diffTags(value, previous).map((tag, index, tags) => (
        <span
          className={
            tag.kind === "added" ? "text-[#cfdc6a]" : tag.kind === "removed" ? "text-[#dc9b8f]" : ""
          }
          key={`${tag.text}-${index}`}
        >
          {tag.text}
          {index < tags.length - 1 ? ", " : ""}
        </span>
      ))}
    </span>
  )
}

export function ConfigViewer({
  config,
  previous,
  canGoPrevious,
  canGoNext,
  canJumpPrevious,
  canJumpNext,
  onDismiss,
  onPrevious,
  onNext,
  onJumpPrevious,
  onJumpNext,
}: {
  config: Config
  previous?: Config
  canGoPrevious: boolean
  canGoNext: boolean
  canJumpPrevious: boolean
  canJumpNext: boolean
  onDismiss: () => void
  onPrevious: () => void
  onNext: () => void
  onJumpPrevious: () => void
  onJumpNext: () => void
}) {
  const [diffMode, setDiffMode] = useState(false)
  return (
    <Modal
      className="relative"
      labelledBy="config-viewer-title"
      maxWidth="max-w-2xl"
      onBackdropClick={onDismiss}
    >
      <h2 className="font-['Fraunces'] text-xl text-[#e9e5dc]" id="config-viewer-title">
        Configuration
      </h2>
      <div className="absolute top-4 right-4 grid grid-cols-[auto_auto] gap-2">
        <IconButton
          aria-label="Toggle configuration diff mode"
          className={diffMode ? "border-[#cfdc6a] text-[#cfdc6a]" : ""}
          disabled={!previous}
          title={
            previous ? "Toggle configuration diff mode" : "No previous configuration to compare"
          }
          onClick={() => setDiffMode((enabled) => !enabled)}
        >
          <span aria-hidden="true" className="text-xs leading-none">
            Δ
          </span>
        </IconButton>
        <GalleryNavigation
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          className="flex gap-2"
          onPrevious={onPrevious}
          onNext={onNext}
        />
        <span />
        <div className="flex gap-2">
          <IconButton
            aria-label="Jump to previous configuration"
            disabled={!canJumpPrevious}
            title="Jump to previous configuration"
            onClick={onJumpPrevious}
          >
            <span aria-hidden="true" className="text-xs leading-none">
              ≪
            </span>
          </IconButton>
          <IconButton
            aria-label="Jump to next configuration"
            disabled={!canJumpNext}
            title="Jump to next configuration"
            onClick={onJumpNext}
          >
            <span aria-hidden="true" className="text-xs leading-none">
              ≫
            </span>
          </IconButton>
        </div>
      </div>
      <dl className="mt-5 grid gap-4 text-sm text-[#d7d8ce]">
        <div>
          <dt className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">PROMPT</dt>
          <dd className="mt-1 whitespace-pre-wrap">
            {diffMode ? (
              <DiffText value={config.prompt} previous={previous?.prompt} />
            ) : (
              config.prompt
            )}
          </dd>
        </div>
        <div>
          <dt className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
            NEGATIVE PROMPT
          </dt>
          <dd className="mt-1 whitespace-pre-wrap">
            {diffMode ? (
              <DiffText value={config.negative_prompt} previous={previous?.negative_prompt} />
            ) : (
              config.negative_prompt
            )}
          </dd>
        </div>
        <div>
          <dt className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
            DIMENSIONS
          </dt>
          <dd
            className={`mt-1 ${
              diffMode &&
              previous &&
              (config.width !== previous.width || config.height !== previous.height)
                ? "text-[#cfdc6a]"
                : ""
            }`}
          >
            {config.width} x {config.height}
          </dd>
        </div>
      </dl>
    </Modal>
  )
}
