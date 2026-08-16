const HISTORY_PATH = new URL("../.vastai-history.json", import.meta.url)

interface History {
  lastActivityAtByInstanceId?: Record<string, string>
  blacklistedMachineIds?: number[]
}

async function load(): Promise<History> {
  const file = Bun.file(HISTORY_PATH)
  if (!(await file.exists())) return {}
  return (await file.json()) as History
}

async function save(data: History): Promise<void> {
  await Bun.write(HISTORY_PATH, JSON.stringify(data, null, 2))
}

export async function loadBlacklistedMachineIds(): Promise<Set<number>> {
  const data = await load()
  return new Set(data.blacklistedMachineIds ?? [])
}

export async function getLastActivityAt(instanceId: number): Promise<Date | undefined> {
  const data = await load()
  const value = data.lastActivityAtByInstanceId?.[String(instanceId)]
  if (!value) return undefined
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp
}

export async function recordActivity(instanceId: number): Promise<void> {
  const data = await load()
  await save({
    ...data,
    lastActivityAtByInstanceId: {
      ...data.lastActivityAtByInstanceId,
      [instanceId]: new Date().toISOString(),
    },
  })
}

// Marks a machine as permanently unusable (e.g. a host-side GPU/CDI failure)
// so provision-rtx4090.ts stops offering it.
export async function blacklistMachineId(machineId: number): Promise<void> {
  const data = await load()
  const blacklisted = new Set(data.blacklistedMachineIds ?? [])
  blacklisted.add(machineId)
  await save({ ...data, blacklistedMachineIds: [...blacklisted] })
}
