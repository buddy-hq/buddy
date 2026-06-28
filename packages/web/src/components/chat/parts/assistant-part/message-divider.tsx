type MessageDividerProps = {
  label: string
}

export function MessageDivider({ label }: MessageDividerProps) {
  return (
    <div className="w-full py-1">
      <div className="flex items-center gap-4 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-weak/50">
        <span className="h-px flex-1 bg-border-weak-base" />
        <span className="shrink-0">{label}</span>
        <span className="h-px flex-1 bg-border-weak-base" />
      </div>
    </div>
  )
}
