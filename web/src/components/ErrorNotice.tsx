import type { ReactNode } from "react"

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="border border-[#71413a] bg-[#442b28] p-3 text-[11px] text-[#efb3a6]">
      {children}
    </div>
  )
}
