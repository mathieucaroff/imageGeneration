import { useState, type FormEvent } from "react"
import { api } from "./api"

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ password }) })
      onLogin()
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
        <label className="grid gap-2 text-[11px] text-[#aeb1a5]" htmlFor="password">
          Password
          <input
            className="h-10 border border-[#3a3e37] bg-[#20231f] px-3 text-[13px] text-[#e7e5dc] outline-none focus:border-[#bfc963]"
            id="password"
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button
          className="flex justify-between bg-[#d4df6f] px-4 py-3 text-[12px] font-bold text-[#20241d] hover:bg-[#e3ec86]"
          type="submit"
        >
          Enter studio
        </button>
        {error && (
          <div className="border border-[#71413a] bg-[#442b28] p-3 text-[11px] text-[#efb3a6]">
            {error}
          </div>
        )}
      </form>
    </main>
  )
}
