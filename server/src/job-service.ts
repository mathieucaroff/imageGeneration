import { randomUUID } from "node:crypto"
import sharp from "sharp"
import { downloadImage, queuePrompt, waitForImages, type GenerationParams } from "../../lib/comfyui"
import { recordActivity } from "../../lib/history"
import { withScoreTags } from "../../lib/pony"
import { errorMessage } from "./errors"
import { resolveReadyInstance } from "./instance-service"
import {
  imageName,
  listCompletedJobs,
  listCompletedJobsPage,
  publicUrlList,
  recordCompletedJob,
  upload,
} from "./storage"

type JobListener = (job: Job & { position?: number }) => void

export function createJobService() {
  const jobs = new Map<string, Job>()
  const queue: string[] = []
  const listeners = new Set<JobListener>()
  let workerRunning = false

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
    await upload(
      name.replace(/\.webp$/, ".config"),
      Buffer.from(JSON.stringify(job.config, null, 2)),
      "application/json",
    )
    await upload(thumbnailKey, thumbnail, "image/webp")
    await upload(name, image, "image/webp")
    await recordCompletedJob(name.replace(/--pony\.webp$/, ""))
    if (jobs.get(job.id)?.status === "failed") return
    job.status = "completed"
    job.id = name.replace(/--pony\.webp$/, "")
    job.finishedAt = new Date().toISOString()
    job.imageKey = name
    job.imageUrls = publicUrlList(name)
    job.thumbnailUrls = publicUrlList(thumbnailKey)
    await recordActivity(endpoint.instance.id)
  }

  async function runWorker() {
    if (workerRunning) return
    workerRunning = true
    while (queue.length) {
      const queuedId = queue.shift()!
      const job = jobs.get(queuedId)
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
      notify(job)
      if (job.status === "completed") jobs.delete(queuedId)
    }
    workerRunning = false
  }

  return {
    async list() {
      const completedJobs = await listCompletedJobs()
      const activeJobs = [...jobs.values()]
        .filter((job) => job.status !== "completed")
        .map(publicJob)
      return [...activeJobs, ...completedJobs].toSorted(
        (first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt),
      )
    },
    async listPage({
      page,
      pageSize,
      cursor,
    }: {
      page: number
      pageSize?: number | undefined
      cursor?: string | undefined
    }) {
      if (pageSize === undefined) return { jobs: await this.list(), page, cursor }
      const completed = await listCompletedJobsPage({
        cursor,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
      const activeJobs =
        cursor === undefined && page === 1
          ? [...jobs.values()].filter((job) => job.status !== "completed").map(publicJob)
          : []
      return { ...completed, jobs: [...activeJobs, ...completed.jobs], page, pageSize, cursor }
    },
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
      notify(job)
      void runWorker()
      return { queued: true as const, job: publicJob(job) }
    },
  }
}

export type JobService = ReturnType<typeof createJobService>
