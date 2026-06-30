import type { MediaLoadingVariant } from "./types"
import { DottedGlowLoading } from "./dotted-glow"
import { GradientAnimationLoading } from "./gradient-animation"
import { SkeletonLoading } from "./skeleton"
import { SpaceTimeLoading } from "./space-time"

export type MediaLoadingProps = {
  label?: string
  detail?: string
  className?: string
}

const loadingVisuals = {
  skeleton: SkeletonLoading,
  "space-time": SpaceTimeLoading,
  "dotted-glow": DottedGlowLoading,
  "gradient-animation": GradientAnimationLoading,
} satisfies Record<MediaLoadingVariant, (props: MediaLoadingProps) => React.ReactNode>

export function MediaLoadingVisual(
  props: MediaLoadingProps & { variant: MediaLoadingVariant },
) {
  const Visual = loadingVisuals[props.variant]
  return <Visual label={props.label} detail={props.detail} className={props.className} />
}
