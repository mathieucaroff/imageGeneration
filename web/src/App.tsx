import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
} from "react"
import { api } from "./api"
import { AppReadOnly } from "./AppReadOnly"
import { IconButton } from "./components/IconButton"
import { Fleet } from "./Fleet"
import { Gallery } from "./Gallery"
import { GenerationPanel } from "./GenerationPanel"
import { Login } from "./Login"
import { StudioHeader } from "./StudioHeader"
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
  const [continuous, setContinuous] = useState(savedGenerationConfig.continuous)
  const [height, setHeight] = useState(savedGenerationConfig.height)
  const [instanceId, setInstanceId] = useState<number | "">(savedGenerationConfig.instanceId)
  const [negative, setNegative] = useState(savedGenerationConfig.negative)
  const [prompt, setPrompt] = useState(savedGenerationConfig.prompt)
  const [randomizedSeed, setRandomizedSeed] = useState(savedGenerationConfig.randomizedSeed)
  const [seed, setSeed] = useState<number | "">(savedGenerationConfig.seed)
  const [width, setWidth] = useState(savedGenerationConfig.width)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [continuousRetry, setContinuousRetry] = useState(0)
  const [error, setError] = useState("")
  const [generationPanelRetracted, setGenerationPanelRetracted] = useState(false)
  const [generationPanelWidth, setGenerationPanelWidth] = useState(380)
  const [instances, setInstances] = useState<Instance[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [firstJobsLoaded, setFirstJobsLoaded] = useState(false)
  const [lastPreview, setLastPreview] = useState<GalleryPreview>()
  const [now, setNow] = useState(Date.now())
  const [previewToOpen, setPreviewToOpen] = useState<GalleryPreview>()
  const [readOnly, setReadOnly] = useState(false)
  const [username, setUsername] = useState("")
  const [zoom, setZoom] = useState(260)
  const galleryRef = useRef<HTMLDivElement>(null)

  if (instanceId === "") {
    const { id } = instances.find((instance) => instance.ready) ?? {}
    if (id) {
      setInstanceId(id)
    }
  }

  async function refresh() {
    let url = "/jobs"
    if (!firstJobsLoaded) url += "?pageSize=100"
    api<{ jobs: Job[] }>(url).then(({ jobs }) => {
      setJobs(jobs)
      setFirstJobsLoaded(true)
    })
    const nextInstances = await api<Instance[]>("/instances")
    setInstances(nextInstances)
    if (instanceId === "") {
      const ready = nextInstances.find((instance) => instance.ready)
      if (ready) setInstanceId(ready.id)
    }
  }
  useEffect(() => {
    // Trigger a refresh after the 100 jobs of the first refresh have been loaded
    if (firstJobsLoaded) void refresh()
  }, [firstJobsLoaded])
  useEffect(() => {
    api<{ authenticated: boolean; username?: string; readOnly?: boolean }>("/auth/session")
      .then((data) => {
        setAuthenticated(data.authenticated)
        setUsername(data.username ?? "")
        setReadOnly(data.readOnly === true)
        if (data.authenticated) void refresh()
      })
      .catch(() => setAuthenticated(false))
  }, [])
  useEffect(() => {
    if (!authenticated) return
    const events = new EventSource("/api/events")
    events.addEventListener("job", () => void refresh())
    const timer = window.setInterval(() => void refresh(), 30_000)
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
      .sort((first, second) => {
        if (first.finishedAt && second.finishedAt)
          return Date.parse(second.finishedAt) - Date.parse(first.finishedAt)
        return Date.parse(second.createdAt) - Date.parse(first.createdAt)
      })[0]
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
      jobs.filter((job) => job.status === "running").toSorted(newestFirst)[0] ??
      jobs.filter((job) => job.status === "completed").toSorted(newestFirst)[0]
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

  function adjustZoom(direction: -1 | 0 | 1) {
    setZoom((currentZoom) => {
      if (!galleryRef.current) return clamp(currentZoom + direction * 10, 30, 900)
      return computeZoom(galleryRef.current.clientWidth, currentZoom, direction)
    })
  }

  function resizeGenerationPanel(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const viewportWidth = window.innerWidth
    const interpolation = clamp((viewportWidth - 800) / 600, 0, 1)
    const maximumWidth = viewportWidth * (0.75 - interpolation * 0.25)
    setGenerationPanelWidth(clamp(event.clientX, 310, maximumWidth))
  }

  const zoomIsAdjusted = galleryRef.current
    ? zoom === computeZoom(galleryRef.current.clientWidth, zoom, 0)
    : false

  if (authenticated === null)
    return (
      <div className="grid min-h-screen place-content-center bg-[#151714] font-['DM_Mono'] text-xs text-[#cfdc6a]">
        Loading studio...
      </div>
    )
  if (!authenticated)
    return (
      <Login
        onLogin={(session) => {
          setAuthenticated(session.authenticated)
          setUsername(session.username)
          setReadOnly(session.readOnly)
          void refresh()
        }}
      />
    )

  if (readOnly)
    return (
      <AppReadOnly
        username={username}
        onSignOut={() =>
          void api("/auth/logout", { method: "POST" }).then(() => setAuthenticated(false))
        }
      />
    )

  const readyCount = instances.filter((instance) => instance.ready).length
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_78%_0%,#263127_0,transparent_31rem),#151714] font-['DM_Sans'] text-[#e9e5dc]">
      <StudioHeader
        zoom={zoom}
        zoomIsAdjusted={zoomIsAdjusted}
        readyCount={readyCount}
        onZoom={setZoom}
        onAdjustZoom={adjustZoom}
        onSignOut={() => {
          setContinuous(false)
          void api("/auth/logout", { method: "POST" }).then(() => setAuthenticated(false))
        }}
      />
      <div
        className={`grid min-h-[calc(100vh-68px)] ${generationPanelRetracted ? "md:grid-cols-[40px_1fr]" : "md:grid-cols-[var(--generation-panel-width)_8px_minmax(0,1fr)]"}`}
        style={{ "--generation-panel-width": `${generationPanelWidth}px` } as CSSProperties}
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
        {!generationPanelRetracted && (
          <div
            aria-label="Resize generation panel"
            className="hidden cursor-col-resize touch-none border-r border-[#30332e] bg-[#191c18] outline-none hover:bg-[#30332e] focus-visible:bg-[#30332e] md:block"
            role="separator"
            tabIndex={0}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerMove={resizeGenerationPanel}
          />
        )}
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
          <div className="px-3 md:px-8">
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
            jobsLoaded={firstJobsLoaded}
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
function computeZoom(width: number, currentZoom: number, direction: number) {
  const floorCount = Math.floor(width / currentZoom)
  const floorZoom = Math.floor(width / (floorCount - direction) - 0.01)
  return clamp(floorZoom, 30, 900)
}
