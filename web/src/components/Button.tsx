import type { ButtonHTMLAttributes } from "react"

type ButtonVariant = "primary" | "secondary" | "danger" | "quiet"

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[#d4df6f] text-[#20241d] hover:bg-[#e3ec86]",
  secondary:
    "border border-[#42473d] bg-[#20231f] text-[#c5c9b8] hover:border-[#cfdc6a] hover:text-[#cfdc6a]",
  danger: "border border-[#9b554d] bg-[#9b554d] text-[#1a1715]",
  quiet: "text-[#aeb1a5]",
}

export function Button({
  className = "",
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
}) {
  return <button className={`${variants[variant]} ${className}`} {...props} />
}
