function normalizeTag(tag: string) {
  const value = tag.trim().replaceAll("_", " ").replace(/\s+/g, " ")
  const match = value.match(/^(\(+|\[+)([^()[\]]+)(\)+|\]+)$/)
  if (!match || match[1]!.length !== match[3]!.length) return value
  const depth = match[1]!.length
  const modifier = match[1]![0] === "(" ? 1 + depth / 10 : 1 - depth / 10
  return `(${match[2]!.trim()}:${modifier.toFixed(1)})`
}

function normalizePrompt(prompt: string) {
  return prompt.split(",").map(normalizeTag).filter(Boolean).sort().join(",")
}

function configKey(config: Config) {
  return JSON.stringify([
    normalizePrompt(config.prompt),
    normalizePrompt(config.negative_prompt),
    config.width,
    config.height,
  ])
}

function hash32(value: string) {
  let hash = 0x2265_3b61
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x5bd1_e995)
    hash ^= hash >>> 15
  }
  return hash >>> 0
}

export function configColor(config: Config) {
  const hash = hash32(configKey(config))
  const first = hash & 0xff
  const second = (hash >>> 8) & 0xff
  const selector = (hash >>> 16) & 0xff
  const saturated = selector % 3
  const saturatedValue = selector & 1 ? 255 : 0
  const channels = [first, second]
  channels.splice(saturated, 0, saturatedValue)
  const colorChannels = channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")
  const alphaChannel = (90).toString(16)
  return `#${colorChannels}${alphaChannel}`
}

export function buildGalleryTiles(jobs: Job[]): GalleryTile[] {
  const visibleJobs = jobs
    .filter((job) => job.status !== "failed")
    .toSorted((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
  const runs: Job[][] = []
  for (const job of visibleJobs) {
    const previousRun = runs.at(-1)
    if (previousRun && configKey(previousRun[0]!.config) === configKey(job.config))
      previousRun.push(job)
    else runs.push([job])
  }
  const antechronologicalTiles = runs.flatMap((run, index) => {
    const config = run[0]!.config
    const olderConfig = runs[index + 1]?.[0]?.config
    const color = configColor(config)
    return [
      { kind: "config" as const, id: `config-${run[0]!.id}`, config, previous: olderConfig, color },
      ...run.map((job) => ({ kind: "job" as const, id: job.id, job, color })),
    ]
  })

  return antechronologicalTiles
}
