import type { ReactNode } from "react"
import { ScrollTextIcon } from "@/icons/app-icons"
import { DEFAULT_EMPTY_MESSAGE } from "../foliate-reader-constants"

export interface FoliateEmptyStateProps {
  children?: ReactNode
}

export function FoliateEmptyState({ children }: FoliateEmptyStateProps) {
  return (
    <div className="flex h-full min-h-[22rem] items-center justify-center border border-dashed border-border-base/40 p-8">
      <div className="flex max-w-xs flex-col items-center gap-2 text-center">
        <ScrollTextIcon className="size-6 text-text-weaker/60" />
        <div className="space-y-1">
          <div className="text-[12px] font-medium text-text-weak">Reader ready</div>
          <div className="text-[12px] text-text-weaker">{children ?? DEFAULT_EMPTY_MESSAGE}</div>
        </div>
      </div>
    </div>
  )
}
