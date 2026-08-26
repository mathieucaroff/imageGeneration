import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { Button } from "./components/Button"
import { IconButton } from "./components/IconButton"
import { Modal } from "./components/Modal"
import { Switch } from "./components/Switch"
import { ConfigTile } from "./gallery/ConfigTile"
import { ConfigViewer } from "./gallery/ConfigViewer"
import { GalleryNavigation } from "./gallery/GalleryNavigation"
import { JobTile } from "./gallery/JobTile"
import { buildGalleryTiles } from "./gallery/model"

const likedImageStorageKey = "pony-studio.liked-image-ids.v1"

function loadLikedImageIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(likedImageStorageKey) ?? "[]")
    return new Set(
      Array.isArray(saved)
        ? saved.filter((value): value is string => typeof value === "string")
        : [],
    )
  } catch {
    return new Set<string>()
  }
}

export function Gallery({
  jobs,
  jobsLoaded,
  now,
  zoom,
  onRefresh,
  onResend,
  onFail,
  onSendConfig,
  onHoverPreview,
  previewToOpen,
  onPreviewOpened,
}: {
  jobs: Job[]
  jobsLoaded: boolean
  now: number
  zoom: number
  onRefresh: () => Promise<void>
  onResend: (job: Job) => void
  onFail: (job: Job) => Promise<void>
  onSendConfig: (config: Config) => void
  onHoverPreview: (preview: GalleryPreview) => void
  previewToOpen?: GalleryPreview
  onPreviewOpened: () => void
}) {
  const [selectedTile, setSelectedTile] = useState<GalleryTile>()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [likedImageIds, setLikedImageIds] = useState(loadLikedImageIds)
  const [likedOnly, setLikedOnly] = useState(false)
  const visibleJobs = useMemo(
    () => (likedOnly ? jobs.filter((job) => likedImageIds.has(job.id)) : jobs),
    [jobs, likedImageIds, likedOnly],
  )
  const tiles = useMemo(() => buildGalleryTiles(visibleJobs), [visibleJobs])
  const selectedTileIndex = selectedTile
    ? tiles.findIndex((tile) => tile.id === selectedTile.id)
    : -1
  const configTileIndices = tiles.flatMap((tile, index) => (tile.kind === "config" ? [index] : []))
  const selectedConfigIndex = configTileIndices.indexOf(selectedTileIndex)

  useEffect(() => {
    if (!previewToOpen) return
    const matchingTile = tiles.find((tile) =>
      previewToOpen.kind === "image"
        ? tile.kind === "job" && tile.job.id === previewToOpen.job.id
        : tile.kind === "config" &&
          JSON.stringify(tile.config) === JSON.stringify(previewToOpen.config),
    )
    if (matchingTile) setSelectedTile(matchingTile)
    onPreviewOpened()
  }, [previewToOpen, tiles, onPreviewOpened])

  function selectAdjacentTile(offset: -1 | 1) {
    const adjacentTile = tiles[selectedTileIndex + offset]
    if (adjacentTile) setSelectedTile(adjacentTile)
  }
  function selectAdjacentConfig(offset: -1 | 1) {
    const targetIndex = configTileIndices[selectedConfigIndex + offset]
    if (targetIndex !== undefined) setSelectedTile(tiles[targetIndex])
  }

  function toggleLike(jobId: string) {
    setLikedImageIds((current) => {
      const next = new Set(current)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      localStorage.setItem(likedImageStorageKey, JSON.stringify([...next]))
      return next
    })
  }

  useEffect(() => {
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTile(undefined)
      if (selectedTile && event.key === "ArrowLeft") selectAdjacentTile(-1)
      if (selectedTile && event.key === "ArrowRight") selectAdjacentTile(1)
    }
    window.addEventListener("keydown", dismissOnEscape)
    return () => window.removeEventListener("keydown", dismissOnEscape)
  }, [selectedTileIndex, tiles])

  async function refreshGallery() {
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <main className="min-w-0 px-3 py-7 sm:px-6 md:px-10 md:py-11">
      <div className="mb-6 flex items-end justify-between gap-5">
        <div>
          <div className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
            OUTPUT ARCHIVE
          </div>
          <h2 className="mt-2 text-[25px] font-bold tracking-tight">
            Generations{" "}
            <span className="ml-1 font-['DM_Mono'] text-xs text-[#8d9286]">
              {jobs.filter((job) => job.status !== "failed").length}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={likedOnly} label="Liked only" onChange={setLikedOnly} />
          <Button
            className="px-2 py-1 text-lg disabled:cursor-wait disabled:opacity-60"
            disabled={isRefreshing}
            title="Refresh instances and jobs"
            onClick={() => void refreshGallery()}
          >
            <span className={isRefreshing ? "inline-block animate-spin" : "inline-block"}>⟳</span>
          </Button>
        </div>
      </div>
      {tiles.length > 0 && (
        <div
          className="flex flex-wrap pt-7"
          style={{ "--tile-size": `${zoom}px` } as CSSProperties}
        >
          {tiles.map((tile) => (
            <div key={tile.id} className="border-1 border-black">
              {tile.kind === "config" ? (
                <ConfigTile
                  tile={tile}
                  onHover={() =>
                    onHoverPreview({ kind: "config", config: tile.config, color: tile.color })
                  }
                  onOpen={() => setSelectedTile(tile)}
                  onSend={() => onSendConfig(tile.config)}
                />
              ) : (
                <JobTile
                  tile={tile}
                  now={now}
                  zoom={zoom}
                  liked={likedImageIds.has(tile.job.id)}
                  onHover={() => onHoverPreview({ kind: "image", job: tile.job })}
                  onOpen={() => setSelectedTile(tile)}
                  onResend={() => onResend(tile.job)}
                  onFail={() => onFail(tile.job)}
                  onToggleLike={() => toggleLike(tile.job.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {!jobs.length && !jobsLoaded && (
        <div className="grid min-h-[380px] place-content-center justify-items-center text-center text-[#858a7e]">
          <div className="mb-4 size-8 animate-spin rounded-full border-2 border-[#596047] border-t-[#cfdc6a]" />
          <h3 className="mb-2 font-['Fraunces'] text-xl text-[#d9d9ce]">Gathering your archive</h3>
          <p className="text-xs">Just a moment while we bring your images in.</p>
        </div>
      )}
      {!jobs.length && jobsLoaded && (
        <div className="grid min-h-[380px] place-content-center justify-items-center text-center text-[#858a7e]">
          <div className="mb-4 grid size-[70px] place-items-center rounded-full border border-[#596047] text-2xl text-[#cfdc6a]">
            ✦
          </div>
          <h3 className="mb-2 font-['Fraunces'] text-xl text-[#d9d9ce]">Your archive is quiet</h3>
          <p className="text-xs">Write a prompt and send your first image into the queue.</p>
        </div>
      )}
      {selectedTile?.kind === "job" && (
        <Modal
          className="relative"
          labelledBy="image-viewer-title"
          maxWidth="max-w-[calc(100vw-4rem)]"
          onBackdropClick={() => setSelectedTile(undefined)}
          unframed
        >
          <h2 className="sr-only" id="image-viewer-title">
            {selectedTile.job.config.prompt}
          </h2>
          <GalleryNavigation
            canGoPrevious={selectedTileIndex > 0}
            canGoNext={selectedTileIndex >= 0 && selectedTileIndex < tiles.length - 1}
            onPrevious={() => selectAdjacentTile(-1)}
            onNext={() => selectAdjacentTile(1)}
          />
          <IconButton
            className={`absolute top-14 right-4 ${
              likedImageIds.has(selectedTile.job.id)
                ? "border-[#f48aab] bg-[#f48aab] text-[#20241d] hover:border-[#ffb0c5] hover:text-[#20241d]"
                : ""
            }`}
            title={likedImageIds.has(selectedTile.job.id) ? "Unlike image" : "Like image"}
            onClick={() => toggleLike(selectedTile.job.id)}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {likedImageIds.has(selectedTile.job.id) ? "♥" : "♡"}
            </span>
          </IconButton>
          {selectedTile.job.imageUrl ? (
            <img
              className="max-h-[calc(100vh-4rem)] max-w-full object-contain"
              src={selectedTile.job.imageUrl}
              alt={selectedTile.job.config.prompt}
            />
          ) : (
            <div className="grid min-h-48 min-w-72 place-items-center bg-[#20231f] px-16 text-sm text-[#aeb1a5]">
              Full-size image is not available yet.
            </div>
          )}
        </Modal>
      )}
      {selectedTile?.kind === "config" && (
        <ConfigViewer
          config={selectedTile.config}
          previous={selectedTile.previous}
          canGoPrevious={selectedTileIndex > 0}
          canGoNext={selectedTileIndex >= 0 && selectedTileIndex < tiles.length - 1}
          canJumpPrevious={selectedConfigIndex > 0}
          canJumpNext={
            selectedConfigIndex >= 0 && selectedConfigIndex < configTileIndices.length - 1
          }
          onDismiss={() => setSelectedTile(undefined)}
          onPrevious={() => selectAdjacentTile(-1)}
          onNext={() => selectAdjacentTile(1)}
          onJumpPrevious={() => selectAdjacentConfig(-1)}
          onJumpNext={() => selectAdjacentConfig(1)}
        />
      )}
    </main>
  )
}
