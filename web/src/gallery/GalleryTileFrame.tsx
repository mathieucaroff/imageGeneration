import type { CSSProperties, ReactNode } from "react"

export function GalleryTileFrame({
  children,
  content,
  color,
  onHover,
  onOpen,
  title,
  buttonClassName,
  className,
  style,
}: {
  children: ReactNode
  content: ReactNode
  color: string
  onHover: () => void
  onOpen: () => void
  title: string
  buttonClassName: string
  className: string
  style: CSSProperties
}) {
  return (
    <article
      className={`group relative aspect-square w-[min(var(--tile-size),calc(100dvw-48px))] overflow-hidden ${className}`}
      style={{ ...style, borderColor: color }}
    >
      <button
        className={buttonClassName}
        title={title}
        type="button"
        onClick={onOpen}
        onMouseEnter={onHover}
        onFocus={onHover}
      >
        {content}
      </button>
      {children}
    </article>
  )
}
