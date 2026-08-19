import { useEffect, useMemo, useState } from "react"

type Config = {
  prompt: string
  negative_prompt: string
  width: number
  height: number
  seed: number
  instanceId: number
}
type Job = {
  id: string
  config: Config
  status: "queued" | "running" | "completed" | "failed"
  position?: number
  imageUrl?: string
  thumbnailUrl?: string
  error?: string
  createdAt: string
  startedAt?: string
}
type Instance = {
  id: number
  actual_status: string
  provisioning: string
  ready: boolean
  gpu_name: string
  dph_total: number
  public_ipaddr?: string
}

const defaultNegative = "score_4, score_5, score_6, worst quality, low quality, blurry"

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`)
  return data
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 32)
}

function tags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function diffTags(current: string, previous?: string) {
  const oldTags = tags(previous ?? "")
  const oldCounts = new Map<string, number>()
  oldTags.forEach((tag) =>
    oldCounts.set(tag.toLowerCase(), (oldCounts.get(tag.toLowerCase()) ?? 0) + 1),
  )
  return tags(current)
    .map((tag) => {
      const key = tag.toLowerCase()
      const count = oldCounts.get(key) ?? 0
      if (count > 0) {
        oldCounts.set(key, count - 1)
        return { text: tag, kind: "same" }
      }
      return { text: tag, kind: "added" }
    })
    .concat(
      [...oldCounts.entries()].flatMap(([key, count]) =>
        Array.from({ length: count }, () => ({
          text: `- ${oldTags.find((tag) => tag.toLowerCase() === key) ?? key}`,
          kind: "removed",
        })),
      ),
    )
}

function DiffText({ value, previous }: { value: string; previous?: string }) {
  return (
    <span className="diff-text">
      {diffTags(value, previous).map((tag, index) => (
        <span className={`diff-${tag.kind}`} key={`${tag.text}-${index}`}>
          {tag.text}
          {index < diffTags(value, previous).length - 1 ? ", " : ""}
        </span>
      ))}
    </span>
  )
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ password }) })
      onLogin()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed")
    }
  }
  return (
    <main className="login-shell">
      <div className="login-mark">
        PD<span>·</span>XL
      </div>
      <h1>Private image studio</h1>
      <p>Connect to your Pony Diffusion workspace.</p>
      <form onSubmit={submit}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button className="primary" type="submit">
          Enter studio
        </button>
        {error && <div className="error-banner">{error}</div>}
      </form>
    </main>
  )
}

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

  async function refresh() {
    const [nextInstances, nextJobs] = await Promise.all([
      api<Instance[]>("/instances"),
      api<Job[]>("/jobs"),
    ])
    setInstances(nextInstances)
    setJobs(nextJobs)
    if (instanceId === "" && nextInstances.some((instance) => instance.ready))
      setInstanceId(nextInstances.find((instance) => instance.ready)!.id)
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
  const activeInstances = instances.filter((instance) => instance.ready)
  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs])

  async function submit(config: Config, blockId?: string) {
    setBusy(true)
    setError("")
    try {
      const job = await api<Job>("/jobs", { method: "POST", body: JSON.stringify(config) })
      setJobs((current) => [job, ...current])
      if (blockId)
        setBlocks((current) => ({ ...current, [blockId]: [...(current[blockId] ?? []), job.id] }))
      else setBlocks((current) => ({ ...current, [job.id]: [job.id] }))
      setPrevious(config)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not queue generation")
    } finally {
      setBusy(false)
    }
  }
  function generate(event: React.FormEvent) {
    event.preventDefault()
    if (instanceId === "") return setError("Choose a ready instance first.")
    void submit({ prompt, negative_prompt: negative, width, height, seed, instanceId })
  }
  function resend(job: Job) {
    const next = { ...job.config, seed: randomSeed() }
    void submit(next, Object.entries(blocks).find(([, ids]) => ids.includes(job.id))?.[0] ?? job.id)
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
  if (authenticated === null) return <div className="loading-screen">Loading studio...</div>
  if (!authenticated)
    return (
      <Login
        onLogin={() => {
          setAuthenticated(true)
          void refresh()
        }}
      />
    )

  const orderedBlocks = Object.entries(blocks)
    .map(([id, ids]) => ({
      id,
      jobs: ids.map((jobId) => jobsById.get(jobId)).filter((job): job is Job => Boolean(job)),
    }))
    .filter((block) => block.jobs.length)
  const ungrouped = jobs.filter((job) => !Object.values(blocks).some((ids) => ids.includes(job.id)))
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">PD</span>
          <span>pony studio</span>
        </div>
        <div className="top-actions">
          <span className="status-dot" />
          {activeInstances.length} ready{" "}
          <button
            className="text-button"
            onClick={() =>
              api("/auth/logout", { method: "POST" }).then(() => setAuthenticated(false))
            }
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="control-panel">
          <div className="eyebrow">Generation desk</div>
          <h1>
            Make something
            <br />
            <em>strange.</em>
          </h1>
          <form onSubmit={generate} className="generation-form">
            <label>
              Prompt
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="a luminous creature in a glasshouse..."
                rows={5}
                required
              />
            </label>
            <label>
              Negative prompt
              <textarea
                value={negative}
                onChange={(event) => setNegative(event.target.value)}
                rows={3}
              />
            </label>
            <div className="field-grid">
              <label>
                Width
                <input
                  type="number"
                  min={64}
                  max={2048}
                  step={64}
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                />
              </label>
              <label>
                Height
                <input
                  type="number"
                  min={64}
                  max={2048}
                  step={64}
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                />
              </label>
            </div>
            <label>
              Seed
              <div className="seed-field">
                <input
                  type="number"
                  value={seed}
                  onChange={(event) => setSeed(Number(event.target.value))}
                />
                <button type="button" title="Randomize seed" onClick={() => setSeed(randomSeed())}>
                  ↻
                </button>
              </div>
            </label>
            <label>
              Ready instance
              <select
                value={instanceId}
                onChange={(event) =>
                  setInstanceId(event.target.value ? Number(event.target.value) : "")
                }
                required
              >
                <option value="">Select instance</option>
                {activeInstances.map((instance) => (
                  <option value={instance.id} key={instance.id}>
                    #{instance.id} · {instance.gpu_name} · ${instance.dph_total.toFixed(2)}/h
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary generate-button"
              disabled={busy || instanceId === ""}
              type="submit"
            >
              {busy ? "Queueing..." : "Generate image"}
              <span>↗</span>
            </button>
            {error && <div className="error-banner">{error}</div>}
          </form>
          <div className="fixed-settings">
            <span>FIXED PIPELINE</span>
            <b>25 steps · CFG 7 · Euler A · Karras</b>
            <small>Pony Diffusion V6 XL</small>
          </div>
        </aside>
        <main className="gallery">
          <div className="gallery-toolbar">
            <div>
              <div className="eyebrow">Output archive</div>
              <h2>
                Generations <span>{jobs.length}</span>
              </h2>
            </div>
            <div className="toolbar-tools">
              <label className="zoom-control">
                Tile size{" "}
                <input
                  type="range"
                  min="30"
                  max="900"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
                <output>{zoom}px</output>
              </label>
              <button
                className="icon-button"
                title="Refresh instances and jobs"
                onClick={() => void refresh()}
              >
                ⟳
              </button>
            </div>
          </div>
          <div className="instance-strip">
            <div className="strip-label">VAST.AI FLEET</div>
            {instances.map((instance) => (
              <div className="instance-chip" key={instance.id}>
                <span className={`status-dot ${instance.ready ? "ready" : "muted"}`} />#
                {instance.id} {instance.provisioning}
                <button
                  title="Stop instance"
                  onClick={() => {
                    if (window.confirm(`Stop instance #${instance.id}?`))
                      void instanceAction(`/instances/${instance.id}/stop`, { method: "POST" })
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="outline-button"
              onClick={() => void instanceAction("/instances/provision", { method: "POST" })}
            >
              + Provision
            </button>
            <button
              className="danger-button"
              onClick={() => {
                if (window.confirm("Stop all instances?"))
                  void instanceAction("/instances/stop-all", { method: "POST" })
              }}
            >
              Stop all
            </button>
          </div>
          <div
            className="gallery-grid"
            style={{ "--tile-size": `${zoom}px` } as React.CSSProperties}
          >
            {orderedBlocks.map((block, blockIndex) => (
              <section
                className="image-block"
                key={block.id}
                style={{ "--block-hue": `${(blockIndex * 71 + 24) % 360}` } as React.CSSProperties}
              >
                <div className="block-meta">
                  <span>SET {String(blockIndex + 1).padStart(2, "0")}</span>
                  <span>
                    {block.jobs.length} image{block.jobs.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="block-images">
                  {block.jobs.map((job) => (
                    <JobTile
                      job={job}
                      previous={previous}
                      onResend={() => resend(job)}
                      key={job.id}
                    />
                  ))}
                </div>
              </section>
            ))}
            {ungrouped.map((job) => (
              <section className="image-block" key={job.id}>
                <div className="block-meta">
                  <span>SET</span>
                </div>
                <div className="block-images">
                  <JobTile job={job} previous={previous} onResend={() => resend(job)} />
                </div>
              </section>
            ))}
            {!jobs.length && (
              <div className="empty-state">
                <div className="empty-orbit">✦</div>
                <h3>Your archive is quiet</h3>
                <p>Write a prompt and send your first image into the queue.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function JobTile({
  job,
  previous,
  onResend,
}: {
  job: Job
  previous?: Config
  onResend: () => void
}) {
  return (
    <article className={`image-tile ${job.status}`}>
      <div className="tile-image">
        {job.status === "completed" && job.thumbnailUrl ? (
          <img src={job.thumbnailUrl} alt={job.config.prompt} />
        ) : (
          <div className="tile-state">
            <span>
              {job.status === "queued"
                ? `#${(job.position ?? 0) + 1}`
                : job.status === "running"
                  ? "Rendering"
                  : "Failed"}
            </span>
            {job.error && <small>{job.error}</small>}
          </div>
        )}
        <div className="tile-overlay">
          <button onClick={onResend}>↻ Re-send</button>
        </div>
      </div>
      <div className="tile-caption">
        <div className="tile-prompt">
          <DiffText value={job.config.prompt} previous={previous?.prompt} />
        </div>
        <div className="tile-details">
          <span>
            {job.config.width}×{job.config.height}
          </span>
          <span className={previous && previous.seed !== job.config.seed ? "changed" : ""}>
            seed {job.config.seed}
          </span>
          <span className="tile-status">{job.status}</span>
        </div>
      </div>
    </article>
  )
}
