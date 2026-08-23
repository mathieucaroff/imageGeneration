import { useState, type CSSProperties } from "react"
import { Button } from "./components/Button"
import { Modal } from "./components/Modal"
import { diffTags, elapsedSeconds } from "./utils"

function DiffText({ value, previous }: { value: string; previous?: string }) {
  const diff = diffTags(value, previous)
  return (
    <span>
      {diff.map((tag, index) => (
        <span
          className={
            tag.kind === "added" ? "text-[#cfdc6a]" : tag.kind === "removed" ? "text-[#dc9b8f]" : ""
          }
          key={`${tag.text}-${index}`}
        >
          {tag.text}
          {index < diff.length - 1 ? ", " : ""}
        </span>
      ))}
    </span>
  )
}

function JobTile({
  job,
  previous,
  onResend,
  onOpen,
  now,
  zoom,
}: {
  job: Job
  previous?: Config
  onResend: () => void
  onOpen: () => void
  now: number
  zoom: number
}) {
  const imageUrl = zoom > 350 && job.imageUrl ? job.imageUrl : job.thumbnailUrl
  return (
    <article className="w-[min(var(--tile-size),100%)] max-w-full min-w-0">
      <div className="group relative aspect-square overflow-hidden bg-[#10120f]">
        {job.status === "completed" && imageUrl ? (
          <button
            className="block size-full cursor-zoom-in"
            type="button"
            title="View full image"
            onClick={onOpen}
          >
            <img className="size-full object-cover" src={imageUrl} alt={job.config.prompt} />
          </button>
        ) : (
          <div
            className={`grid size-full place-content-center justify-items-center gap-2 p-5 text-center font-['DM_Mono'] text-xs ${job.status === "failed" ? "text-[#dc9b8f]" : "text-[#cfdc6a]"}`}
          >
            <span>
              {job.status === "queued"
                ? `#${(job.position ?? 0) + 1}`
                : job.status === "running"
                  ? "Rendering"
                  : "Failed"}
            </span>
            {job.error && (
              <small className="font-['DM_Sans'] text-[10px] break-all text-[#a5a99e]">
                {job.error}
              </small>
            )}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex justify-end bg-linear-to-t from-[#080a08dd] to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            className="px-2 py-1.5 text-[11px] font-bold"
            variant="primary"
            onClick={onResend}
          >
            ↻ Re-send
          </Button>
        </div>
      </div>
      <div className="pt-3">
        <div className="min-h-[34px] text-xs leading-snug text-[#d7d8ce]">
          <DiffText value={job.config.prompt} previous={previous?.prompt} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2.5 font-['DM_Mono'] text-[10px] text-[#888e82]">
          <span>
            {job.config.width}×{job.config.height}
          </span>
          <span className={previous && previous.seed !== job.config.seed ? "text-[#cfdc6a]" : ""}>
            seed {job.config.seed}
          </span>
          <span>{elapsedSeconds(job.createdAt, job.finishedAt ?? now)}</span>
          <span className="ml-auto uppercase">{job.status}</span>
        </div>
      </div>
    </article>
  )
}

type Block = { id: string; jobs: Job[] }
export function Gallery({
  jobs,
  blocks,
  previous,
  now,
  zoom,
  onZoom,
  onRefresh,
  onResend,
}: {
  jobs: Job[]
  blocks: Block[]
  previous?: Config
  now: number
  zoom: number
  onZoom: (value: number) => void
  onRefresh: () => void
  onResend: (job: Job) => void
}) {
  const [selectedJob, setSelectedJob] = useState<Job>()
  const groupedIds = new Set(blocks.flatMap((block) => block.jobs.map((job) => job.id)))
  const ungrouped = jobs.filter((job) => !groupedIds.has(job.id))
  return (
    <main className="min-w-0 px-3 py-7 sm:px-6 md:px-10 md:py-11">
      <div className="mb-6 flex flex-col items-start justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <div className="font-['DM_Mono'] text-[10px] tracking-[.14em] text-[#8d9286]">
            OUTPUT ARCHIVE
          </div>
          <h2 className="mt-2 text-[25px] font-bold tracking-tight">
            Generations{" "}
            <span className="ml-1 font-['DM_Mono'] text-xs text-[#8d9286]">{jobs.length}</span>
          </h2>
        </div>
        <div className="flex w-full items-center justify-between gap-4 sm:w-auto">
          <label className="flex flex-1 items-center gap-2 text-[11px] whitespace-nowrap text-[#aeb1a5] sm:flex-none">
            Tile size
            <input
              className="h-auto w-full accent-[#cfdc6a] sm:w-[400px]"
              type="range"
              min="30"
              max="900"
              value={zoom}
              onChange={(event) => onZoom(Number(event.target.value))}
            />
            <output className="min-w-12 font-['DM_Mono'] text-[11px] text-[#cfdc6a]">
              {zoom}px
            </output>
          </label>
          <Button
            className="px-2 py-1 text-lg"
            title="Refresh instances and jobs"
            onClick={onRefresh}
          >
            ⟳
          </Button>
        </div>
      </div>
      <div className="grid gap-7 pt-7" style={{ "--tile-size": `${zoom}px` } as CSSProperties}>
        {blocks.map((block, index) => (
          <section
            className="hidden min-w-0 border border-[hsl(var(--block-hue)_13%_25%)] bg-[hsl(var(--block-hue)_14%_17%)] p-3.5"
            key={block.id}
            style={{ "--block-hue": `${(index * 71 + 24) % 360}` } as CSSProperties}
          >
            <div className="mb-3 flex justify-between font-['DM_Mono'] text-[10px] tracking-[.1em] text-[#999e91]">
              <span>SET {String(index + 1).padStart(2, "0")}</span>
              <span>
                {block.jobs.length} image{block.jobs.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex flex-wrap items-start gap-3">
              {block.jobs.map((job) => (
                <JobTile
                  job={job}
                  previous={previous}
                  onResend={() => onResend(job)}
                  onOpen={() => setSelectedJob(job)}
                  now={now}
                  zoom={zoom}
                  key={job.id}
                />
              ))}
            </div>
          </section>
        ))}
        {ungrouped.map((job) => (
          <section className="min-w-0 border border-[#393f34] bg-[#20231f] p-3.5" key={job.id}>
            <div className="mb-3 font-['DM_Mono'] text-[10px] tracking-[.1em] text-[#999e91]">
              SET
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <JobTile
                job={job}
                previous={previous}
                onResend={() => onResend(job)}
                onOpen={() => setSelectedJob(job)}
                now={now}
                zoom={zoom}
              />
            </div>
          </section>
        ))}
        {!jobs.length && (
          <div className="grid min-h-[380px] place-content-center justify-items-center text-center text-[#858a7e]">
            <div className="mb-4 grid size-[70px] place-items-center rounded-full border border-[#596047] text-2xl text-[#cfdc6a]">
              ✦
            </div>
            <h3 className="mb-2 font-['Fraunces'] text-xl text-[#d9d9ce]">Your archive is quiet</h3>
            <p className="text-xs">Write a prompt and send your first image into the queue.</p>
          </div>
        )}
      </div>
      {selectedJob?.imageUrl && (
        <Modal
          labelledBy="image-viewer-title"
          maxWidth="max-w-[calc(100vw-4rem)]"
          onBackdropClick={() => setSelectedJob(undefined)}
          unframed
        >
          <h2 className="sr-only" id="image-viewer-title">
            {selectedJob.config.prompt}
          </h2>
          <img
            className="max-h-[calc(100vh-4rem)] max-w-full object-contain"
            src={selectedJob.imageUrl}
            alt={selectedJob.config.prompt}
          />
        </Modal>
      )}
    </main>
  )
}
