import { useEffect, useRef, useState } from "react"
import { api } from "./api"
import { Button } from "./components/Button"
import { IconButton } from "./components/IconButton"
import { Gallery } from "./Gallery"
import { clamp } from "./utils"

export function AppReadOnly({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoaded, setJobsLoaded] = useState(false)
  const [zoom, setZoom] = useState(260)
  const [now, setNow] = useState(Date.now())
  const galleryRef = useRef<HTMLDivElement>(null)

  async function refresh() {
    setJobs(await api<Job[]>("/jobs"))
    setJobsLoaded(true)
  }

  useEffect(() => {
    void refresh()
    const events = new EventSource("/api/events")
    events.addEventListener("job", () => void refresh())
    const timer = window.setInterval(() => void refresh(), 10000)
    return () => {
      events.close()
      window.clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    if (!jobs.some((job) => job.status === "queued" || job.status === "running")) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [jobs])

  function adjustZoom(direction: -1 | 1) {
    setZoom((currentZoom) => {
      if (!galleryRef.current) return clamp(currentZoom + direction * 10, 30, 900)
      const width = galleryRef.current.clientWidth
      const floorCount = Math.floor(width / currentZoom)
      return clamp(Math.floor(width / (floorCount - direction) - 0.01), 30, 900)
    })
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_78%_0%,#263127_0,transparent_31rem),#151714] font-['DM_Sans'] text-[#e9e5dc]">
      <header className="sticky top-0 z-10 flex min-h-[68px] items-center justify-between gap-4 border-b border-[#30332e] bg-[#191c18cc] px-5 backdrop-blur md:px-10">
        <div className="flex items-center gap-3 text-sm tracking-wide">
          <span className="grid size-[30px] place-items-center bg-[#d4df6f] text-[11px] font-bold tracking-tighter text-[#1a1e16]">
            PD
          </span>
          <span>pony viewer</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="mx-2 flex min-w-0 items-center gap-2 text-[11px] whitespace-nowrap text-[#aeb1a5]">
            <span className="hidden lg:inline">Tile size</span>
            <input
              aria-label="Tile size"
              className="w-30 accent-[#cfdc6a] sm:w-52 lg:w-120 xl:w-190"
              type="range"
              min="30"
              max="900"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <span className="mx-1 grid gap-px">
              <IconButton
                className="size-5 border-[#42473d] text-xs"
                title="Increase tile size"
                onClick={() => adjustZoom(1)}
              >
                +
              </IconButton>
              <IconButton
                className="size-5 border-[#42473d] text-xs"
                title="Decrease tile size"
                onClick={() => adjustZoom(-1)}
              >
                -
              </IconButton>
            </span>
            <output className="font-['DM_Mono'] text-[11px] text-[#cfdc6a]">{zoom}px</output>
          </label>
          <span className="text-xs text-[#aeb1a5]">{username}</span>
          <Button className="text-xs" variant="quiet" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </header>
      <Gallery
        galleryRef={galleryRef}
        jobs={jobs}
        jobsLoaded={jobsLoaded}
        now={now}
        zoom={zoom}
        readOnly
        onRefresh={refresh}
        onHoverPreview={() => {}}
        onPreviewOpened={() => {}}
      />
    </div>
  )
}
