import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { api } from "../api"
import { randomSeed } from "../utils"

type Options = {
  continuous: boolean
  setContinuous: Dispatch<SetStateAction<boolean>>
  instanceId: number | ""
  setInstanceId: Dispatch<SetStateAction<number | "">>
}

export function useStudio({ continuous, setContinuous, instanceId, setInstanceId }: Options) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [continuousRetry, setContinuousRetry] = useState(0)
  const [error, setError] = useState("")
  const [instances, setInstances] = useState<Instance[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [firstJobsLoaded, setFirstJobsLoaded] = useState(false)
  const [lastPreview, setLastPreview] = useState<GalleryPreview>()
  const [now, setNow] = useState(Date.now())
  const [readOnly, setReadOnly] = useState(false)
  const [username, setUsername] = useState("")

  async function refresh() {
    let url = "/jobs"
    if (!firstJobsLoaded) url += "?pageSize=100"
    api<{ jobs: Job[] }>(url).then(({ jobs }) => {
      setJobs(jobs)
      setFirstJobsLoaded(true)
    })
    const nextInstances = await api<Instance[]>("/instances")
    setInstances(nextInstances)
    if (instanceId === "") {
      const ready = nextInstances.find((instance) => instance.ready)
      if (ready) setInstanceId(ready.id)
    }
  }

  useEffect(() => {
    if (firstJobsLoaded) void refresh()
  }, [firstJobsLoaded])
  useEffect(() => {
    api<{ authenticated: boolean; username?: string; readOnly?: boolean }>("/auth/session")
      .then((data) => {
        setAuthenticated(data.authenticated)
        setUsername(data.username ?? "")
        setReadOnly(data.readOnly === true)
        if (data.authenticated) void refresh()
      })
      .catch(() => setAuthenticated(false))
  }, [])
  useEffect(() => {
    if (!authenticated) return
    const events = new EventSource("/api/events")
    events.addEventListener("job", () => void refresh())
    const timer = window.setInterval(() => void refresh(), 30_000)
    return () => {
      events.close()
      window.clearInterval(timer)
    }
  }, [authenticated])

  const hasLiveAge =
    instances.some((instance) => !instance.ready) ||
    jobs.some((job) => job.status === "queued" || job.status === "running")
  useEffect(() => {
    if (!hasLiveAge) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [hasLiveAge])

  async function createJob(config: Config, maxQueued?: number) {
    const result = await api<CreateJobResult>("/jobs", {
      method: "POST",
      body: JSON.stringify({ ...config, maxQueued }),
    })
    if (result.queued) setJobs((current) => [result.job, ...current])
    return result
  }
  async function submit(config: Config) {
    setBusy(true)
    setError("")
    try {
      await createJob(config)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not queue generation")
    } finally {
      setBusy(false)
    }
  }
  async function failJob(job: Job) {
    setError("")
    try {
      await api(`/jobs/${job.id}/fail`, { method: "POST" })
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not fail generation")
      throw reason
    }
  }
  async function instanceAction(path: string, init?: RequestInit) {
    setError("")
    try {
      await api(path, init)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Instance action failed")
    }
  }

  const lastCompletedImageId = useRef<string | undefined>(undefined)
  useEffect(() => {
    const lastCompletedImage = jobs
      .filter(
        (job) => job.status === "completed" && (job.thumbnailUrls?.length || job.imageUrls?.length),
      )
      .sort((first, second) => {
        if (first.finishedAt && second.finishedAt)
          return Date.parse(second.finishedAt) - Date.parse(first.finishedAt)
        return Date.parse(second.createdAt) - Date.parse(first.createdAt)
      })[0]
    if (lastCompletedImage && lastCompletedImage.id !== lastCompletedImageId.current) {
      lastCompletedImageId.current = lastCompletedImage.id
      setLastPreview({ kind: "image", job: lastCompletedImage })
    }
  }, [jobs])

  const continuousAttempting = useRef(false)
  const continuousRetryDelay = useRef(1000)
  const continuousRetryTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    return () => {
      if (continuousRetryTimer.current !== undefined) {
        window.clearTimeout(continuousRetryTimer.current)
        continuousRetryTimer.current = undefined
      }
    }
  }, [continuous, instanceId])
  useEffect(() => {
    if (!continuous || !instanceId) return
    const selectedInstance = instances.find((instance) => instance.id === instanceId)
    if (!selectedInstance?.ready) return
    const instanceJobs = jobs.filter((job) => job.config.instanceId === instanceId)
    if (instanceJobs.some((job) => job.status === "queued") || continuousAttempting.current) return
    const newestFirst = (first: Job, second: Job) =>
      Date.parse(second.startedAt ?? second.createdAt) -
      Date.parse(first.startedAt ?? first.createdAt)
    const source =
      jobs.filter((job) => job.status === "running").toSorted(newestFirst)[0] ??
      jobs.filter((job) => job.status === "completed").toSorted(newestFirst)[0]
    if (!source) return
    continuousAttempting.current = true
    void createJob({ ...source.config, seed: randomSeed(), instanceId }, 1)
      .then(() => {
        continuousRetryDelay.current = 1000
        continuousAttempting.current = false
      })
      .catch(() => {
        const delay = continuousRetryDelay.current
        if (delay >= 128000) {
          setContinuous(false)
          setError("Continuous generation stopped after repeated queueing failures.")
          return
        }
        continuousRetryDelay.current = Math.min(delay * 2, 128000)
        continuousRetryTimer.current = window.setTimeout(() => {
          continuousRetryTimer.current = undefined
          continuousAttempting.current = false
          setContinuousRetry((current) => current + 1)
        }, delay)
      })
  }, [continuous, continuousRetry, instanceId, instances, jobs])

  return {
    authenticated,
    setAuthenticated,
    busy,
    error,
    setError,
    instances,
    jobs,
    firstJobsLoaded,
    lastPreview,
    setLastPreview,
    now,
    readOnly,
    setReadOnly,
    username,
    setUsername,
    refresh,
    submit,
    failJob,
    instanceAction,
  }
}
