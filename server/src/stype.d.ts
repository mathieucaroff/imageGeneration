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
  imageUrls?: string[]
  thumbnailUrls?: string[]
  imageKey?: string
}
