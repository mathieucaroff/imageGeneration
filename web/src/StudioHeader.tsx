import { Button } from "./components/Button"
import { IconButton } from "./components/IconButton"
import { StatusIndicator } from "./components/StatusIndicator"

type StudioHeaderProps = {
  zoom: number
  zoomIsAdjusted: boolean
  readyCount?: number
  title?: string
  username?: string
  showReadyCount?: boolean
  onZoom: (zoom: number) => void
  onAdjustZoom: (direction: -1 | 0 | 1) => void
  onSignOut: () => void
}

export function StudioHeader({
  zoom,
  zoomIsAdjusted,
  readyCount,
  title = "pony studio",
  username,
  showReadyCount = true,
  onZoom,
  onAdjustZoom,
  onSignOut,
}: StudioHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex min-h-[68px] flex-wrap items-center justify-between gap-4 border-b border-[#30332e] bg-[#191c18cc] px-5 py-3 backdrop-blur md:px-10">
      <div className="flex items-center gap-3 text-sm tracking-wide">
        <span className="grid size-[30px] place-items-center bg-[#d4df6f] text-[11px] font-bold tracking-tighter text-[#1a1e16]">
          PD
        </span>
        <span>{title}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 text-sm">
        <label className="flex min-w-0 items-center gap-2 text-[11px] whitespace-nowrap text-[#aeb1a5]">
          <span className="hidden lg:inline">Tile size</span>
          <input
            aria-label="Tile size"
            className="w-20 accent-[#cfdc6a] sm:w-52 lg:w-120 xl:w-190"
            type="range"
            min="30"
            max="900"
            value={zoom}
            onChange={(event) => onZoom(Number(event.target.value))}
          />
          <span className="mx-1 grid gap-px">
            {zoomIsAdjusted ? (
              <>
                <IconButton
                  className="size-5 border-[#42473d] text-xs"
                  title="Increase tile size"
                  onClick={() => onAdjustZoom(1)}
                >
                  +
                </IconButton>
                <IconButton
                  className="size-5 border-[#42473d] text-xs"
                  title="Decrease tile size"
                  onClick={() => onAdjustZoom(-1)}
                >
                  -
                </IconButton>
              </>
            ) : (
              <IconButton
                className="size-5 border-[#42473d] text-xs"
                title="Adjust tile size"
                onClick={() => onAdjustZoom(0)}
              >
                o
              </IconButton>
            )}
          </span>
          <output className="font-['DM_Mono'] text-[11px] text-[#cfdc6a]">{zoom}px</output>
        </label>
        {showReadyCount && (
          <span className="hidden items-center gap-3 sm:flex">
            <StatusIndicator ready={(readyCount ?? 0) > 0} changing={false} />
            {readyCount ?? 0} ready
          </span>
        )}
        {username && <span className="max-w-24 truncate text-xs text-[#aeb1a5]">{username}</span>}
        <Button className="text-xs" variant="quiet" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
