import type { ReactNode } from "react"

export function Modal({
  children,
  labelledBy,
  className = "",
  maxWidth = "max-w-sm",
  onBackdropClick,
  unframed = false,
}: {
  children: ReactNode
  labelledBy: string
  className?: string
  maxWidth?: string
  onBackdropClick?: () => void
  unframed?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-[#080a08b8] p-4"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        className={`${unframed ? "w-fit" : "w-full border border-[#5b3b37] bg-[#20231f] p-5 shadow-2xl"} ${maxWidth} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
