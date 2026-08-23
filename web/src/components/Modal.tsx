import type { ReactNode } from "react"

export function Modal({ children, labelledBy }: { children: ReactNode; labelledBy: string }) {
  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-[#080a08b8] p-4"
      role="presentation"
    >
      <div
        className="w-full max-w-sm border border-[#5b3b37] bg-[#20231f] p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </div>
  )
}
