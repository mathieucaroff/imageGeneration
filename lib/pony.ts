// https://civitai.com/models/257749/pony-diffusion-v6-xl, version "V6 (start with this one)"
export const CHECKPOINT_URL = "https://civitai.com/api/download/models/290640"
export const CHECKPOINT_FILE = "ponyDiffusionV6XL_v6StartWithThisOne.safetensors"
// ai-dock's shared SD storage layout, symlinked into ComfyUI/models/checkpoints
export const CHECKPOINT_DIR = "/workspace/storage/stable_diffusion/models/ckpt"

export const COMFYUI_PORT = 8188

// CivitAI recommends always prepending these to the prompt.
// https://civitai.com/models/257749/pony-diffusion-v6-xl
export const SCORE_TAGS = "score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up"

// Prepend only score tags that are not already present, matching CivitAI's
// recommended Pony prompt format without duplicating user-provided tags.
export function withScoreTags(prompt: string, scoreTags = SCORE_TAGS): string {
  if (!scoreTags) return prompt
  const tags = scoreTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
  const loweredPrompt = prompt.toLowerCase()
  const missing = tags.filter((tag) => !loweredPrompt.includes(tag.toLowerCase()))
  return [...missing, prompt].join(", ")
}
