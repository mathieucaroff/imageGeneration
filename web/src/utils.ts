export function randomSeed() {
  return Math.floor(Math.random() * 2 ** 32)
}

export function elapsedSeconds(
  since: string | number | null | undefined,
  until: number | string,
): string {
  if (!since) return "-"
  const startedAt = typeof since === "number" ? since * 1000 : Date.parse(since)
  const endedAt = typeof until === "number" ? until : Date.parse(until)
  if (Number.isNaN(startedAt) || Number.isNaN(endedAt)) return "-"
  return `${Math.max(0, Math.floor((endedAt - startedAt) / 1000))}s`
}

export function shortInstanceId(id: number) {
  return String(id).slice(-3)
}

export function diffTags(current: string, previous?: string) {
  const oldTags = (previous ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
  const oldCounts = new Map<string, number>()
  oldTags.forEach((tag) =>
    oldCounts.set(tag.toLowerCase(), (oldCounts.get(tag.toLowerCase()) ?? 0) + 1),
  )
  return current
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => {
      const key = tag.toLowerCase()
      const count = oldCounts.get(key) ?? 0
      if (count > 0) {
        oldCounts.set(key, count - 1)
        return { text: tag, kind: "same" }
      }
      return { text: `+${tag}`, kind: "added" }
    })
    .concat(
      [...oldCounts.entries()].flatMap(([key, count]) =>
        Array.from({ length: count }, () => ({
          text: `-${oldTags.find((tag) => tag.toLowerCase() === key) ?? key}`,
          kind: "removed",
        })),
      ),
    )
}
