import { writeFileSync } from "node:fs"

export interface GenerationParams {
  prompt: string
  negative: string
  steps: number
  cfg: number
  width: number
  height: number
  seed: number
  sampler: string
  scheduler: string
  checkpoint: string
}

export interface ComfyImage {
  filename: string
  subfolder: string
  type: string
}

function authHeaders(authToken: string | undefined): HeadersInit {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {}
}

function buildWorkflow(p: GenerationParams): Record<string, unknown> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: p.checkpoint },
      _meta: { title: "Load Pony Diffusion Checkpoint" },
    },
    "2": {
      class_type: "CLIPSetLastLayer",
      inputs: { clip: ["1", 1], stop_at_clip_layer: -2 },
      _meta: { title: "Set CLIP Skip 2" },
    },
    "3": {
      class_type: "EmptyLatentImage",
      inputs: { width: p.width, height: p.height, batch_size: 1 },
      _meta: { title: "Create Latent Image" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: p.prompt, clip: ["2", 0] },
      _meta: { title: "Encode Positive Prompt" },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: p.negative, clip: ["2", 0] },
      _meta: { title: "Encode Negative Prompt" },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["3", 0],
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        sampler_name: p.sampler,
        scheduler: p.scheduler,
        denoise: 1,
      },
      _meta: { title: "Generate Image" },
    },
    "7": {
      class_type: "VAEDecode",
      inputs: { samples: ["6", 0], vae: ["1", 2] },
      _meta: { title: "Decode Latents" },
    },
    "8": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "pony", images: ["7", 0] },
      _meta: { title: "Save Generated Image" },
    },
  }
}

export async function queuePrompt(
  baseUrl: string,
  params: GenerationParams,
  authToken?: string,
): Promise<string> {
  const headers = { "Content-Type": "application/json", ...authHeaders(authToken) }
  const body = JSON.stringify({ prompt: buildWorkflow(params), client_id: crypto.randomUUID() })
  const res = await fetch(`${baseUrl}/prompt`, { method: "POST", headers, body })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`ComfyUI /prompt failed: ${res.status} ${text}`)
  }
  let data: { prompt_id: string; node_errors?: Record<string, unknown> }
  try {
    data = JSON.parse(text) as any
  } catch (err) {
    console.log("JSON parsing error:", text.slice(0, 200))
    writeFileSync("comfyui_response.json", text)
    throw new Error(`Failed to parse ComfyUI /prompt response: ${err}`)
  }
  if (data.node_errors && Object.keys(data.node_errors).length > 0) {
    throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(data.node_errors)}`)
  }
  return data.prompt_id
}

export async function waitForImages(
  baseUrl: string,
  promptId: string,
  opts?: { timeoutMs: number; pollMs: number },
  authToken?: string,
): Promise<ComfyImage[]> {
  const { timeoutMs = 5 * 60_000, pollMs = 2000 } = opts ?? {}
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl}/history/${promptId}`, { headers: authHeaders(authToken) })
    if (res.ok) {
      const data = (await res.json()) as Record<
        string,
        { outputs: Record<string, { images?: ComfyImage[] }> }
      >
      const entry = data[promptId]
      if (entry) {
        const images = Object.values(entry.outputs).flatMap((o) => o.images ?? [])
        if (images.length > 0) return images
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  throw new Error(`Timed out waiting for ComfyUI to finish prompt ${promptId}`)
}

export async function downloadImage(
  baseUrl: string,
  image: ComfyImage,
  authToken?: string,
): Promise<ArrayBuffer> {
  const url = new URL(`${baseUrl}/view`)
  url.searchParams.set("filename", image.filename)
  url.searchParams.set("subfolder", image.subfolder)
  url.searchParams.set("type", image.type)
  const res = await fetch(url, { headers: authHeaders(authToken) })
  if (!res.ok) {
    throw new Error(`Failed to download ${image.filename}: ${res.status}`)
  }
  return res.arrayBuffer()
}
