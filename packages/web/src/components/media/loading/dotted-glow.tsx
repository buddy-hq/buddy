import { EmptyDescription, EmptyHeader, EmptyTitle } from "@buddy/ui"
import { DottedGlowBackground } from "./dotted-glow-background"
import type { MediaLoadingProps } from "./index"

export function DottedGlowLoading({ label, detail, className }: MediaLoadingProps) {
  return (
    <>
      <DottedGlowBackground className={className} />
      {label || detail ? (
        <div className="absolute inset-0 flex items-center justify-center p-5 text-center">
          <EmptyHeader>
            {label ? <EmptyTitle>{label}</EmptyTitle> : null}
            {detail ? <EmptyDescription>{detail}</EmptyDescription> : null}
          </EmptyHeader>
        </div>
      ) : null}
    </>
  )
}
