// https://civitai.com/models/257749/pony-diffusion-v6-xl, version "V6 (start with this one)"
export const CHECKPOINT_URL = "https://civitai.com/api/download/models/290640";
export const CHECKPOINT_FILE = "ponyDiffusionV6XL_v6StartWithThisOne.safetensors";
// ai-dock's shared SD storage layout, symlinked into ComfyUI/models/checkpoints
export const CHECKPOINT_DIR = "/workspace/storage/stable_diffusion/models/ckpt";

export const COMFYUI_PORT = 8188;

// CivitAI recommends always prepending these to the prompt.
// https://civitai.com/models/257749/pony-diffusion-v6-xl
export const SCORE_TAGS = "score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up";
