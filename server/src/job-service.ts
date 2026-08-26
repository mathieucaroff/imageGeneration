import { randomUUID } from "node:crypto"
import sharp from "sharp"
import { downloadImage, queuePrompt, waitForImages, type GenerationParams } from "../../lib/comfyui"
import { recordActivity } from "../../lib/history"
import { CHECKPOINT_FILE, withScoreTags } from "../../lib/pony"
import { errorMessage } from "./errors"
import { resolveReadyInstance } from "./instance-service"
import { imageName, publicUrl, upload } from "./storage"

type JobListener = (job: Job & { position?: number }) => void
const jobsPath = new URL("../../.jobs.json", import.meta.url)

export function createJobService() {
  const jobs = new Map<string, Job>()
  const queue: string[] = []
  const listeners = new Set<JobListener>()
  let workerRunning = false

  async function save() {
    await Bun.write(jobsPath, JSON.stringify([...jobs.values()], null, 2))
  }
  function position(id: string) {
    const index = queue.indexOf(id)
    return index < 0 ? undefined : index
  }
  function publicJob(job: Job): Job & { position?: number } {
    const queuePosition = job.status === "queued" ? position(job.id) : undefined
    return queuePosition === undefined ? { ...job } : { ...job, position: queuePosition }
  }
  function notify(job: Job) {
    const payload = publicJob(job)
    for (const listener of listeners) listener(payload)
  }

  async function process(job: Job) {
    const endpoint = await resolveReadyInstance(job.config.instanceId)
    if (job.status !== "queued") return
    job.status = "running"
    job.startedAt = new Date().toISOString()
    await save()
    notify(job)
    await recordActivity(endpoint.instance.id)
    const params: GenerationParams = {
      prompt: withScoreTags(job.config.prompt),
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
    if (jobs.get(job.id)?.status === "failed") return
    if (images.length !== 1)
      throw new Error(`Expected exactly one output image, received ${images.length}`)
    const source = await downloadImage(baseUrl, images[0]!, endpoint.token)
    const image = await sharp(Buffer.from(source)).webp({ quality: 78 }).toBuffer()
    const thumbnail = await sharp(image)
      .resize(350, 350, { fit: "contain", background: "#111111" })
      .webp({ quality: 72 })
      .toBuffer()
    const name = imageName()
    const thumbnailKey = name.replace(/\.webp$/, ".thumb.webp")
    await upload(name, image, "image/webp")
    await upload(thumbnailKey, thumbnail, "image/webp")
    await upload(
      name.replace(/\.webp$/, ".config"),
      Buffer.from(JSON.stringify(job.config, null, 2)),
      "application/json",
    )
    if (jobs.get(job.id)?.status === "failed") return
    job.status = "completed"
    job.finishedAt = new Date().toISOString()
    job.imageKey = name
    job.imageUrl = publicUrl(name)
    job.thumbnailUrl = publicUrl(thumbnailKey)
    await recordActivity(endpoint.instance.id)
  }

  async function runWorker() {
    if (workerRunning) return
    workerRunning = true
    while (queue.length) {
      const job = jobs.get(queue.shift()!)
      if (!job) continue
      try {
        await process(job)
      } catch (error) {
        if (job.status !== "failed") {
          job.status = "failed"
          job.finishedAt = new Date().toISOString()
          job.error = errorMessage(error)
        }
        try {
          await recordActivity(job.config.instanceId)
        } catch {
          /* Preserve the job error. */
        }
      }
      await save()
      notify(job)
    }
    workerRunning = false
  }

  return {
    async load() {
      const file = Bun.file(jobsPath)
      if (!(await file.exists())) return
      for (const job of (await file.json()) as Job[]) jobs.set(job.id, job)
    },
    list: () => [...jobs.values()].reverse().map(publicJob),
    subscribe(listener: JobListener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async fail(id: string) {
      const job = jobs.get(id)
      if (!job || (job.status !== "queued" && job.status !== "running")) return false
      job.status = "failed"
      job.finishedAt = new Date().toISOString()
      job.error = "Cancelled by user"
      const index = queue.indexOf(id)
      if (index >= 0) queue.splice(index, 1)
      await save()
      notify(job)
      return true
    },
    async create(config: JobConfig, maxQueued?: number) {
      if (
        maxQueued !== undefined &&
        [...jobs.values()].filter(
          (job) => job.status === "queued" && job.config.instanceId === config.instanceId,
        ).length >= maxQueued
      ) {
        return { queued: false as const, reason: "queue-full" as const }
      }
      const job: Job = {
        id: randomUUID(),
        config,
        status: "queued",
        createdAt: new Date().toISOString(),
      }
      jobs.set(job.id, job)
      queue.push(job.id)
      await recordActivity(config.instanceId)
      await save()
      notify(job)
      void runWorker()
      return { queued: true as const, job: publicJob(job) }
    },
  }
}

export type JobService = ReturnType<typeof createJobService>
