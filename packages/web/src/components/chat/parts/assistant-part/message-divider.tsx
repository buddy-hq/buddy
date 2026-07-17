type MessageDividerProps = {
  label: string
}

/**
 * Full-width label divider for turn boundaries (interrupted / compaction).
 * Equal generous padding on both sides so the boundary reads as a real break.
 * Interrupted turns skip the following turn-gap; this padding is the separation.
 */
export function MessageDivider({ label }: MessageDividerProps) {
  return (
    <div className="w-full py-6">
      <div className="flex items-center gap-4 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-weak/50">
        <span className="h-px flex-1 bg-border-weak-base" />
        <span className="shrink-0">{label}</span>
        <span className="h-px flex-1 bg-border-weak-base" />
      </div>
    </div>
  )
}
