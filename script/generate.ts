#!/usr/bin/env bun
/**
 * Sends a text-to-image generation request to Pony Diffusion V6 XL running
 * on a Vast.ai instance's ComfyUI server, and downloads the resulting images.
 */
import { mkdir } from "node:fs/promises"
import { downloadImage, queuePrompt, waitForImages } from "../lib/comfyui"
import { recordActivity } from "../lib/history"
import { CHECKPOINT_FILE, COMFYUI_PORT, withScoreTags } from "../lib/pony"
import { findExposedPort, listInstances } from "../lib/vastai"

const USAGE =
  'Usage: bun run script/generate.ts "<prompt>" [--negative "..."] [--steps N] [--cfg N] ' +
  "[--width N] [--height N] [--seed N] [--sampler NAME] [--scheduler NAME] " +
  '[--score-tags "..." (pass "" to disable)] [--instance ID] [--host HOST] [--port N] [--out DIR]'

interface Args {
  prompt: string
  negative: string
  steps: number
  cfg: number
  width: number
  height: number
  seed: number
  sampler: string
  scheduler: string
  scoreTags: string | undefined
  instanceId: number | undefined
  host: string | undefined
  port: number | undefined
  authToken: string | undefined
  out: string
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = []
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg?.startsWith("--")) {
      const key = arg.slice(2)
      const value = argv[++i]
      if (value === undefined) throw new Error(`Missing value for --${key}\n${USAGE}`)
      flags[key] = value
    } else if (arg !== undefined) {
      positional.push(arg)
    }
  }

  const prompt = flags.prompt ?? positional[0]
  if (!prompt) throw new Error(USAGE)

  return {
    prompt,
    negative: flags.negative ?? "score_4, score_5, score_6, worst quality, low quality, blurry",
    steps: Number(flags.steps ?? 25),
    cfg: Number(flags.cfg ?? 7),
    width: Number(flags.width ?? 1024),
    height: Number(flags.height ?? 1024),
    seed: Number(flags.seed ?? Math.floor(Math.random() * 2 ** 32)),
    sampler: flags.sampler ?? "euler_ancestral", // K_EULER_A in ComfyUI's naming
    scheduler: flags.scheduler ?? "karras",
    scoreTags: flags["score-tags"],
    instanceId: flags.instance ? Number(flags.instance) : undefined,
    host: flags.host,
    port: flags.port ? Number(flags.port) : undefined,
    authToken: process.env.COMFYUI_TOKEN,
    out: flags.out ?? "./output",
  }
}

async function resolveEndpoint(args: Args): Promise<{
  host: string
  port: number
  authToken: string | undefined
  instanceId: number | undefined
}> {
  if (args.host && args.port) {
    return { host: args.host, port: args.port, authToken: args.authToken, instanceId: undefined }
  }

  const instances = await listInstances()
  const running = instances.filter((i) => i.actual_status === "running")
  const instance = args.instanceId ? running.find((i) => i.id === args.instanceId) : running[0]

  if (!instance) {
    throw new Error(
      running.length === 0
        ? "No running Vast.ai instance found. Provision one first with `bun run vastai:provision`."
        : `No running instance with id ${args.instanceId}.`,
    )
  }

  const endpoint = findExposedPort(instance, COMFYUI_PORT)
  if (!endpoint) {
    throw new Error(
      `Could not determine ComfyUI's exposed port for instance ${instance.id} from the API. ` +
        "Check the port mapping at https://cloud.vast.ai/instances/ and pass --host and --port explicitly.",
    )
  }
  return {
    ...endpoint,
    authToken: instance.jupyter_token ?? args.authToken,
    instanceId: instance.id,
  }
}

/**
 * Returns a filename-safe UTC timestamp based on the current ISO time.
 *
 * Format: `YYYY-MM-DDTHH-MM-SS-<base26-letter>`, where the trailing letter
 * is derived from the milliseconds component to reduce same-second collisions.
 */
function isoNow(): string {
  const now = new Date().toISOString()
  const [time, ms] = now.split(".")
  const letterIndex = Math.floor(Number(`0.${ms!.replace("Z", "")}`) * 26)
  const letter = (letterIndex + 10).toString(36).toUpperCase()
  return `${time!.replace(/[:.]/g, "-")}${letter}`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { host, port, authToken, instanceId } = await resolveEndpoint(args)
  const baseUrl = `http://${host}:${port}`

  const prompt = withScoreTags(args.prompt, args.scoreTags)
  console.log(`Sending prompt to ComfyUI at ${baseUrl}...`)
  if (instanceId) await recordActivity(instanceId)
  const promptId = await queuePrompt(
    baseUrl,
    {
      prompt,
      negative: args.negative,
      steps: args.steps,
      cfg: args.cfg,
      width: args.width,
      height: args.height,
      seed: args.seed,
      sampler: args.sampler,
      scheduler: args.scheduler,
      checkpoint: CHECKPOINT_FILE,
    },
    authToken,
  )
  console.log(`Queued as ${promptId} (seed ${args.seed}). Waiting for generation...`)

  const images = await waitForImages(baseUrl, promptId, undefined, authToken)
  if (instanceId) await recordActivity(instanceId)

  await mkdir(args.out, { recursive: true })
  for (const image of images) {
    const bytes = await downloadImage(baseUrl, image, authToken)
    const filename = `${isoNow()}--${image.filename}`
    const dest = `${args.out}/${filename}`
    await Bun.write(dest, bytes)
    console.log(`Saved ${dest}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
