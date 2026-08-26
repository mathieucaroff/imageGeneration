interface StatusIndicatorProp {
  changing: boolean
  ready: boolean
}

export function StatusIndicator({ changing, ready }: StatusIndicatorProp) {
  if (changing) {
    return (
      <span className="size-3 animate-spin rounded-full border-2 border-[#596047] border-t-[#cfdc6a]" />
    )
  }
  return (
    <span
      className={`inline-block size-[7px] rounded-full ${ready ? "bg-[#b8c457] shadow-[0_0_0_4px_#b8c4571c]" : "bg-[#777b71]"}`}
    />
  )
}
