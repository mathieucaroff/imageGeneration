import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { Button } from "./components/Button"
import { Modal } from "./components/Modal"
import { buildGalleryTiles, type GalleryPreview, type GalleryTile } from "./gallery-model"
import { diffTags, elapsedSeconds } from "./utils"

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

function ConfigTile({
  tile,
  onHover,
  onOpen,
}: {
  tile: Extract<GalleryTile, { kind: "config" }>
  onHover: () => void
  onOpen: () => void
}) {
  return (
    <button
      className="aspect-square w-[min(var(--tile-size),calc(100vw-2rem))] overflow-hidden rounded-3xl border-[0.375rem] bg-[#080a08] p-4 text-left text-[#d7d8ce] outline-offset-4 outline-[#d4df6f] sm:w-[min(var(--tile-size),calc(100vw-5rem))] sm:border-[1rem]"
      style={{ borderColor: tile.color }}
      title="View full configuration"
      type="button"
      onClick={onOpen}
      onMouseEnter={onHover}
      onFocus={onHover}
    >
      <div className="font-['DM_Mono'] text-[10px] font-bold tracking-[.14em]">CONFIG</div>
      <div className="mt-4 line-clamp-6 text-xs leading-relaxed">
        <DiffText value={tile.config.prompt} previous={tile.previous?.prompt} />
      </div>
      <div className="mt-3 line-clamp-3 text-[10px] leading-relaxed opacity-75">
        <DiffText value={tile.config.negative_prompt} previous={tile.previous?.negative_prompt} />
      </div>
      <div className="mt-4 font-['DM_Mono'] text-[10px]">
        <div
          className={
            tile.previous &&
            (tile.config.width !== tile.previous.width ||
              tile.config.height !== tile.previous.height)
              ? "font-bold"
              : ""
          }
        >
          {tile.config.width} x {tile.config.height}
        </div>
        <div className="mt-1">seed {tile.config.seed}</div>
      </div>
    </button>
  )
}

function JobTile({
  tile,
  now,
  zoom,
  onHover,
  onOpen,
  onResend,
}: {
  tile: Extract<GalleryTile, { kind: "job" }>
  now: number
  zoom: number
  onHover: () => void
  onOpen: () => void
  onResend: () => void
}) {
  const { job } = tile
  const imageUrl = zoom > 350 && job.imageUrl ? job.imageUrl : job.thumbnailUrl
  return (
    <article
      className="group relative aspect-square w-[min(var(--tile-size),calc(100vw-2rem))] overflow-hidden rounded-3xl border-[0.375rem] bg-[#080a08] sm:w-[min(var(--tile-size),calc(100vw-5rem))] sm:border-[1rem]"
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
          <span>
            {job.status === "queued" ? `Queued #${(job.position ?? 0) + 1}` : "Rendering"}
          </span>
          <span className="text-[10px]">
            {elapsedSeconds(job.createdAt, job.finishedAt ?? now)}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between bg-linear-to-t from-[#080a08dd] to-transparent p-2.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <span className="font-['DM_Mono'] text-[10px] text-[#d7d8ce]">{job.status}</span>
        <Button
          className="pointer-events-auto px-2 py-1.5 text-[11px] font-bold"
          variant="primary"
          onClick={onResend}
        >
          Re-send
        </Button>
      </div>
    </article>
  )
}

function ConfigViewer({ config, onDismiss }: { config: Config; onDismiss: () => void }) {
  return (
    <Modal labelledBy="config-viewer-title" maxWidth="max-w-2xl" onBackdropClick={onDismiss}>
      <h2 className="font-['Fraunces'] text-xl text-[#e9e5dc]" id="config-viewer-title">
        Configuration
      </h2>
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

export function Gallery({
  jobs,
  jobsLoaded,
  now,
  zoom,
  onRefresh,
  onResend,
  onHoverPreview,
}: {
  jobs: Job[]
  jobsLoaded: boolean
  now: number
  zoom: number
  onRefresh: () => Promise<void>
  onResend: (job: Job) => void
  onHoverPreview: (preview: GalleryPreview) => void
}) {
  const [selectedTile, setSelectedTile] = useState<GalleryTile>()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const tiles = useMemo(() => buildGalleryTiles(jobs), [jobs])
  useEffect(() => {
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTile(undefined)
    }
    window.addEventListener("keydown", dismissOnEscape)
    return () => window.removeEventListener("keydown", dismissOnEscape)
  }, [])
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
        <Button
          className="px-2 py-1 text-lg disabled:cursor-wait disabled:opacity-60"
          disabled={isRefreshing}
          title="Refresh instances and jobs"
          onClick={() => void refreshGallery()}
        >
          <span className={isRefreshing ? "inline-block animate-spin" : "inline-block"}>⟳</span>
        </Button>
      </div>
      {tiles.length > 0 && (
        <div
          className="flex flex-wrap pt-7"
          style={{ "--tile-size": `${zoom}px` } as CSSProperties}
        >
          {tiles.map((tile) =>
            tile.kind === "config" ? (
              <ConfigTile
                key={tile.id}
                tile={tile}
                onHover={() =>
                  onHoverPreview({ kind: "config", config: tile.config, color: tile.color })
                }
                onOpen={() => setSelectedTile(tile)}
              />
            ) : (
              <JobTile
                key={tile.id}
                tile={tile}
                now={now}
                zoom={zoom}
                onHover={() => onHoverPreview({ kind: "image", job: tile.job })}
                onOpen={() => setSelectedTile(tile)}
                onResend={() => onResend(tile.job)}
              />
            ),
          )}
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
      {selectedTile?.kind === "job" && selectedTile.job.imageUrl && (
        <Modal
          labelledBy="image-viewer-title"
          maxWidth="max-w-[calc(100vw-4rem)]"
          onBackdropClick={() => setSelectedTile(undefined)}
          unframed
        >
          <h2 className="sr-only" id="image-viewer-title">
            {selectedTile.job.config.prompt}
          </h2>
          <img
            className="max-h-[calc(100vh-4rem)] max-w-full object-contain"
            src={selectedTile.job.imageUrl}
            alt={selectedTile.job.config.prompt}
          />
        </Modal>
      )}
      {selectedTile?.kind === "config" && (
        <ConfigViewer config={selectedTile.config} onDismiss={() => setSelectedTile(undefined)} />
      )}
    </main>
  )
}
