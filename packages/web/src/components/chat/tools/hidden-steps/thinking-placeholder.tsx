import { Panda } from "lucide-react"
import { TextShimmer } from "../text-shimmer"
import { ABSTRACTED_THINKING_LABEL } from "./entries"

type HiddenStepsPlaceholderProps = {
  detail?: string
}

export function HiddenStepsPlaceholder({ detail }: HiddenStepsPlaceholderProps) {
  return (
    <div className="w-full" data-abstracted-thinking-placeholder="">
      <div className="flex min-w-0 w-full cursor-default items-center gap-2 text-xs text-text-weaker">
        <Panda className="h-3.5 w-3.5 shrink-0" />
        <TextShimmer
          text={detail ?? ABSTRACTED_THINKING_LABEL}
          truncate
          className="min-w-0 shrink"
        />
        <div className="h-px min-w-6 grow bg-linear-to-r from-border to-transparent" />
      </div>
    </div>
  )
}
