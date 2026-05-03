import { cn } from "@buddy/ui"

type HiddenStepsPlaceholderProps = {
  detail?: string
}

export function HiddenStepsPlaceholder(props: HiddenStepsPlaceholderProps) {
  return (
    <div className="w-full" data-abstracted-thinking-placeholder="">
      <div className="group flex w-full flex-col items-stretch text-left">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("min-w-0 truncate text-xs animate-pulse text-text-weak")}>
            Thinking
          </span>
          {props.detail ? (
            <span className="min-w-0 truncate text-xs animate-pulse text-text-weak/30">
              {props.detail}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
