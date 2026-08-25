import { randomBytes } from "node:crypto"
import type { Context, Next } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

const sessionCookie = "pony_session"
const sessionLifetimeSeconds = 60 * 60 * 24 * 30
const sessionsPath = new URL("../../.sessions.json", import.meta.url)

type StoredSession = { token: string; expiresAt: number }

export function createAuth() {
  const sessions = new Map<string, number>()
  async function save() {
    const storedSessions: StoredSession[] = [...sessions].map(([token, expiresAt]) => ({
      token,
      expiresAt,
    }))
    await Bun.write(sessionsPath, JSON.stringify(storedSessions, null, 2))
  }
  function hasSession(token: string) {
    const expiresAt = sessions.get(token)
    return expiresAt !== undefined && expiresAt > Date.now()
  }
  async function requireAuth(c: Context, next: Next) {
    const token = getCookie(c, sessionCookie)
    if (!token || !hasSession(token)) return c.json({ error: "Authentication required" }, 401)
    return next()
  }
  async function login(c: Context, password: string | undefined) {
    if (!process.env.PASSWORD || password !== process.env.PASSWORD)
      return c.json({ error: "Invalid password" }, 401)
    const token = randomBytes(32).toString("hex")
    sessions.set(token, Date.now() + sessionLifetimeSeconds * 1000)
    await save()
    setCookie(c, sessionCookie, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionLifetimeSeconds,
    })
    return c.json({ authenticated: true })
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
    const token = getCookie(c, sessionCookie)
    return Boolean(token && hasSession(token))
  }
  return {
    async load() {
      const file = Bun.file(sessionsPath)
      if (!(await file.exists())) return
      for (const session of (await file.json()) as StoredSession[]) {
        if (
          typeof session.token === "string" &&
          Number.isFinite(session.expiresAt) &&
          session.expiresAt > Date.now()
        )
          sessions.set(session.token, session.expiresAt)
      }
      await save()
    },
    requireAuth,
    login,
    logout,
    isAuthenticated,
  }
}
