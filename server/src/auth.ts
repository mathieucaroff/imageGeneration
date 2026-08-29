import { randomBytes } from "node:crypto"
import type { Context, Next } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

const sessionCookie = "pony_session"
const sessionLifetimeSeconds = 60 * 60 * 24 * 30
const sessionsPath = new URL("../../.sessions.json", import.meta.url)
const credentialsPath = new URL("../../.userCredentials.json", import.meta.url)

type Session = { expiresAt: number; username: string; readOnly: boolean }
type StoredSession = Session & { token: string }

async function readCredentials(): Promise<Record<string, string>> {
  const file = Bun.file(credentialsPath)
  if (!(await file.exists())) throw new Error("User credentials are not configured")
  const value: unknown = await file.json()
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("User credentials must be a JSON object")
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
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
    if (activeSession.readOnly) return c.json({ error: "Read-only access" }, 403)
    return next()
  }
  async function login(c: Context, username: string | undefined, password: string | undefined) {
    const resolvedUsername = username ?? ""
    const readOnly = resolvedUsername !== ""
    let credentials: Record<string, string>
    try {
      credentials = await readCredentials()
    } catch (error) {
      console.error("Could not read user credentials:", error)
      return c.json({ error: "Authentication is unavailable" }, 503)
    }
    if (!Object.hasOwn(credentials, resolvedUsername) || password !== credentials[resolvedUsername])
      return c.json({ error: "Invalid password" }, 401)
    const token = randomBytes(32).toString("hex")
    sessions.set(token, {
      expiresAt: Date.now() + sessionLifetimeSeconds * 1000,
      username: resolvedUsername,
      readOnly,
    })
    await save()
    setCookie(c, sessionCookie, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionLifetimeSeconds,
    })
    return c.json({ authenticated: true, username: resolvedUsername, readOnly })
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
      for (const session of (await file.json()) as Array<Partial<StoredSession>>) {
        const expiresAt = session.expiresAt
        if (
          typeof session.token === "string" &&
          Number.isFinite(expiresAt) &&
          expiresAt !== undefined &&
          expiresAt > Date.now()
        )
          sessions.set(session.token, {
            expiresAt,
            username: typeof session.username === "string" ? session.username : "",
            readOnly: session.readOnly === true,
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
  }
}
