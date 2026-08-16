const API_BASE = "https://console.vast.ai/api/v0"
// Only GET /instances (list) has been migrated off v0 so far; everything else
// below (bundles, asks, single-instance PUT/DELETE) still lives on v0.
const API_BASE_V1 = "https://console.vast.ai/api/v1"

function apiKey(): string {
  const key = process.env.VASTAI_API_KEY
  if (!key) throw new Error("VASTAI_API_KEY is not set (check .env)")
  return key
}

async function vastFetch<T>(path: string, init: RequestInit = {}, base = API_BASE): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Vast.ai API ${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`)
  }
  try {
    return text ? (JSON.parse(text) as T) : ({} as T)
  } catch (err) {
    console.log("JSON parsing error:", text.slice(0, 200))
    throw new Error(`Failed to parse Vast.ai API response: ${err}`)
  }
}

export interface Offer {
  id: number
  machine_id: number
  gpu_name: string
  num_gpus: number
  dph_total: number
  driver_version: string
}

export interface Instance {
  id: number
  machine_id: number
  actual_status: string
  start_date?: number | null
  gpu_name: string
  label: string | null
  dph_total: number
  country_code?: string | null
  geolocation?: string | null
  public_ipaddr?: string
  ports?: Record<string, Array<{ HostIp: string; HostPort: string }>> | null
  ssh_host?: string | null
  ssh_port?: number | null
  jupyter_token?: string | null
}

// Vast.ai mirrors Docker's port-mapping shape: instance.ports["<port>/tcp"][0].HostPort
// is the externally-reachable port for a container port, on instance.public_ipaddr.
export function findExposedPort(
  instance: Instance,
  containerPort: number,
): { host: string; port: number } | null {
  const mapping = instance.ports?.[`${containerPort}/tcp`]?.[0]
  if (!instance.public_ipaddr || !mapping) return null
  return { host: instance.public_ipaddr, port: Number(mapping.HostPort) }
}

export async function searchRtx4090Offers(maxPricePerHour: number): Promise<Offer[]> {
  const data = await vastFetch<{ offers: Offer[] }>("/bundles", {
    method: "POST",
    body: JSON.stringify({
      limit: 50,
      type: "on-demand",
      verified: { eq: true },
      gpu_name: { in: ["RTX 4090"] },
      num_gpus: { eq: 1 },
      rentable: { eq: true },
      rented: { eq: false },
      dph_total: { lte: maxPricePerHour },
      order: [["dph_total", "asc"]],
    }),
  })
  return data.offers ?? []
}

export async function createInstance(
  offerId: number,
  opts: { image: string; env?: string; disk?: number; onstart?: string },
): Promise<{ success: boolean; new_contract: number }> {
  return vastFetch(`/asks/${offerId}`, {
    method: "PUT",
    body: JSON.stringify({
      client_id: "me",
      image: opts.image,
      env: opts.env ?? "",
      disk: opts.disk ?? 32,
      onstart: opts.onstart,
      runtype: "ssh",
      target_state: "running",
      cancel_unavail: true,
    }),
  })
}

export async function listInstances(): Promise<Instance[]> {
  const data = await vastFetch<{ instances: Instance[] }>("/instances/", {}, API_BASE_V1)
  return data.instances ?? []
}

export async function setInstanceState(id: number, state: "running" | "stopped"): Promise<void> {
  await vastFetch(`/instances/${id}`, {
    method: "PUT",
    body: JSON.stringify({ state }),
  })
}

export async function destroyInstance(id: number): Promise<void> {
  await vastFetch(`/instances/${id}`, { method: "DELETE" })
}
