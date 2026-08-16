import { cn } from "@buddy/ui"
import { useEffect, useId, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import "./background-gradient-animation.css"

type GradientAnimationSpeed = "normal" | "fast" | "faster"
type GradientAnimationPalette = "default" | "theme"

type GradientAnimationColors = {
  gradientBackgroundStart: string
  gradientBackgroundEnd: string
  firstColor: string
  secondColor: string
  thirdColor: string
  fourthColor: string
  fifthColor: string
  pointerColor: string
}

type GradientAnimationStyle = CSSProperties & {
  "--gradient-background-start": string
  "--gradient-background-end": string
  "--first-color": string
  "--second-color": string
  "--third-color": string
  "--fourth-color": string
  "--fifth-color": string
  "--pointer-color": string
  "--size": string
  "--blending-value": string
}

const DEFAULT_GRADIENT_ANIMATION_COLORS = {
  gradientBackgroundStart: "rgb(108, 0, 162)",
  gradientBackgroundEnd: "rgb(0, 17, 82)",
  firstColor: "rgb(18, 113, 255)",
  secondColor: "rgb(221, 74, 255)",
  thirdColor: "rgb(100, 220, 255)",
  fourthColor: "rgb(200, 50, 50)",
  fifthColor: "rgb(180, 180, 50)",
  pointerColor: "rgb(140, 100, 255)",
} satisfies GradientAnimationColors

const THEME_GRADIENT_ANIMATION_COLORS = {
  gradientBackgroundStart: `var(--background-base, ${DEFAULT_GRADIENT_ANIMATION_COLORS.gradientBackgroundStart})`,
  gradientBackgroundEnd: `color-mix(in oklab, var(--theme-primary-base, ${DEFAULT_GRADIENT_ANIMATION_COLORS.gradientBackgroundEnd}) 14%, var(--background-base, ${DEFAULT_GRADIENT_ANIMATION_COLORS.gradientBackgroundStart}))`,
  firstColor: `color-mix(in oklab, var(--theme-primary-base, ${DEFAULT_GRADIENT_ANIMATION_COLORS.firstColor}) 45%, var(--background-base, transparent))`,
  secondColor: `var(--theme-primary-base, ${DEFAULT_GRADIENT_ANIMATION_COLORS.secondColor})`,
  thirdColor: `color-mix(in oklab, var(--theme-primary-base, ${DEFAULT_GRADIENT_ANIMATION_COLORS.thirdColor}) 52%, var(--theme-accent-base, ${DEFAULT_GRADIENT_ANIMATION_COLORS.thirdColor}))`,
  fourthColor: `var(--theme-accent-base, ${DEFAULT_GRADIENT_ANIMATION_COLORS.fourthColor})`,
  fifthColor: `color-mix(in oklab, var(--theme-accent-base, ${DEFAULT_GRADIENT_ANIMATION_COLORS.fifthColor}) 55%, var(--background-base, transparent))`,
  pointerColor: `var(--theme-primary-base, ${DEFAULT_GRADIENT_ANIMATION_COLORS.pointerColor})`,
} satisfies GradientAnimationColors

const SPEED_MULTIPLIER = {
  normal: 1,
  fast: 0.6,
  faster: 0.35,
} satisfies Record<GradientAnimationSpeed, number>

// keyframe name, base duration (s), direction — matches official Aceternity defaults
const BLOB_ANIMATIONS = [
  { name: "bg-anim-move-vertical", duration: 30, direction: "normal" },
  { name: "bg-anim-move-in-circle", duration: 20, direction: "reverse" },
  { name: "bg-anim-move-in-circle", duration: 40, direction: "normal" },
  { name: "bg-anim-move-horizontal", duration: 40, direction: "normal" },
  { name: "bg-anim-move-in-circle", duration: 20, direction: "normal" },
] as const

function blobAnimation(index: number, speed: GradientAnimationSpeed): CSSProperties {
  const { name, duration, direction } = BLOB_ANIMATIONS[index]
  const d = duration * SPEED_MULTIPLIER[speed]
  return { animation: `${name} ${d}s ${direction} infinite` }
}

type BackgroundGradientAnimationProps = {
  palette?: GradientAnimationPalette
  gradientBackgroundStart?: string
  gradientBackgroundEnd?: string
  firstColor?: string
  secondColor?: string
  thirdColor?: string
  fourthColor?: string
  fifthColor?: string
  pointerColor?: string
  size?: string
  blendingValue?: string
  speed?: GradientAnimationSpeed
  children?: ReactNode
  className?: string
  interactive?: boolean
  containerClassName?: string
}

function BackgroundGradientAnimation({
  palette = "default",
  gradientBackgroundStart,
  gradientBackgroundEnd,
  firstColor,
  secondColor,
  thirdColor,
  fourthColor,
  fifthColor,
  pointerColor,
  size = "80%",
  blendingValue = "hard-light",
  speed = "normal",
  children,
  className,
  interactive = false,
  containerClassName,
}: BackgroundGradientAnimationProps) {
  const paletteColors =
    palette === "theme" ? THEME_GRADIENT_ANIMATION_COLORS : DEFAULT_GRADIENT_ANIMATION_COLORS
  const filterID = `gradient-blur-${useId().replace(/:/gu, "")}`
  const interactiveRef = useRef<HTMLDivElement | null>(null)

  const [curX, setCurX] = useState(0)
  const [curY, setCurY] = useState(0)
  const [tgX, setTgX] = useState(0)
  const [tgY, setTgY] = useState(0)

  useEffect(() => {
    function move() {
      if (!interactiveRef.current) return
      setCurX((prev) => prev + (tgX - prev) / 20)
      setCurY((prev) => prev + (tgY - prev) / 20)
      interactiveRef.current.style.transform = `translate(${Math.round(curX)}px, ${Math.round(curY)}px)`
    }
    move()
  }, [tgX, tgY, curX, curY])

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (interactiveRef.current) {
      const rect = interactiveRef.current.getBoundingClientRect()
      setTgX(event.clientX - rect.left)
      setTgY(event.clientY - rect.top)
    }
  }

  const [isSafari, setIsSafari] = useState(false)
  useEffect(() => {
    setIsSafari(/^((?!chrome|android).)*safari/i.test(navigator.userAgent))
  }, [])

  const containerStyle: GradientAnimationStyle = {
    "--gradient-background-start": gradientBackgroundStart ?? paletteColors.gradientBackgroundStart,
    "--gradient-background-end": gradientBackgroundEnd ?? paletteColors.gradientBackgroundEnd,
    "--first-color": firstColor ?? paletteColors.firstColor,
    "--second-color": secondColor ?? paletteColors.secondColor,
    "--third-color": thirdColor ?? paletteColors.thirdColor,
    "--fourth-color": fourthColor ?? paletteColors.fourthColor,
    "--fifth-color": fifthColor ?? paletteColors.fifthColor,
    "--pointer-color": pointerColor ?? paletteColors.pointerColor,
    "--size": size,
    "--blending-value": blendingValue,
  }

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden bg-[linear-gradient(40deg,var(--gradient-background-start),var(--gradient-background-end))]",
        className,
        containerClassName,
      )}
      style={containerStyle}
    >
      <svg className="hidden">
        <defs>
          <filter id={filterID}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
      {children ? <div>{children}</div> : null}
      <div
        className={cn("gradients-container h-full w-full blur-lg", isSafari ? "blur-2xl" : null)}
        style={isSafari ? undefined : { filter: `url(#${filterID}) blur(40px)` }}
      >
        <div
          className={cn(
            "absolute [background:radial-gradient(circle_at_center,_var(--first-color)_0,_var(--first-color)_50%)_no-repeat]",
            "[mix-blend-mode:var(--blending-value)] w-[var(--size)] h-[var(--size)] top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)]",
            "[transform-origin:center_center]",
            "opacity-100",
          )}
          style={blobAnimation(0, speed)}
        />
        <div
          className={cn(
            "absolute [background:radial-gradient(circle_at_center,_color-mix(in_srgb,var(--second-color)_80%,transparent)_0,_transparent_50%)_no-repeat]",
            "[mix-blend-mode:var(--blending-value)] w-[var(--size)] h-[var(--size)] top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)]",
            "[transform-origin:calc(50%-400px)]",
            "opacity-100",
          )}
          style={blobAnimation(1, speed)}
        />
        <div
          className={cn(
            "absolute [background:radial-gradient(circle_at_center,_color-mix(in_srgb,var(--third-color)_80%,transparent)_0,_transparent_50%)_no-repeat]",
            "[mix-blend-mode:var(--blending-value)] w-[var(--size)] h-[var(--size)] top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)]",
            "[transform-origin:calc(50%+400px)]",
            "opacity-100",
          )}
          style={blobAnimation(2, speed)}
        />
        <div
          className={cn(
            "absolute [background:radial-gradient(circle_at_center,_color-mix(in_srgb,var(--fourth-color)_80%,transparent)_0,_transparent_50%)_no-repeat]",
            "[mix-blend-mode:var(--blending-value)] w-[var(--size)] h-[var(--size)] top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)]",
            "[transform-origin:calc(50%-200px)]",
            "opacity-70",
          )}
          style={blobAnimation(3, speed)}
        />
        <div
          className={cn(
            "absolute [background:radial-gradient(circle_at_center,_color-mix(in_srgb,var(--fifth-color)_80%,transparent)_0,_transparent_50%)_no-repeat]",
            "[mix-blend-mode:var(--blending-value)] w-[var(--size)] h-[var(--size)] top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)]",
            "[transform-origin:calc(50%-800px)_calc(50%+800px)]",
            "opacity-100",
          )}
          style={blobAnimation(4, speed)}
        />
        {interactive ? (
          <div
            ref={interactiveRef}
            onMouseMove={handleMouseMove}
            className={cn(
              "absolute [background:radial-gradient(circle_at_center,_color-mix(in_srgb,var(--pointer-color)_80%,transparent)_0,_transparent_50%)_no-repeat]",
              "[mix-blend-mode:var(--blending-value)] w-full h-full -top-1/2 -left-1/2",
              "opacity-70",
            )}
          />
        ) : null}
      </div>
    </div>
  )
}

export { BackgroundGradientAnimation }
export type { GradientAnimationPalette, GradientAnimationSpeed }
