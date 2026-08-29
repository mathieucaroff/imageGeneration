import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { api } from "./api"
import { Button } from "./components/Button"
import { IconButton } from "./components/IconButton"
import { Modal } from "./components/Modal"
import { ResponsiveImage } from "./components/ResponsiveImage"
import { Select } from "./components/Select"
import { Switch } from "./components/Switch"
import { ConfigTile } from "./gallery/ConfigTile"
import { ConfigViewer } from "./gallery/ConfigViewer"
import { CopyImageButton } from "./gallery/CopyImageButton"
import { GalleryNavigation } from "./gallery/GalleryNavigation"
import { JobTile } from "./gallery/JobTile"
import { buildGalleryTiles } from "./gallery/model"

type TileDisplay = "both" | "config" | "image"
type ConfigPosition = "top" | "bottom"

export function Gallery({
  jobs,
  jobsLoaded,
  now,
  zoom,
  onRefresh,
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
  onFail: (job: Job) => Promise<void>
  onSendConfig: (config: Config) => void
  onHoverPreview: (preview: GalleryPreview) => void
  previewToOpen?: GalleryPreview
  onPreviewOpened: () => void
}) {
  const [selectedTile, setSelectedTile] = useState<GalleryTile>()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [likedImageIds, setLikedImageIds] = useState<Set<string>>(new Set())
  const [likedOnly, setLikedOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [tileDisplay, setTileDisplay] = useState<TileDisplay>("both")
  const [configPosition, setConfigPosition] = useState<ConfigPosition>("top")
  const visibleJobs = useMemo(() => {
    const components = search.trim().split(/\s+/).filter(Boolean)
    return jobs.filter(
      (job) =>
        (!likedOnly || likedImageIds.has(job.id)) &&
        components.every((component) => job.config.prompt.includes(component)),
    )
  }, [jobs, likedImageIds, likedOnly, search])
  const tiles = useMemo(() => buildGalleryTiles(visibleJobs), [visibleJobs])
  const chronologicalTiles = useMemo(() => {
    const positionedTiles =
      configPosition === "top"
        ? tiles
        : tiles.flatMap((tile, index) => {
            if (tile.kind !== "config") return []
            const nextConfigIndex = tiles.findIndex(
              (candidate, candidateIndex) => candidateIndex > index && candidate.kind === "config",
            )
            const images = tiles.slice(index + 1, nextConfigIndex < 0 ? undefined : nextConfigIndex)
            return [...images, tile]
          })
    return positionedTiles
      .filter(
        (tile) =>
          tileDisplay === "both" ||
          tile.kind === tileDisplay ||
          (tile.kind === "job" && tileDisplay === "image"),
      )
      .toReversed()
  }, [configPosition, tileDisplay, tiles])
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

  useEffect(() => {
    let cancelled = false
    void api<{ ids: string[] }>("/likes")
      .then(({ ids }) => {
        if (!cancelled) setLikedImageIds(new Set(ids))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  function toggleLike(jobId: string) {
    const liked = !likedImageIds.has(jobId)
    void api<{ ids: string[] }>(`/likes/${jobId}`, {
      method: "PUT",
      body: JSON.stringify({ liked }),
    }).then(({ ids }) => setLikedImageIds(new Set(ids)))
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
          <Select
            aria-label="Configuration tile position"
            className="h-8 border border-[#42473d] bg-[#20231f] px-2 text-xs text-[#d7d8ce] outline-none focus:border-[#cfdc6a]"
            value={configPosition}
            onChange={(event) => setConfigPosition(event.target.value as ConfigPosition)}
          >
            <option value="top">Config at top</option>
            <option value="bottom">Config at bottom</option>
          </Select>
          <Select
            aria-label="Gallery content"
            className="h-8 border border-[#42473d] bg-[#20231f] px-2 text-xs text-[#d7d8ce] outline-none focus:border-[#cfdc6a]"
            value={tileDisplay}
            onChange={(event) => setTileDisplay(event.target.value as TileDisplay)}
          >
            <option value="both">Both</option>
            <option value="config">Config only</option>
            <option value="image">Image only</option>
          </Select>
          <input
            aria-label="Search prompts"
            className="h-8 w-36 border border-[#42473d] bg-[#20231f] px-2 text-xs text-[#d7d8ce] outline-none placeholder:text-[#777c70] focus:border-[#cfdc6a] sm:w-52"
            placeholder="Search prompts"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
      {chronologicalTiles.length > 0 && (
        <div
          className="flex flex-row-reverse flex-wrap-reverse pt-7"
          style={{ "--tile-size": `${zoom}px` } as CSSProperties}
        >
          {chronologicalTiles.map((tile) => (
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
          <div className="absolute top-24 right-4">
            <CopyImageButton imageUrls={selectedTile.job.imageUrls} />
          </div>
          {selectedTile.job.imageUrls?.length ? (
            <ResponsiveImage
              className="max-h-[calc(100vh-4rem)] max-w-full object-contain"
              alt={selectedTile.job.config.prompt}
              imageUrls={selectedTile.job.imageUrls}
              sizes="100vw"
              width={selectedTile.job.config.width}
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
