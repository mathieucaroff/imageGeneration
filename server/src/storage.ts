import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

function client() {
  const endpoint = process.env.S3_ENDPOINT
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey || !process.env.S3_BUCKET)
    throw new Error("S3-compatible storage is not configured")
  return new S3Client({ endpoint, region: "auto", credentials: { accessKeyId, secretAccessKey } })
}

export function publicUrl(key: string): string {
  const baseUrl = process.env.S3_PUBLIC_URL
  if (!baseUrl) throw new Error("S3_PUBLIC_URL is not configured")
  return `${baseUrl.replace(/\/$/, "")}/${key}`
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

export function imageName(): string {
  return `${new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "Z")}--pony.webp`
}
