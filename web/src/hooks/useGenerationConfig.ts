import { useEffect, useState } from "react"
import { randomSeed } from "../utils"

const defaultNegative = "score_4, score_5, score_6, worst quality, low quality, blurry"
const storageKey = "pony-studio.generation-config.v1"

function loadGenerationConfig(): SavedGenerationConfig {
  const defaults: SavedGenerationConfig = {
    prompt: "",
    negative: defaultNegative,
    width: 1024,
    height: 1024,
    seed: randomSeed(),
    randomizedSeed: false,
    instanceId: "",
    continuous: false,
  }
  try {
    const value = localStorage.getItem(storageKey)
    if (!value) return defaults
    const saved = JSON.parse(value) as Partial<SavedGenerationConfig>
    const randomizedSeed =
      typeof saved.randomizedSeed === "boolean" ? saved.randomizedSeed : defaults.randomizedSeed
    return {
      prompt: typeof saved.prompt === "string" ? saved.prompt : defaults.prompt,
      negative: typeof saved.negative === "string" ? saved.negative : defaults.negative,
      width: Number.isFinite(saved.width) ? saved.width! : defaults.width,
      height: Number.isFinite(saved.height) ? saved.height! : defaults.height,
      seed: randomizedSeed ? "" : Number.isFinite(saved.seed) ? saved.seed! : defaults.seed,
      randomizedSeed,
      instanceId: Number.isInteger(saved.instanceId) ? saved.instanceId! : defaults.instanceId,
      continuous: typeof saved.continuous === "boolean" ? saved.continuous : defaults.continuous,
    }
  } catch {
    return defaults
  }
}

export function useGenerationConfig() {
  const [savedConfig] = useState(loadGenerationConfig)
  const [continuous, setContinuous] = useState(savedConfig.continuous)
  const [height, setHeight] = useState(savedConfig.height)
  const [instanceId, setInstanceId] = useState<number | "">(savedConfig.instanceId)
  const [negative, setNegative] = useState(savedConfig.negative)
  const [prompt, setPrompt] = useState(savedConfig.prompt)
  const [randomizedSeed, setRandomizedSeed] = useState(savedConfig.randomizedSeed)
  const [seed, setSeed] = useState<number | "">(savedConfig.seed)
  const [width, setWidth] = useState(savedConfig.width)

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          prompt,
          negative,
          width,
          height,
          seed,
          randomizedSeed,
          instanceId,
          continuous,
        }),
      )
    } catch {
      /* The form remains usable when browser storage is unavailable. */
    }
  }, [prompt, negative, width, height, seed, randomizedSeed, instanceId, continuous])

  return {
    continuous,
    setContinuous,
    height,
    setHeight,
    instanceId,
    setInstanceId,
    negative,
    setNegative,
    prompt,
    setPrompt,
    randomizedSeed,
    setRandomizedSeed,
    seed,
    setSeed,
    width,
    setWidth,
  }
}
