import type { Hono } from "hono"
import { buildOnstartScript, provisioningStatus } from "../../lib/provisioning"
import { stopOrDestroyInstance } from "../../lib/instance-lifecycle"
import { CHECKPOINT_FILE, COMFYUI_PORT } from "../../lib/pony"
import { MAX_PRICE_PER_HOUR } from "../../lib/pricing"
import {
  createInstance,
  destroyInstance,
  listInstances,
  searchRtx4090Offers,
  setInstanceState,
} from "../../lib/vastai"
import { createAuth } from "./auth"
import { errorMessage } from "./errors"
import { resolveReadyInstance } from "./instance-service"
import type { JobService } from "./job-service"
import { readLikedImageIds, writeLikedImageIds } from "./storage"

const defaultNegative = "score_4, score_5, score_6, worst quality, low quality, blurry"

export function registerRoutes(app: Hono, jobs: JobService) {
  const auth = createAuth()
  let likedImageIds: Promise<Set<string>> | undefined
  const likes = () => (likedImageIds ??= readLikedImageIds().then((ids) => new Set(ids)))
  app.post("/api/auth/login", async (c) => {
    const { username, password } = await c.req.json<{ username?: string; password?: string }>()
    return auth.login(c, username, password)
  })
  app.post("/api/auth/logout", auth.logout)
  app.get("/api/auth/session", (c) => {
    const session = auth.session(c)
    return c.json({
      authenticated: Boolean(session),
      username: session?.username,
      readOnly: session?.access === "read",
    })
  })
  app.use("/api/instances", auth.requireAuth)
  app.use("/api/instances/*", auth.requireAuth)
  app.use("/api/jobs", auth.requireAuth)
  app.use("/api/jobs/*", auth.requireAuth)
  app.use("/api/likes", auth.requireAuth)
  app.use("/api/likes/*", auth.requireAuth)
  app.use("/api/events", auth.requireAuth)
  app.post("/api/instances/*", auth.requireWriteAuth)
  app.delete("/api/instances/*", auth.requireWriteAuth)
  app.delete("/api/instances", auth.requireWriteAuth)
  app.post("/api/jobs/*", auth.requireWriteAuth)
  app.post("/api/jobs", auth.requireWriteAuth)
  app.put("/api/likes/*", auth.requireWriteAuth)
  app.post("/api/server/upgrade", auth.requireSuperadminAuth)

  app.get("/api/instances", async (c) =>
    c.json(
      await Promise.all(
        (await listInstances()).map(async (instance) => {
          const provisioning = await provisioningStatus(instance)
          const ready =
            instance.actual_status === "running" && ["ready", "cached"].includes(provisioning)
          return {
            ...instance,
            provisioning,
            ready,
          }
        }),
      ),
    ),
  )
  app.post("/api/instances/:id/start", async (c) => {
    const id = Number(c.req.param("id"))
    const instance = (await listInstances()).find((candidate) => candidate.id === id)
    if (!instance || instance.actual_status !== "stopped")
      return c.json({ error: "Only stopped instances can be started" }, 400)
    await setInstanceState(id, "running")
    return c.json({ started: true })
  })
  app.post("/api/instances/provision", async (c) => {
    const offer = (await searchRtx4090Offers(MAX_PRICE_PER_HOUR))[0]
    if (!offer) return c.json({ error: "No eligible RTX 4090 offer available" }, 503)
    return c.json(
      await createInstance(offer.id, {
        image: process.env.VASTAI_IMAGE ?? "ghcr.io/ai-dock/comfyui:latest-cuda",
        env: `-p ${COMFYUI_PORT}:${COMFYUI_PORT} -p 22:22`,
        disk: 40,
        onstart: buildOnstartScript(),
      }),
      201,
    )
  })
  app.post("/api/instances/:id/stop", async (c) => {
    const instance = (await listInstances()).find(
      (candidate) => candidate.id === Number(c.req.param("id")),
    )
    if (!instance) return c.json({ error: "Instance not found" }, 404)
    return c.json({ result: await stopOrDestroyInstance(instance) })
  })
  app.delete("/api/instances/:id", async (c) => {
    await destroyInstance(Number(c.req.param("id")))
    return c.json({ deleted: true })
  })
  app.post("/api/instances/stop-all", async (c) => {
    const active = (await listInstances()).filter(
      (instance) => instance.actual_status !== "stopped",
    )
    await Promise.all(active.map(stopOrDestroyInstance))
    return c.json({ count: active.length })
  })
  app.delete("/api/instances", async (c) => {
    const instances = await listInstances()
    await Promise.all(instances.map((instance) => destroyInstance(instance.id)))
    return c.json({ count: instances.length })
  })
  app.post("/api/server/upgrade", (c) => {
    const upgradeScript = process.env.UPGRADE_SCRIPT
    if (!upgradeScript) return c.json({ error: "UPGRADE_SCRIPT is not configured" }, 503)
    Bun.spawn({ cmd: [upgradeScript], stderr: "ignore", stdout: "ignore" })
    return c.json({ started: true }, 202)
  })

  app.get("/api/jobs", async (c) => c.json(await jobs.list()))
  app.get("/api/likes", async (c) => c.json({ ids: [...(await likes())] }))
  app.put("/api/likes/:id", async (c) => {
    const id = c.req.param("id")
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/.test(id))
      return c.json({ error: "Invalid image ID" }, 400)
    const { liked } = await c.req.json<{ liked?: boolean }>()
    if (typeof liked !== "boolean") return c.json({ error: "liked is required" }, 400)
    const ids = await likes()
    if (liked) ids.add(id)
    else ids.delete(id)
    await writeLikedImageIds(ids)
    return c.json({ ids: [...ids] })
  })
  app.post("/api/jobs/:id/fail", async (c) => {
    if (!(await jobs.fail(c.req.param("id")))) return c.json({ error: "Job is not active" }, 409)
    return c.json({ failed: true })
  })
  app.post("/api/jobs", async (c) => {
    const body = await c.req.json<Partial<JobConfig> & { maxQueued?: number }>()
    const instanceId = Number(body.instanceId)
    if (!body.prompt?.trim()) return c.json({ error: "prompt is required" }, 400)
    if (!Number.isInteger(instanceId)) return c.json({ error: "instanceId is required" }, 400)
    const width = Number(body.width ?? 1024)
    const height = Number(body.height ?? 1024)
    const seed = Number(body.seed ?? Math.floor(Math.random() * 2 ** 32))
    if (
      ![width, height, seed].every(Number.isFinite) ||
      width < 64 ||
      height < 64 ||
      width > 2048 ||
      height > 2048
    )
      return c.json({ error: "Invalid dimensions or seed" }, 400)
    const maxQueued = body.maxQueued === undefined ? undefined : Number(body.maxQueued)
    if (maxQueued !== undefined && (!Number.isInteger(maxQueued) || maxQueued < 0))
      return c.json({ error: "maxQueued must be a non-negative integer" }, 400)
    try {
      await resolveReadyInstance(instanceId)
    } catch (error) {
      return c.json({ error: errorMessage(error) }, 409)
    }
    const config: JobConfig = {
      prompt: body.prompt.trim(),
      negative_prompt: body.negative_prompt ?? defaultNegative,
      width,
      height,
      seed,
      instanceId,
      submittedInstanceId: instanceId,
      steps: 25,
      cfg: 7,
      sampler: "euler_ancestral",
      scheduler: "karras",
      denoise: 1,
      model: CHECKPOINT_FILE,
    }
    return c.json(await jobs.create(config, maxQueued), 202)
  })
  app.get("/api/events", (c) => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        const send = (job: unknown) =>
          controller.enqueue(encoder.encode(`event: job\ndata: ${JSON.stringify(job)}\n\n`))
        const unsubscribe = jobs.subscribe(send)
        controller.enqueue(encoder.encode('event: ready\ndata: {"connected":true}\n\n'))
        c.req.raw.signal.addEventListener("abort", unsubscribe, { once: true })
      },
    })
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  })
  return auth
}
