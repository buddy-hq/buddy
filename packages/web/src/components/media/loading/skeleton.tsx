import { EmptyDescription, EmptyHeader, EmptyTitle, Skeleton } from "@buddy/ui"
import type { MediaLoadingProps } from "./index"

export function SkeletonLoading({ label, detail, className }: MediaLoadingProps) {
  return (
    <>
      <Skeleton className={className} />
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
