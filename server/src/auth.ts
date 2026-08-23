import { randomBytes } from "node:crypto"
import type { Context, Next } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

const sessionCookie = "pony_session"

export function createAuth() {
  const sessions = new Set<string>()
  async function requireAuth(c: Context, next: Next) {
    const token = getCookie(c, sessionCookie)
    if (!token || !sessions.has(token)) return c.json({ error: "Authentication required" }, 401)
    return next()
  }
  function login(c: Context, password: string | undefined) {
    if (!process.env.PASSWORD || password !== process.env.PASSWORD)
      return c.json({ error: "Invalid password" }, 401)
    const token = randomBytes(32).toString("hex")
    sessions.add(token)
    setCookie(c, sessionCookie, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    return c.json({ authenticated: true })
  }
  function logout(c: Context) {
    const token = getCookie(c, sessionCookie)
    if (token) sessions.delete(token)
    deleteCookie(c, sessionCookie, { path: "/" })
    return c.json({ authenticated: false })
  }
  function isAuthenticated(c: Context) {
    const token = getCookie(c, sessionCookie)
    return Boolean(token && sessions.has(token))
  }
  return { requireAuth, login, logout, isAuthenticated }
}
