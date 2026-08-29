import { useEffect, useRef, useState, type FormEvent } from "react"
import { api } from "./api"
import { Button } from "./components/Button"
import { IconButton } from "./components/IconButton"
import { StatusIndicator } from "./components/StatusIndicator"
import { Fleet } from "./Fleet"
import { Gallery } from "./Gallery"
import { GenerationPanel } from "./GenerationPanel"
import { Login } from "./Login"
import { clamp, randomSeed } from "./utils"

const defaultNegative = "score_4, score_5, score_6, worst quality, low quality, blurry"
const generationConfigStorageKey = "pony-studio.generation-config.v1"

function loadGenerationConfig(): SavedGenerationConfig {
  const defaults: SavedGenerationConfig = {
    prompt: "",
    negative: defaultNegative,
    width: 1024,
    height: 1024,
    seed: randomSeed(),
    randomizedSeed: false,
    instanceId: "",
    continuous: false,
  }
  if (typeof window === "undefined") return defaults
  try {
    const value = localStorage.getItem(generationConfigStorageKey)
    if (!value) return defaults
    const saved = JSON.parse(value) as Partial<SavedGenerationConfig>
    const randomizedSeed =
      typeof saved.randomizedSeed === "boolean" ? saved.randomizedSeed : defaults.randomizedSeed
    return {
      prompt: typeof saved.prompt === "string" ? saved.prompt : defaults.prompt,
      negative: typeof saved.negative === "string" ? saved.negative : defaults.negative,
      width: Number.isFinite(saved.width) ? saved.width! : defaults.width,
      height: Number.isFinite(saved.height) ? saved.height! : defaults.height,
      seed: randomizedSeed ? "" : Number.isFinite(saved.seed) ? saved.seed! : defaults.seed,
      randomizedSeed,
      instanceId: Number.isInteger(saved.instanceId) ? saved.instanceId! : defaults.instanceId,
      continuous: typeof saved.continuous === "boolean" ? saved.continuous : defaults.continuous,
    }
  } catch {
    return defaults
  }
}

export function App() {
  const [savedGenerationConfig] = useState(loadGenerationConfig)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [instances, setInstances] = useState<Instance[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoaded, setJobsLoaded] = useState(false)
  const [prompt, setPrompt] = useState(savedGenerationConfig.prompt)
  const [negative, setNegative] = useState(savedGenerationConfig.negative)
  const [width, setWidth] = useState(savedGenerationConfig.width)
  const [height, setHeight] = useState(savedGenerationConfig.height)
  const [seed, setSeed] = useState<number | "">(savedGenerationConfig.seed)
  const [randomizedSeed, setRandomizedSeed] = useState(savedGenerationConfig.randomizedSeed)
  const [instanceId, setInstanceId] = useState<number | "">(savedGenerationConfig.instanceId)
  const [zoom, setZoom] = useState(260)
  const [generationPanelRetracted, setGenerationPanelRetracted] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [continuous, setContinuous] = useState(savedGenerationConfig.continuous)
  const [continuousRetry, setContinuousRetry] = useState(0)
  const [lastPreview, setLastPreview] = useState<GalleryPreview>()
  const [previewToOpen, setPreviewToOpen] = useState<GalleryPreview>()
  const [now, setNow] = useState(Date.now())
  const galleryRef = useRef<HTMLDivElement>(null)

  async function refresh() {
    const [nextInstances, nextJobs] = await Promise.all([
      api<Instance[]>("/instances"),
      api<Job[]>("/jobs"),
    ])
    setInstances(nextInstances)
    setJobs(nextJobs)
    setJobsLoaded(true)
    if (instanceId === "") {
      const ready = nextInstances.find((instance) => instance.ready)
      if (ready) setInstanceId(ready.id)
    }
  }
  useEffect(() => {
    api<{ authenticated: boolean }>("/auth/session")
      .then((data) => {
        setAuthenticated(data.authenticated)
        if (data.authenticated) void refresh()
      })
      .catch(() => setAuthenticated(false))
  }, [])
  useEffect(() => {
    if (!authenticated) return
    const events = new EventSource("/api/events")
    events.addEventListener("job", () => void refresh())
    const timer = window.setInterval(() => void refresh(), 10000)
    return () => {
      events.close()
      window.clearInterval(timer)
    }
  }, [authenticated])
  const hasLiveAge =
    instances.some((instance) => !instance.ready) ||
    jobs.some((job) => job.status === "queued" || job.status === "running")
  useEffect(() => {
    if (!hasLiveAge) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [hasLiveAge])
  useEffect(() => {
    try {
      localStorage.setItem(
        generationConfigStorageKey,
        JSON.stringify({
          prompt,
          negative,
          width,
          height,
          seed,
          randomizedSeed,
          instanceId,
          continuous,
        }),
      )
    } catch {
      /* The form remains usable when browser storage is unavailable. */
    }
  }, [prompt, negative, width, height, seed, randomizedSeed, instanceId, continuous])

  async function createJob(config: Config, maxQueued?: number) {
    const result = await api<CreateJobResult>("/jobs", {
      method: "POST",
      body: JSON.stringify({ ...config, maxQueued }),
    })
    if (result.queued) setJobs((current) => [result.job, ...current])
    return result
  }
  async function submit(config: Config) {
    setBusy(true)
    setError("")
    try {
      await createJob(config)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not queue generation")
    } finally {
      setBusy(false)
    }
  }
  function generate(event: FormEvent) {
    event.preventDefault()
    if (instanceId === "") {
      setError("Choose a ready instance first.")
      return
    }
    const jobSeed = randomizedSeed ? randomSeed() : seed
    if (jobSeed === "") {
      setError("Enter a seed or enable randomized mode.")
      return
    }
    void submit({
      prompt,
      negative_prompt: negative,
      width,
      height,
      seed: jobSeed,
      instanceId,
    })
  }
  async function failJob(job: Job) {
    setError("")
    try {
      await api(`/jobs/${job.id}/fail`, { method: "POST" })
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not fail generation")
      throw reason
    }
  }
  async function instanceAction(path: string, init?: RequestInit) {
    setError("")
    try {
      await api(path, init)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Instance action failed")
    }
  }

  const lastCompletedImageId = useRef<string | undefined>(undefined)
  useEffect(() => {
    const lastCompletedImage = jobs
      .filter(
        (job) => job.status === "completed" && (job.thumbnailUrls?.length || job.imageUrls?.length),
      )
      .sort(
        (first, second) =>
          Date.parse(second.finishedAt ?? second.createdAt) -
          Date.parse(first.finishedAt ?? first.createdAt),
      )[0]
    if (lastCompletedImage && lastCompletedImage.id !== lastCompletedImageId.current) {
      lastCompletedImageId.current = lastCompletedImage.id
      setLastPreview({ kind: "image", job: lastCompletedImage })
    }
  }, [jobs])
  const continuousAttempting = useRef(false)
  const continuousRetryDelay = useRef(1000)
  const continuousRetryTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    return () => {
      if (continuousRetryTimer.current !== undefined) {
        window.clearTimeout(continuousRetryTimer.current)
        continuousRetryTimer.current = undefined
      }
    }
  }, [continuous, instanceId])
  useEffect(() => {
    if (!continuous || !instanceId) return
    const selectedInstance = instances.find((instance) => instance.id === instanceId)
    if (!selectedInstance?.ready) return
    const instanceJobs = jobs.filter((job) => job.config.instanceId === instanceId)
    if (instanceJobs.some((job) => job.status === "queued") || continuousAttempting.current) return
    const newestFirst = (first: Job, second: Job) =>
      Date.parse(second.startedAt ?? second.createdAt) -
      Date.parse(first.startedAt ?? first.createdAt)
    const source =
      instanceJobs.filter((job) => job.status === "running").toSorted(newestFirst)[0] ??
      instanceJobs.filter((job) => job.status !== "failed").toSorted(newestFirst)[0]
    if (!source) return
    continuousAttempting.current = true
    void createJob({ ...source.config, seed: randomSeed(), instanceId }, 1)
      .then(() => {
        continuousRetryDelay.current = 1000
        continuousAttempting.current = false
      })
      .catch(() => {
        const delay = continuousRetryDelay.current
        if (delay >= 128000) {
          setContinuous(false)
          setError("Continuous generation stopped after repeated queueing failures.")
          return
        }
        continuousRetryDelay.current = Math.min(delay * 2, 128000)
        continuousRetryTimer.current = window.setTimeout(() => {
          continuousRetryTimer.current = undefined
          continuousAttempting.current = false
          setContinuousRetry((current) => current + 1)
        }, delay)
      })
  }, [continuous, continuousRetry, instanceId, instances, jobs])

  function adjustZoom(direction: -1 | 1) {
    setZoom((currentZoom) => {
      if (!galleryRef.current) return clamp(currentZoom + direction * 10, 30, 900)
      const width = galleryRef.current.clientWidth
      const floorCount = Math.floor(width / currentZoom)
      const floorZoom = Math.floor(width / (floorCount - direction) - 0.01)
      return clamp(floorZoom, 30, 900)
    })
  }

  if (authenticated === null)
    return (
      <div className="grid min-h-screen place-content-center bg-[#151714] font-['DM_Mono'] text-xs text-[#cfdc6a]">
        Loading studio...
      </div>
    )
  if (!authenticated)
    return (
      <Login
        onLogin={() => {
          setAuthenticated(true)
          void refresh()
        }}
      />
    )

  const readyCount = instances.filter((instance) => instance.ready).length
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_78%_0%,#263127_0,transparent_31rem),#151714] font-['DM_Sans'] text-[#e9e5dc]">
      <header className="sticky top-0 z-10 flex min-h-[68px] items-center justify-between gap-4 border-b border-[#30332e] bg-[#191c18cc] px-5 backdrop-blur md:px-10">
        <div className="flex items-center gap-3 text-sm tracking-wide">
          <span className="grid size-[30px] place-items-center bg-[#d4df6f] text-[11px] font-bold tracking-tighter text-[#1a1e16]">
            PD
          </span>
          <span>pony studio</span>
        </div>
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <label className="mx-2 flex min-w-0 items-center gap-2 text-[11px] whitespace-nowrap text-[#aeb1a5]">
            <span className="hidden lg:inline">Tile size</span>
            <input
              aria-label="Tile size"
              className="w-30 accent-[#cfdc6a] sm:w-52 lg:w-120 xl:w-190"
              type="range"
              min="30"
              max="900"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <span className="mx-1 grid gap-px">
              <IconButton
                className="size-5 border-[#42473d] text-xs"
                title="Increase tile size"
                onClick={() => adjustZoom(1)}
              >
                +
              </IconButton>
              <IconButton
                className="size-5 border-[#42473d] text-xs"
                title="Decrease tile size"
                onClick={() => adjustZoom(-1)}
              >
                -
              </IconButton>
            </span>
            <output className="font-['DM_Mono'] text-[11px] text-[#cfdc6a]">{zoom}px</output>
          </label>
          <span className="hidden items-center gap-3 sm:flex">
            <StatusIndicator ready={readyCount > 0} changing={false} />
            {readyCount} ready
          </span>
          <Button
            className="text-xs"
            variant="quiet"
            onClick={() => {
              setContinuous(false)
              void api("/auth/logout", { method: "POST" }).then(() => setAuthenticated(false))
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <div
        className={`grid min-h-[calc(100vh-68px)] ${generationPanelRetracted ? "md:grid-cols-[40px_1fr]" : "md:grid-cols-[minmax(310px,450px)_1fr]"}`}
      >
        <GenerationPanel
          prompt={prompt}
          negative={negative}
          width={width}
          height={height}
          seed={seed}
          randomizedSeed={randomizedSeed}
          lastPreview={lastPreview}
          onOpenPreview={setPreviewToOpen}
          continuous={continuous}
          generationDisabled={
            !instances.some((instance) => instance.id === instanceId && instance.ready)
          }
          retracted={generationPanelRetracted}
          busy={busy}
          error={error}
          onPrompt={setPrompt}
          onNegative={setNegative}
          onWidth={setWidth}
          onHeight={setHeight}
          onSeed={setSeed}
          onRandomizedSeed={(enabled) => {
            setRandomizedSeed(enabled)
            setSeed(enabled ? "" : randomSeed())
          }}
          onContinuous={setContinuous}
          onRetract={() => setGenerationPanelRetracted(true)}
          onSubmit={generate}
        />
        {generationPanelRetracted && (
          <aside className="hidden border-r border-[#30332e] bg-[#191c18] md:sticky md:top-[68px] md:flex md:h-[calc(100vh-68px)] md:justify-center md:pt-4">
            <IconButton
              className="text-lg"
              title="Expand generation panel"
              onClick={() => setGenerationPanelRetracted(false)}
            >
              ›
            </IconButton>
          </aside>
        )}
        <div className="min-w-0">
          <div className="px-3 md:px-10">
            <Fleet
              instances={instances}
              now={now}
              instanceId={instanceId}
              onInstance={setInstanceId}
              onAction={instanceAction}
            />
          </div>
          <Gallery
            jobs={jobs}
            jobsLoaded={jobsLoaded}
            now={now}
            zoom={zoom}
            onRefresh={refresh}
            onFail={failJob}
            onSendConfig={(config) => void submit({ ...config, seed: randomSeed() })}
            onHoverPreview={setLastPreview}
            previewToOpen={previewToOpen}
            onPreviewOpened={() => setPreviewToOpen(undefined)}
            galleryRef={galleryRef}
          />
        </div>
      </div>
    </div>
  )
}
