import { Button } from "../components/Button"
import { diffTags } from "../utils"

function DiffText({ value, previous }: { value: string; previous?: string }) {
  return (
    <span>
      {diffTags(value, previous).map((tag, index, tags) => (
        <span
          className={
            tag.kind === "added" ? "text-[#cfdc6a]" : tag.kind === "removed" ? "text-[#dc9b8f]" : ""
          }
          key={`${tag.text}-${index}`}
        >
          {tag.text}
          {index < tags.length - 1 ? ", " : ""}
        </span>
      ))}
    </span>
  )
}

export function ConfigTile({
  tile,
  onHover,
  onOpen,
  onSend,
}: {
  tile: Extract<GalleryTile, { kind: "config" }>
  onHover: () => void
  onOpen: () => void
  onSend: () => void
}) {
  return (
    <article
      className="group relative aspect-square w-[min(var(--tile-size),calc(100vw-2rem))] overflow-hidden border-[10%] bg-[#080a08] sm:w-[min(var(--tile-size),calc(100vw-5rem))]"
      style={{ borderColor: tile.color }}
    >
      <button
        className="size-full p-4 text-left text-[#d7d8ce] outline-offset-4 outline-[#d4df6f]"
        title="View full configuration"
        type="button"
        onClick={onOpen}
        onMouseEnter={onHover}
        onFocus={onHover}
      >
        <div className="font-['DM_Mono'] text-[10px] font-bold tracking-[.14em]">CONFIG</div>
        <div className="mt-4 flex h-[7.125rem] items-end overflow-hidden text-xs leading-relaxed">
          <DiffText value={tile.config.prompt} previous={tile.previous?.prompt} />
        </div>
        <div className="mt-3 flex h-[3rem] items-end overflow-hidden text-[10px] leading-relaxed opacity-75">
          <DiffText value={tile.config.negative_prompt} previous={tile.previous?.negative_prompt} />
        </div>
        <div className="mt-4 font-['DM_Mono'] text-[10px]">
          <div
            className={
              tile.previous &&
              (tile.config.width !== tile.previous.width ||
                tile.config.height !== tile.previous.height)
                ? "font-bold"
                : ""
            }
          >
            {tile.config.width} x {tile.config.height}
          </div>
          <div className="mt-1">seed {tile.config.seed}</div>
        </div>
      </button>
      <div className="absolute right-2 bottom-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button className="px-2 py-1.5 text-[11px] font-bold" variant="primary" onClick={onSend}>
          Send
        </Button>
      </div>
    </article>
  )
}
