import { EmptyDescription, EmptyHeader, EmptyTitle } from "@buddy/ui"
import { BackgroundGradientAnimation, type GradientAnimationSpeed } from "./background-gradient-animation"
import type { MediaLoadingProps } from "./index"

type GradientAnimationLoadingProps = MediaLoadingProps & {
  speed?: GradientAnimationSpeed
}

export function GradientAnimationLoading({ label, detail, className, speed }: GradientAnimationLoadingProps) {
  return (
    <>
      <BackgroundGradientAnimation className={className} speed={speed} />
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
