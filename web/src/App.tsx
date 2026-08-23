import { useEffect, useMemo, useState, type FormEvent } from "react"
import { api } from "./api"
import { Button } from "./components/Button"
import { StatusDot } from "./components/StatusDot"
import { Fleet } from "./Fleet"
import { Gallery } from "./Gallery"
import { GenerationPanel } from "./GenerationPanel"
import { Login } from "./Login"
import { randomSeed } from "./utils"

const defaultNegative = "score_4, score_5, score_6, worst quality, low quality, blurry"

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [instances, setInstances] = useState<Instance[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [prompt, setPrompt] = useState("")
  const [negative, setNegative] = useState(defaultNegative)
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(1024)
  const [seed, setSeed] = useState(randomSeed())
  const [instanceId, setInstanceId] = useState<number | "">("")
  const [zoom, setZoom] = useState(260)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [blocks, setBlocks] = useState<Record<string, string[]>>({})
  const [previous, setPrevious] = useState<Config>()
  const [now, setNow] = useState(Date.now())

  async function refresh() {
    const [nextInstances, nextJobs] = await Promise.all([
      api<Instance[]>("/instances"),
      api<Job[]>("/jobs"),
    ])
    setInstances(nextInstances)
    setJobs(nextJobs)
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

  async function submit(config: Config, blockId?: string) {
    setBusy(true)
    setError("")
    try {
      const job = await api<Job>("/jobs", { method: "POST", body: JSON.stringify(config) })
      setJobs((current) => [job, ...current])
      setBlocks((current) =>
        blockId
          ? { ...current, [blockId]: [...(current[blockId] ?? []), job.id] }
          : { ...current, [job.id]: [job.id] },
      )
      setPrevious(config)
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
    void submit({ prompt, negative_prompt: negative, width, height, seed, instanceId })
  }
  function resend(job: Job) {
    void submit(
      { ...job.config, seed: randomSeed() },
      Object.entries(blocks).find(([, ids]) => ids.includes(job.id))?.[0] ?? job.id,
    )
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

  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs])
  const galleryBlocks = Object.entries(blocks)
    .map(([id, ids]) => ({
      id,
      jobs: ids.map((jobId) => jobsById.get(jobId)).filter((job): job is Job => Boolean(job)),
    }))
    .filter((block) => block.jobs.length)
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
      <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-[#30332e] bg-[#191c18cc] px-5 backdrop-blur md:px-10">
        <div className="flex items-center gap-3 text-sm tracking-wide">
          <span className="grid size-[30px] place-items-center bg-[#d4df6f] text-[11px] font-bold tracking-tighter text-[#1a1e16]">
            PD
          </span>
          <span>pony studio</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <StatusDot ready />
          {readyCount} ready{" "}
          <Button
            className="ml-3 text-xs"
            variant="quiet"
            onClick={() =>
              api("/auth/logout", { method: "POST" }).then(() => setAuthenticated(false))
            }
          >
            Sign out
          </Button>
        </div>
      </header>
      <div className="grid min-h-[calc(100vh-68px)] md:grid-cols-[minmax(310px,350px)_1fr]">
        <GenerationPanel
          prompt={prompt}
          negative={negative}
          width={width}
          height={height}
          seed={seed}
          instanceId={instanceId}
          instances={instances}
          busy={busy}
          error={error}
          onPrompt={setPrompt}
          onNegative={setNegative}
          onWidth={setWidth}
          onHeight={setHeight}
          onSeed={setSeed}
          onInstance={setInstanceId}
          onSubmit={generate}
        />
        <div className="min-w-0">
          <div className="px-3 md:px-10">
            <Fleet
              instances={instances}
              now={now}
              onAction={(path, init) => void instanceAction(path, init)}
            />
          </div>
          <Gallery
            jobs={jobs}
            blocks={galleryBlocks}
            previous={previous}
            now={now}
            zoom={zoom}
            onZoom={setZoom}
            onRefresh={() => void refresh()}
            onResend={resend}
          />
        </div>
      </div>
    </div>
  )
}
