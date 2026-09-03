import { useEffect, useRef, useState } from "react"
import { api } from "./api"
import { Gallery } from "./Gallery"
import { StudioHeader } from "./StudioHeader"
import { clamp } from "./utils"

export function AppReadOnly({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoaded, setJobsLoaded] = useState(false)
  const [zoom, setZoom] = useState(260)
  const [now, setNow] = useState(Date.now())
  const galleryRef = useRef<HTMLDivElement>(null)

  async function refresh() {
    setJobs((await api<{ jobs: Job[] }>("/jobs")).jobs)
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

  function adjustZoom(direction: -1 | 0 | 1) {
    setZoom((currentZoom) => {
      if (!galleryRef.current) return clamp(currentZoom + direction * 10, 30, 900)
      const width = galleryRef.current.clientWidth
      const floorCount = Math.floor(width / currentZoom)
      return clamp(Math.floor(width / (floorCount - direction) - 0.01), 30, 900)
    })
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_78%_0%,#263127_0,transparent_31rem),#151714] font-['DM_Sans'] text-[#e9e5dc]">
      <StudioHeader
        zoom={zoom}
        zoomIsAdjusted
        title="pony viewer"
        username={username}
        showReadyCount={false}
        onZoom={setZoom}
        onAdjustZoom={adjustZoom}
        onSignOut={onSignOut}
      />
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
