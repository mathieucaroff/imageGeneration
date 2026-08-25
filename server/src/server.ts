import { Hono } from "hono"
import { startInstanceSweep } from "./instance-service"
import { createJobService } from "./job-service"
import { registerRoutes } from "./routes"

const port = Number(process.env.PORT ?? 3000)
const idleMinutes = Number(process.env.IDLE_MINUTES ?? 20)
const app = new Hono()
const jobs = createJobService()

const auth = registerRoutes(app, jobs)
await auth.load()
await jobs.load()
startInstanceSweep(idleMinutes)

Bun.serve({ port, fetch: app.fetch })
console.log(`Image generation server listening on http://localhost:${port}`)
console.log(`Sweeping idle (${idleMinutes}m) and stuck-creating instances every 30 seconds.`)
