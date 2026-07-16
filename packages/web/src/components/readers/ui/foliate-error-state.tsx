import { AlertCircleIcon } from "@/icons/app-icons"
import { DEFAULT_ERROR_TITLE, DEFAULT_ERROR_MESSAGE } from "../foliate-reader-constants"

export interface FoliateErrorStateProps {
  error: Error
}

export function FoliateErrorState({ error }: FoliateErrorStateProps) {
  return (
    <div className="flex h-full min-h-[22rem] items-center justify-center border border-border-critical-base/30 bg-surface-critical-weak/20 p-8">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <AlertCircleIcon className="size-5 text-icon-critical-base/70" />
        <div className="space-y-1">
          <div className="text-[12px] font-medium text-text-strong">{DEFAULT_ERROR_TITLE}</div>
          <div className="text-[12px] text-text-weak">{error.message || DEFAULT_ERROR_MESSAGE}</div>
        </div>
      </div>
    </div>
  )
}
