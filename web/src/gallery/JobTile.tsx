import { useState } from "react"
import { Button } from "../components/Button"
import { IconButton } from "../components/IconButton"
import { CopyImageButton } from "./CopyImageButton"
import { elapsedSeconds } from "../utils"

export function JobTile({
  tile,
  now,
  zoom,
  liked,
  onHover,
  onOpen,
  onFail,
  onToggleLike,
}: {
  tile: Extract<GalleryTile, { kind: "job" }>
  now: number
  zoom: number
  liked: boolean
  onHover: () => void
  onOpen: () => void
  onFail: () => Promise<void>
  onToggleLike: () => void
}) {
  const { job } = tile
  const imageUrl = zoom > 350 && job.imageUrl ? job.imageUrl : job.thumbnailUrl
  const [isFailing, setIsFailing] = useState(false)
  const isActive = job.status === "queued" || job.status === "running"

  async function failJob() {
    setIsFailing(true)
    try {
      await onFail()
    } finally {
      setIsFailing(false)
    }
  }

  return (
    <article
      className="group relative aspect-square w-[min(var(--tile-size),calc(100vw-2rem))] overflow-hidden border-[length:min(1rem,calc(var(--tile-size)/25))] bg-[#080a08] sm:w-[min(var(--tile-size),calc(100vw-5rem))]"
      style={{ borderColor: tile.color }}
    >
      {job.status === "completed" && imageUrl ? (
        <button
          className="block size-full cursor-zoom-in"
          title="View full image"
          type="button"
          onClick={onOpen}
          onMouseEnter={onHover}
          onFocus={onHover}
        >
          <img className="size-full object-contain" src={imageUrl} alt={job.config.prompt} />
        </button>
      ) : (
        <div className="grid size-full place-content-center justify-items-center gap-2 p-5 text-center font-['DM_Mono'] text-xs text-[#d7d8ce]">
          {job.status === "queued" ? (
            <>
              <span>Queued #{(job.position ?? 0) + 1}</span>
              <span className="text-[10px]">{elapsedSeconds(job.createdAt, now)}</span>
            </>
          ) : (
            <>
              <span>Rendering</span>
              <span className="text-[10px]">
                Queue: {elapsedSeconds(job.createdAt, job.startedAt!)}
              </span>
              <span className="text-[10px]">
                Rendering: {elapsedSeconds(job.startedAt, job.finishedAt ?? now)}
              </span>
            </>
          )}
        </div>
      )}
      <IconButton
        aria-label={liked ? "Unlike image" : "Like image"}
        className={`absolute top-2 right-2 ${
          liked
            ? "border-[#f48aab] bg-[#f48aab] text-[#20241d] hover:border-[#ffb0c5] hover:text-[#20241d]"
            : "opacity-0 group-hover:opacity-100 focus:opacity-100"
        }`}
        title={liked ? "Unlike image" : "Like image"}
        onClick={onToggleLike}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          {liked ? "♥" : "♡"}
        </span>
      </IconButton>
      <div className="absolute top-12 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <CopyImageButton imageUrl={job.imageUrl} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between bg-linear-to-t from-[#080a08dd] to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="font-['DM_Mono'] text-[10px] text-[#d7d8ce]">
          {job.status} · seed {job.config.seed}
        </span>
        <div className="pointer-events-auto flex gap-2">
          {isActive && (
            <Button
              className="px-2 py-1.5 text-[11px] font-bold disabled:cursor-wait disabled:opacity-60"
              disabled={isFailing}
              variant="danger"
              onClick={() => void failJob()}
            >
              {isFailing ? "Failing..." : "Fail"}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
