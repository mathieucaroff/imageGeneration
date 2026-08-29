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
  imageUrls?: string[]
  thumbnailUrls?: string[]
  error?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

type Instance = {
  id: number
  actual_status: string
  cur_state: string
  provisioning: string
  ready: boolean
  gpu_name: string
  dph_total: number
  public_ipaddr?: string
  start_date?: number | null
}

type GalleryPreview =
  { kind: "image"; job: Job } | { kind: "config"; config: Config; color: string }

type GalleryTile =
  | { kind: "config"; id: string; config: Config; previous?: Config; color: string }
  | { kind: "job"; id: string; job: Job; color: string }

type SavedGenerationConfig = {
  prompt: string
  negative: string
  width: number
  height: number
  seed: number | ""
  randomizedSeed: boolean
  instanceId: number | ""
  continuous: boolean
}

type CreateJobResult = { queued: true; job: Job } | { queued: false; reason: "queue-full" }
