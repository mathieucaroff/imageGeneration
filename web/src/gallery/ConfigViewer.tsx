import { Modal } from "../components/Modal"
import { GalleryNavigation } from "./GalleryNavigation"

export function ConfigViewer({
  config,
  canGoPrevious,
  canGoNext,
  onDismiss,
  onPrevious,
  onNext,
}: {
  config: Config
  canGoPrevious: boolean
  canGoNext: boolean
  onDismiss: () => void
  onPrevious: () => void
  onNext: () => void
}) {
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
      <GalleryNavigation
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        onPrevious={onPrevious}
        onNext={onNext}
      />
      <dl className="mt-5 grid gap-4 text-sm text-[#d7d8ce]">
        <div>
          <dt className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">PROMPT</dt>
          <dd className="mt-1 whitespace-pre-wrap">{config.prompt}</dd>
        </div>
        <div>
          <dt className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
            NEGATIVE PROMPT
          </dt>
          <dd className="mt-1 whitespace-pre-wrap">{config.negative_prompt}</dd>
        </div>
        <div>
          <dt className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
            DIMENSIONS
          </dt>
          <dd className="mt-1">
            {config.width} x {config.height}
          </dd>
        </div>
      </dl>
    </Modal>
  )
}
