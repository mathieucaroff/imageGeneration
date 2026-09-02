import { Hono } from "hono"
import { createJobService } from "./job-service"
import { registerRoutes } from "./routes"
import { sweepInstances } from "../../lib/instance-sweep"
import { destroyInstance } from "../../lib/vastai"

const port = Number(process.env.PORT ?? 3000)
const idleMinutes = Number(process.env.IDLE_MINUTES ?? 30)
const app = new Hono()
const jobs = createJobService()

const auth = registerRoutes(app, jobs)
await auth.load()
// startInstanceSweep(idleMinutes)

Bun.serve({ port, fetch: app.fetch })
console.log(`Image generation server listening on http://localhost:${port}`)
// console.log(`Sweeping idle (${idleMinutes}m) and stuck-creating instances every 30 seconds.`)

function startInstanceSweep(idleMinutes: number): void {
  const sweep = () =>
    void sweepInstances({ idleMinutes, onIdle: (instance) => destroyInstance(instance.id) }).catch(
      (error) =>
        console.error(`Instance sweep failed: ${error instanceof Error ? error.message : error}`),
    )
  sweep()
  setInterval(sweep, 30_000)
}
