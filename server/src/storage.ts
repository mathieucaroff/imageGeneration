import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

const configCache = new Map<string, JobConfig>()
const likedImageIdsKey = "liked-image-ids.json"
const completedJobsIndexKey = "completed-jobs.json"
type CompletedJobIndexEntry = { id: string; createdAt: string }
let completedJobsIndex: Promise<CompletedJobIndexEntry[]> | undefined

function client() {
  const endpoint = process.env.S3_ENDPOINT
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey || !process.env.S3_BUCKET)
    throw new Error("S3-compatible storage is not configured")
  return new S3Client({ endpoint, region: "auto", credentials: { accessKeyId, secretAccessKey } })
}

export function publicUrlList(key: string): string[] {
  const baseUrlList = process.env.S3_PUBLIC_URL_LIST
  if (!baseUrlList) throw new Error("S3_PUBLIC_URL_LIST is not configured")
  const urls = baseUrlList
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .map((url) => `${url}/${key}`)
  if (!urls.length) throw new Error("S3_PUBLIC_URL_LIST must contain at least one URL")
  return urls
}

export async function upload(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function readLikedImageIds(): Promise<string[]> {
  try {
    const result = await client().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: likedImageIdsKey }),
    )
    if (!result.Body) return []
    const value = JSON.parse(await result.Body.transformToString())
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") return []
    throw error
  }
}

export async function writeLikedImageIds(ids: Iterable<string>): Promise<void> {
  await upload(
    likedImageIdsKey,
    Buffer.from(JSON.stringify([...ids].sort(), null, 2)),
    "application/json",
  )
}

async function readConfig(key: string): Promise<JobConfig> {
  const cached = configCache.get(key)
  if (cached) return cached
  const result = await client().send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
  )
  if (!result.Body) throw new Error(`Configuration ${key} has no content`)
  const config = JSON.parse(await result.Body.transformToString()) as JobConfig
  configCache.set(key, config)
  return config
}

async function listKeys(): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined
  do {
    const result = await client().send(
      new ListObjectsV2Command({
        Bucket: process.env.S3_BUCKET,
        ContinuationToken: continuationToken,
      }),
    )
    keys.push(...(result.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : [])))
    continuationToken = result.NextContinuationToken
  } while (continuationToken)
  return keys
}

function timestampFromImageKey(key: string): string | undefined {
  const match = key.match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2}Z)--pony\.webp$/)
  return match ? `${match[1]}:${match[2]}:${match[3]}` : undefined
}

async function buildCompletedJobsIndex(): Promise<CompletedJobIndexEntry[]> {
  const keys = new Set(await listKeys())
  const index = [...keys].flatMap((imageKey) => {
    const createdAt = timestampFromImageKey(imageKey)
    const thumbnailKey = imageKey.replace(/\.webp$/, ".thumb.webp")
    const configKey = imageKey.replace(/\.webp$/, ".config")
    return createdAt && keys.has(thumbnailKey) && keys.has(configKey)
      ? [{ id: imageKey.replace(/--pony\.webp$/, ""), createdAt }]
      : []
  })
  index.sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
  await upload(completedJobsIndexKey, Buffer.from(JSON.stringify(index)), "application/json")
  return index
}

async function readCompletedJobsIndex(): Promise<CompletedJobIndexEntry[]> {
  try {
    const result = await client().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: completedJobsIndexKey }),
    )
    if (!result.Body) return buildCompletedJobsIndex()
    const value = JSON.parse(await result.Body.transformToString())
    if (
      Array.isArray(value) &&
      value.every(
        (entry): entry is CompletedJobIndexEntry =>
          typeof entry?.id === "string" && typeof entry?.createdAt === "string",
      )
    )
      return value
    return buildCompletedJobsIndex()
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") return buildCompletedJobsIndex()
    throw error
  }
}

function getCompletedJobsIndex() {
  return (completedJobsIndex ??= readCompletedJobsIndex())
}

export async function recordCompletedJob(id: string): Promise<void> {
  const createdAt = timestampFromImageKey(`${id}--pony.webp`)
  if (!createdAt) throw new Error(`Invalid completed job ID: ${id}`)
  const index = await getCompletedJobsIndex()
  const nextIndex = [{ id, createdAt }, ...index.filter((entry) => entry.id !== id)]
  await upload(completedJobsIndexKey, Buffer.from(JSON.stringify(nextIndex)), "application/json")
  completedJobsIndex = Promise.resolve(nextIndex)
}

export type CompletedJobsPage = {
  jobs: Job[]
  nextCursor?: string | undefined
}

export async function listCompletedJobsPage({
  cursor,
  limit,
  offset = 0,
}: {
  cursor?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
} = {}): Promise<CompletedJobsPage> {
  const index = await getCompletedJobsIndex()
  const cursorIndex = cursor === undefined ? -1 : index.findIndex((entry) => entry.id === cursor)
  const start = cursorIndex + 1 + offset
  const end = limit === undefined ? undefined : start + limit
  const entries = index.slice(start, end)
  const jobs = await Promise.all(
    entries.map(async ({ id, createdAt }) => {
      const imageKey = `${id}--pony.webp`
      const thumbnailKey = imageKey.replace(/\.webp$/, ".thumb.webp")
      return {
        id,
        config: await readConfig(imageKey.replace(/\.webp$/, ".config")),
        status: "completed" as const,
        createdAt,
        startedAt: createdAt,
        finishedAt: createdAt,
        imageKey,
        imageUrls: publicUrlList(imageKey),
        thumbnailUrls: publicUrlList(thumbnailKey),
      }
    }),
  )
  return { jobs, nextCursor: end !== undefined && end < index.length ? jobs.at(-1)?.id : undefined }
}

export async function listCompletedJobs(): Promise<Job[]> {
  return (await listCompletedJobsPage()).jobs
}

export function imageName(): string {
  return `${new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "Z")}--pony.webp`
}
