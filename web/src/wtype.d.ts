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
  finishedAt?: string
}

type Instance = {
  id: number
  actual_status: string
  provisioning: string
  ready: boolean
  gpu_name: string
  dph_total: number
  public_ipaddr?: string
  start_date?: number | null
}
