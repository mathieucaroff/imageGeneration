import { useState, type FormEvent } from "react"
import { api } from "./api"
import { Button } from "./components/Button"
import { ErrorNotice } from "./components/ErrorNotice"
import { FormField } from "./components/FormField"

type LoginSession = { authenticated: boolean; username: string; readOnly: boolean }

export function Login({ onLogin }: { onLogin: (session: LoginSession) => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const session = await api<LoginSession>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      })
      onLogin(session)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed")
    }
  }
  return (
    <main className="grid min-h-screen place-content-center justify-items-center bg-[radial-gradient(circle_at_50%_30%,#2a3427,transparent_28rem),#151714] font-['DM_Sans'] text-[#e9e5dc]">
      <div className="font-['DM_Mono'] text-sm font-bold tracking-[.08em] text-[#d4df6f]">
        PD<span className="px-1 text-[#e9e5dc]">.</span>XL
      </div>
      <h1 className="mt-4 font-['Fraunces'] text-[42px] font-semibold">Private image studio</h1>
      <p className="mb-8 text-[13px] text-[#92988b]">Connect to your Pony Diffusion workspace.</p>
      <form className="grid w-[min(330px,calc(100vw-48px))] gap-3" onSubmit={submit}>
        <FormField label="Username" htmlFor="username">
          <input
            className="h-10 border border-[#3a3e37] bg-[#20231f] px-3 text-[13px] text-[#e7e5dc] outline-none focus:border-[#bfc963]"
            id="username"
            autoFocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </FormField>
        <FormField label="Password" htmlFor="password">
          <input
            className="h-10 border border-[#3a3e37] bg-[#20231f] px-3 text-[13px] text-[#e7e5dc] outline-none focus:border-[#bfc963]"
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        <Button
          className="flex justify-between px-4 py-3 text-[12px] font-bold"
          variant="primary"
          type="submit"
        >
          Enter studio
        </Button>
        {error && <ErrorNotice>{error}</ErrorNotice>}
      </form>
    </main>
  )
}
