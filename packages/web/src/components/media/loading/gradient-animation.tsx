import { EmptyDescription, EmptyHeader, EmptyTitle } from "@buddy/ui"
import {
  BackgroundGradientAnimation,
  type GradientAnimationPalette,
  type GradientAnimationSpeed,
} from "./background-gradient-animation"
import type { MediaLoadingProps } from "./index"

type GradientAnimationLoadingProps = MediaLoadingProps & {
  palette?: GradientAnimationPalette
  speed?: GradientAnimationSpeed
}

const DEFAULT_GRADIENT_LOADING_PALETTE = "theme" satisfies GradientAnimationPalette

export function GradientAnimationLoading({
  label,
  detail,
  className,
  palette = DEFAULT_GRADIENT_LOADING_PALETTE,
  speed,
}: GradientAnimationLoadingProps) {
  return (
    <>
      <BackgroundGradientAnimation className={className} palette={palette} speed={speed} />
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
