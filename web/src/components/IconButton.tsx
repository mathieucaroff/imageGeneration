import type { ButtonHTMLAttributes } from "react"

export function IconButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  if (props.title && !props["aria-label"]) {
    props["aria-label"] = props.title
  }

  return (
    <button
      className={[
        `grid size-8 place-items-center border border-[#42473d] bg-[#20231f]`,
        `text-[#d7d8ce] transition-colors hover:border-[#cfdc6a] hover:text-[#cfdc6a]`,
        `disabled:cursor-not-allowed disabled:border-[#34372f] disabled:text-[#62665c]`,
        className,
      ].join(" ")}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}
