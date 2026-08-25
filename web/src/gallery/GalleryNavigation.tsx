import { IconButton } from "../components/IconButton"

export function GalleryNavigation({
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: {
  canGoPrevious: boolean
  canGoNext: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="absolute top-4 right-4 flex gap-2">
      <IconButton
        aria-label="Previous gallery item"
        disabled={!canGoPrevious}
        title="Previous gallery item"
        onClick={onPrevious}
      >
        <span aria-hidden="true" className="text-xl leading-none">
          ‹
        </span>
      </IconButton>
      <IconButton
        aria-label="Next gallery item"
        disabled={!canGoNext}
        title="Next gallery item"
        onClick={onNext}
      >
        <span aria-hidden="true" className="text-xl leading-none">
          ›
        </span>
      </IconButton>
    </div>
  )
}
