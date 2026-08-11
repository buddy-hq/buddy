import type { ReactNode } from "react"

type ReaderStatusPillProps = {
  children: ReactNode
}

export function ReaderStatusPill({ children }: ReaderStatusPillProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-weak-base bg-surface-raised-stronger-non-alpha/90 px-2.5 py-1 text-[11px] text-text-weaker shadow-sm backdrop-blur">
      {children}
    </span>
  )
}
