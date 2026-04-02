import { cn } from "@buddy/ui"
import { useEffect, useState } from "react"

interface MessageDividerProps {
  label: string
}

export function MessageDivider({ label }: MessageDividerProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      className={cn(
        "w-full py-3 transition-all duration-400 ease-out",
        mounted ? "translate-y-0 opacity-100 scale-100" : "translate-y-1 opacity-0 scale-[0.98]",
      )}
    >
      <div className="flex items-center gap-4 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-weak/50">
        <span className="h-px flex-1 bg-border-weak" />
        <span className="shrink-0">{label}</span>
        <span className="h-px flex-1 bg-border-weak" />
      </div>
    </div>
  )
}
