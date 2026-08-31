import { randomBytes } from "node:crypto"
import type { Context, Next } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

const sessionCookie = "pony_session"
const sessionLifetimeSeconds = 60 * 60 * 24 * 30
const sessionsPath = new URL("../../.sessions.json", import.meta.url)
const credentialsPath = new URL("../../.user.json", import.meta.url)

type Access = "read" | "write" | "admin" | "superadmin"
type Credential = { username: string; password: string; access: Access }
type Session = { expiresAt: number; username: string; access: Access }
type StoredSession = Session & { token: string }
type CredentialInput = Omit<Credential, "access"> & { access?: Access }
type LegacyStoredSession = {
  token?: unknown
  expiresAt?: unknown
  username?: unknown
  access?: unknown
  readOnly?: boolean
}

function isAccess(value: unknown): value is Access {
  return value === "read" || value === "write" || value === "admin" || value === "superadmin"
}

async function readCredentials(): Promise<Credential[]> {
  const file = Bun.file(credentialsPath)
  if (!(await file.exists())) throw new Error("User credentials are not configured")
  const value: unknown = await file.json()
  if (!Array.isArray(value)) throw new Error("User credentials must be a JSON array")
  if (
    !value.every(
      (credential): credential is CredentialInput =>
        credential !== null &&
        typeof credential === "object" &&
        typeof credential.username === "string" &&
        typeof credential.password === "string" &&
        (credential.access === undefined || isAccess(credential.access)),
    )
  )
    throw new Error("Each user must have username, password, and an optional valid access level")
  return value.map((credential) => ({ ...credential, access: credential.access ?? "read" }))
}

export function createAuth() {
  const sessions = new Map<string, Session>()
  async function save() {
    const storedSessions: StoredSession[] = [...sessions].map(([token, session]) => ({
      token,
      ...session,
    }))
    await Bun.write(sessionsPath, JSON.stringify(storedSessions, null, 2))
  }
  function session(c: Context) {
    const token = getCookie(c, sessionCookie)
    const value = token ? sessions.get(token) : undefined
    return value && value.expiresAt > Date.now() ? value : undefined
  }
  async function requireAuth(c: Context, next: Next) {
    if (!session(c)) return c.json({ error: "Authentication required" }, 401)
    return next()
  }
  async function requireWriteAuth(c: Context, next: Next) {
    const activeSession = session(c)
    if (!activeSession) return c.json({ error: "Authentication required" }, 401)
    if (activeSession.access === "read") return c.json({ error: "Read-only access" }, 403)
    return next()
  }
  async function requireSuperadminAuth(c: Context, next: Next) {
    const activeSession = session(c)
    if (!activeSession) return c.json({ error: "Authentication required" }, 401)
    if (activeSession.access !== "superadmin")
      return c.json({ error: "Superadmin access required" }, 403)
    return next()
  }
  async function login(c: Context, username: string | undefined, password: string | undefined) {
    const resolvedUsername = username ?? ""
    let credentials: Credential[]
    try {
      credentials = await readCredentials()
    } catch (error) {
      console.error("Could not read user credentials:", error)
      return c.json({ error: "Authentication is unavailable" }, 503)
    }
    const credential = credentials.find((candidate) => candidate.username === resolvedUsername)
    if (!credential || password !== credential.password)
      return c.json({ error: "Invalid password" }, 401)
    const token = randomBytes(32).toString("hex")
    sessions.set(token, {
      expiresAt: Date.now() + sessionLifetimeSeconds * 1000,
      username: resolvedUsername,
      access: credential.access,
    })
    await save()
    setCookie(c, sessionCookie, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionLifetimeSeconds,
    })
    return c.json({
      authenticated: true,
      username: resolvedUsername,
      access: credential.access,
      readOnly: credential.access === "read",
    })
  }
  async function logout(c: Context) {
    const token = getCookie(c, sessionCookie)
    if (token) {
      sessions.delete(token)
      await save()
    }
    deleteCookie(c, sessionCookie, { path: "/" })
    return c.json({ authenticated: false })
  }
  function isAuthenticated(c: Context) {
    return Boolean(session(c))
  }
  return {
    async load() {
      const file = Bun.file(sessionsPath)
      if (!(await file.exists())) return
      for (const session of (await file.json()) as LegacyStoredSession[]) {
        const expiresAt = session.expiresAt
        if (
          typeof session.token === "string" &&
          typeof expiresAt === "number" &&
          Number.isFinite(expiresAt) &&
          expiresAt > Date.now()
        )
          sessions.set(session.token, {
            expiresAt,
            username: typeof session.username === "string" ? session.username : "",
            access: isAccess(session.access)
              ? session.access
              : session.access === "" || session.readOnly === true
                ? "read"
                : "admin",
          })
      }
      await save()
    },
    requireAuth,
    login,
    logout,
    isAuthenticated,
    session,
    requireWriteAuth,
    requireSuperadminAuth,
  }
}
