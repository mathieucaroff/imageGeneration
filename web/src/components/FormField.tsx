import type { ReactNode } from "react"

export function FormField({
  children,
  label,
  htmlFor,
}: {
  children: ReactNode
  label: string
  htmlFor?: string
}) {
  return (
    <label className="grid gap-2 text-[11px] text-[#aeb1a5]" htmlFor={htmlFor}>
      {label}
      {children}
    </label>
  )
}
