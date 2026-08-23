export function StatusDot({ ready }: { ready: boolean }) {
  return (
    <span
      className={`inline-block size-[7px] rounded-full ${ready ? "bg-[#b8c457] shadow-[0_0_0_4px_#b8c4571c]" : "bg-[#777b71]"}`}
    />
  )
}
