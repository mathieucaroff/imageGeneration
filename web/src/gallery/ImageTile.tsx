import { useState } from "react"
import { Button } from "../components/Button"
import { IconButton } from "../components/IconButton"
import { ResponsiveImage } from "../components/ResponsiveImage"
import { elapsedSeconds } from "../utils"
import { CopyImageButton } from "./CopyImageButton"
import { GalleryTileFrame } from "./GalleryTileFrame"

export function ImageTile({
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
  onFail?: () => Promise<void>
  onToggleLike?: () => void
}) {
  const { job } = tile
  const imageUrls = zoom > 350 ? job.imageUrls : job.thumbnailUrls
  const [isFailing, setIsFailing] = useState(false)
  const isActive = job.status === "queued" || job.status === "running"

  async function failJob() {
    setIsFailing(true)
    try {
      await onFail?.()
    } finally {
      setIsFailing(false)
    }
  }

  return (
    <GalleryTileFrame
      buttonClassName="block size-full cursor-zoom-in"
      className="border-[length:min(1rem,calc(var(--tile-size)/25))] bg-[#080a08]"
      color={tile.color}
      content={
        job.status === "completed" && imageUrls?.length ? (
          <ResponsiveImage
            alt={job.config.prompt}
            className="size-full object-contain"
            imageUrls={job.imageUrls}
            sizes="var(--tile-size)"
            thumbnailUrls={job.thumbnailUrls}
            width={job.config.width}
          />
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
        )
      }
      style={{}}
      title="View full image"
      onHover={onHover}
      onOpen={onOpen}
    >
      {onToggleLike && (
        <IconButton
          aria-label={liked ? "Unlike image" : "Like image"}
          className={`absolute top-2 right-2 ${liked ? "border-[#f48aab] bg-[#f48aab] text-[#20241d] hover:border-[#ffb0c5] hover:text-[#20241d]" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
          title={liked ? "Unlike image" : "Like image"}
          onClick={onToggleLike}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {liked ? "♥" : "♡"}
          </span>
        </IconButton>
      )}
      <div className="absolute top-12 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <CopyImageButton imageUrls={job.imageUrls} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between bg-linear-to-t from-[#080a08dd] to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="font-['DM_Mono'] text-[10px] text-[#d7d8ce]">
          {job.status} · seed {job.config.seed}
        </span>
        <div className="pointer-events-auto flex gap-2">
          {isActive && onFail && (
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
    </GalleryTileFrame>
  )
}
