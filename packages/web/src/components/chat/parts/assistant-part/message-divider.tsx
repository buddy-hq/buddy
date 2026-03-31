interface MessageDividerProps {
  label: string
}

export function MessageDivider({ label }: MessageDividerProps) {
  return (
    <div className="w-full py-1">
      <div className="flex items-center gap-3 text-xs text-text-weak">
        <span className="h-px flex-1 bg-border" />
        <span>{label}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}
