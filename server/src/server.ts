import { randomBytes, randomUUID } from "node:crypto"
import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import sharp from "sharp"
import { downloadImage, queuePrompt, waitForImages, type GenerationParams } from "../../lib/comfyui"
import { recordActivity } from "../../lib/history"
import { sweepInstances } from "../../lib/instance-sweep"
import { CHECKPOINT_FILE, COMFYUI_PORT } from "../../lib/pony"
import { buildOnstartScript, provisioningStatus } from "../../lib/provisioning"
import { stopOrDestroyInstance } from "../../lib/instance-lifecycle"
import {
  createInstance,
  destroyInstance,
  findExposedPort,
  listInstances,
  searchRtx4090Offers,
  setInstanceState,
  type Instance,
} from "../../lib/vastai"
import { MAX_PRICE_PER_HOUR } from "../../lib/pricing"

const app = new Hono()
const PORT = Number(process.env.PORT ?? 3000)
const JOBS_PATH = new URL("../../.jobs.json", import.meta.url)
const sessions = new Set<string>()
const listeners = new Set<(event: string, payload: unknown) => void>()
const queue: string[] = []
let workerRunning = false

type JobStatus = "queued" | "running" | "completed" | "failed"
type JobConfig = {
  prompt: string
  negative_prompt: string
  width: number
  height: number
  seed: number
  instanceId: number
  submittedInstanceId: number
  steps: number
  cfg: number
  sampler: string
  scheduler: string
  denoise: number
  model: string
}
type Job = {
  id: string
  config: JobConfig
  status: JobStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
  error?: string
  imageUrl?: string
  thumbnailUrl?: string
  imageKey?: string
}

const jobs = new Map<string, Job>()

async function loadJobs() {
  const file = Bun.file(JOBS_PATH)
  if (!(await file.exists())) return
  for (const job of (await file.json()) as Job[]) jobs.set(job.id, job)
}

async function saveJobs() {
  await Bun.write(JOBS_PATH, JSON.stringify([...jobs.values()], null, 2))
}

function broadcast(event: string, payload: unknown) {
  for (const listener of listeners) listener(event, payload)
}

function publicJob(job: Job, position?: number) {
  return { ...job, ...(job.status === "queued" ? { position } : {}) }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function requireAuth(c: any, next: () => Promise<void>) {
  const token = getCookie(c, "pony_session")
  if (!token || !sessions.has(token)) {
    return c.json({ error: "Authentication required" }, 401)
  }
  return next()
}

function s3Client() {
  const endpoint = process.env.S3_ENDPOINT
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey || !process.env.S3_BUCKET)
    throw new Error("S3-compatible storage is not configured")
  return new S3Client({ endpoint, region: "auto", credentials: { accessKeyId, secretAccessKey } })
}

function s3Url(key: string) {
  const publicUrl = process.env.S3_PUBLIC_URL
  if (!publicUrl) throw new Error("S3_PUBLIC_URL is not configured")
  return `${publicUrl.replace(/\/$/, "")}/${key}`
}

async function upload(key: string, body: Uint8Array, contentType: string) {
  await s3Client().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

function imageName() {
  return `${new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "Z")}--pony.webp`
}

async function resolveReadyInstance(
  id: number,
): Promise<{ instance: Instance; host: string; port: number; token?: string }> {
  const instance = (await listInstances()).find((candidate) => candidate.id === id)
  if (!instance || instance.actual_status !== "running")
    throw new Error(`Instance ${id} is not running`)
  const provisioning = await provisioningStatus(instance)
  if (provisioning !== "ready" && provisioning !== "cached")
    throw new Error(`Instance ${id} is not ready (${provisioning})`)
  const endpoint = findExposedPort(instance, COMFYUI_PORT)
  if (!endpoint) throw new Error(`ComfyUI endpoint is unavailable for instance ${id}`)
  return {
    instance,
    ...endpoint,
    ...(instance.jupyter_token ? { token: instance.jupyter_token } : {}),
  }
}

async function processJob(job: Job) {
  const endpoint = await resolveReadyInstance(job.config.instanceId)
  job.status = "running"
  job.startedAt = new Date().toISOString()
  await saveJobs()
  broadcast("job", publicJob(job))
  await recordActivity(endpoint.instance.id)
  const params: GenerationParams = {
    prompt: job.config.prompt,
    negative: job.config.negative_prompt,
    steps: job.config.steps,
    cfg: job.config.cfg,
    width: job.config.width,
    height: job.config.height,
    seed: job.config.seed,
    sampler: job.config.sampler,
    scheduler: job.config.scheduler,
    checkpoint: job.config.model,
  }
  const baseUrl = `http://${endpoint.host}:${endpoint.port}`
  const promptId = await queuePrompt(baseUrl, params, endpoint.token)
  const images = await waitForImages(baseUrl, promptId, undefined, endpoint.token)
  if (images.length !== 1)
    throw new Error(`Expected exactly one output image, received ${images.length}`)
  const source = await downloadImage(baseUrl, images[0]!, endpoint.token)
  const image = await sharp(Buffer.from(source)).webp({ quality: 78 }).toBuffer()
  const thumbnail = await sharp(image)
    .resize(350, 350, { fit: "contain", background: "#111111" })
    .webp({ quality: 72 })
    .toBuffer()
  const name = imageName()
  const thumbKey = name.replace(/\.webp$/, ".thumb.webp")
  const configKey = name.replace(/\.webp$/, ".config")
  await upload(name, image, "image/webp")
  await upload(thumbKey, thumbnail, "image/webp")
  await upload(configKey, Buffer.from(JSON.stringify(job.config, null, 2)), "application/json")
  job.status = "completed"
  job.finishedAt = new Date().toISOString()
  job.imageKey = name
  job.imageUrl = s3Url(name)
  job.thumbnailUrl = s3Url(thumbKey)
  await recordActivity(endpoint.instance.id)
}

async function runWorker() {
  if (workerRunning) return
  workerRunning = true
  while (queue.length) {
    const id = queue.shift()!
    const job = jobs.get(id)
    if (!job) continue
    try {
      await processJob(job)
    } catch (error) {
      job.status = "failed"
      job.finishedAt = new Date().toISOString()
      job.error = errorMessage(error)
      try {
        await recordActivity(job.config.instanceId)
      } catch {
        /* Keep the original failure. */
      }
    }
    await saveJobs()
    broadcast("job", publicJob(job))
  }
  workerRunning = false
}

function queuePosition(id: string) {
  const position = queue.indexOf(id)
  return position < 0 ? undefined : position
}

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<{ password?: string }>()
  if (!process.env.PASSWORD || body.password !== process.env.PASSWORD) {
    return c.json({ error: "Invalid password" }, 401)
  }
  const token = randomBytes(32).toString("hex")
  sessions.add(token)
  setCookie(c, "pony_session", token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return c.json({ authenticated: true })
})

app.post("/api/auth/logout", (c) => {
  const token = getCookie(c, "pony_session")
  if (token) sessions.delete(token)
  deleteCookie(c, "pony_session", { path: "/" })
  return c.json({ authenticated: false })
})
app.get("/api/auth/session", (c) =>
  c.json({
    authenticated: Boolean(
      getCookie(c, "pony_session") && sessions.has(getCookie(c, "pony_session")!),
    ),
  }),
)
app.use("/api/instances", requireAuth)
app.use("/api/instances/*", requireAuth)
app.use("/api/jobs", requireAuth)
app.use("/api/jobs/*", requireAuth)
app.use("/api/events", requireAuth)

app.get("/api/instances", async (c) => {
  const instances = await listInstances()
  const result = await Promise.all(
    instances.map(async (instance) => {
      const provisioning = await provisioningStatus(instance)
      return {
        ...instance,
        provisioning,
        ready: instance.actual_status === "running" && ["ready", "cached"].includes(provisioning),
      }
    }),
  )
  return c.json(result)
})
app.post("/api/instances/:id/start", async (c) => {
  const id = Number(c.req.param("id"))
  const instance = (await listInstances()).find((candidate) => candidate.id === id)
  if (!instance || instance.actual_status !== "stopped")
    return c.json({ error: "Only stopped instances can be started" }, 400)
  await setInstanceState(id, "running")
  return c.json({ started: true })
})
app.post("/api/instances/provision", async (c) => {
  const offer = (await searchRtx4090Offers(MAX_PRICE_PER_HOUR))[0]
  if (!offer) return c.json({ error: "No eligible RTX 4090 offer available" }, 503)
  const result = await createInstance(offer.id, {
    image: process.env.VASTAI_IMAGE ?? "ghcr.io/ai-dock/comfyui:latest-cuda",
    env: `-p ${COMFYUI_PORT}:${COMFYUI_PORT} -p 22:22`,
    disk: 40,
    onstart: buildOnstartScript(),
  })
  return c.json(result, 201)
})
app.post("/api/instances/:id/stop", async (c) => {
  const instance = (await listInstances()).find(
    (candidate) => candidate.id === Number(c.req.param("id")),
  )
  if (!instance) return c.json({ error: "Instance not found" }, 404)
  return c.json({ result: await stopOrDestroyInstance(instance) })
})
app.delete("/api/instances/:id", async (c) => {
  await destroyInstance(Number(c.req.param("id")))
  return c.json({ deleted: true })
})
app.post("/api/instances/stop-all", async (c) => {
  const instances = await listInstances()
  const active = instances.filter((instance) => instance.actual_status !== "stopped")
  await Promise.all(active.map(stopOrDestroyInstance))
  return c.json({ count: active.length })
})
app.delete("/api/instances", async (c) => {
  const instances = await listInstances()
  await Promise.all(instances.map((instance) => destroyInstance(instance.id)))
  return c.json({ count: instances.length })
})

app.get("/api/jobs", (c) =>
  c.json([...jobs.values()].reverse().map((job) => publicJob(job, queuePosition(job.id)))),
)
app.post("/api/jobs", async (c) => {
  const body = await c.req.json<Partial<JobConfig>>()
  const instanceId = Number(body.instanceId)
  if (!body.prompt?.trim()) return c.json({ error: "prompt is required" }, 400)
  if (!Number.isInteger(instanceId)) return c.json({ error: "instanceId is required" }, 400)
  const width = Number(body.width ?? 1024)
  const height = Number(body.height ?? 1024)
  const seed = Number(body.seed ?? Math.floor(Math.random() * 2 ** 32))
  if (
    ![width, height, seed].every(Number.isFinite) ||
    width < 64 ||
    height < 64 ||
    width > 2048 ||
    height > 2048
  )
    return c.json({ error: "Invalid dimensions or seed" }, 400)
  try {
    await resolveReadyInstance(instanceId)
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 409)
  }
  const config: JobConfig = {
    prompt: body.prompt.trim(),
    negative_prompt:
      body.negative_prompt ?? "score_4, score_5, score_6, worst quality, low quality, blurry",
    width,
    height,
    seed,
    instanceId,
    submittedInstanceId: instanceId,
    steps: 25,
    cfg: 7,
    sampler: "euler_ancestral",
    scheduler: "karras",
    denoise: 1,
    model: CHECKPOINT_FILE,
  }
  const job: Job = {
    id: randomUUID(),
    config,
    status: "queued",
    createdAt: new Date().toISOString(),
  }
  jobs.set(job.id, job)
  queue.push(job.id)
  await recordActivity(instanceId)
  await saveJobs()
  broadcast("job", publicJob(job, queuePosition(job.id)))
  void runWorker()
  return c.json(publicJob(job, queuePosition(job.id)), 202)
})

app.get("/api/events", (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`))
      }
      listeners.add(send)
      send("ready", { connected: true })
      c.req.raw.signal.addEventListener("abort", () => listeners.delete(send), { once: true })
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
})

// Cost guard: destroy instances unused for IDLE_MINUTES, and instances whose
// creation never progressed (stuck in "created"/"loading" for five minutes).
const IDLE_MINUTES = Number(process.env.IDLE_MINUTES ?? 20)
const SWEEP_INTERVAL_MS = 30_000

function sweep() {
  void sweepInstances({
    idleMinutes: IDLE_MINUTES,
    onIdle: (instance) => destroyInstance(instance.id),
  }).catch((error) => console.error(`Instance sweep failed: ${errorMessage(error)}`))
}

await loadJobs()
sweep()
setInterval(sweep, SWEEP_INTERVAL_MS)
Bun.serve({ port: PORT, fetch: app.fetch })
console.log(`Image generation server listening on http://localhost:${PORT}`)
console.log(`Sweeping idle (${IDLE_MINUTES}m) and stuck-creating instances every minute.`)
