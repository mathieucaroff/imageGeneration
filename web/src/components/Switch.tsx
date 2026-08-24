export function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[#aeb1a5]">
      <span>{label}</span>
      <input
        checked={checked}
        className="peer sr-only"
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="relative h-5 w-9 border border-[#3a3e37] bg-[#20231f] transition-colors peer-checked:border-[#cfdc6a] peer-checked:bg-[#65702f] after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:bg-[#aeb1a5] after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-[#d4df6f]" />
    </label>
  )
}
