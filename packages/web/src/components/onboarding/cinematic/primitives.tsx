import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { motion, useInView } from "motion/react"
import { cn } from "@buddy/ui"
import { ArrowUpRightIcon } from "lucide-react"
import { EASE_OUT, SERIF, rise, lineMask, lineInner } from "./constants"

// ── Big masked-line serif heading (choreographed) ──
export function Heading({
  lines,
  emphasizeLast,
  className,
}: {
  lines: readonly ReactNode[]
  emphasizeLast?: boolean
  className?: string
}) {
  return (
    <motion.h2
      variants={lineMask}
      className={className ?? "text-[clamp(30px,4.4vw,46px)] leading-[1.04] tracking-[-0.01em]"}
      style={{ fontFamily: SERIF, fontWeight: 500, color: "#faf6f0" }}
    >
      {lines.map((line, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <motion.span
            variants={lineInner}
            className="block"
            style={
              emphasizeLast && i === lines.length - 1 ? { color: "var(--brand-word)" } : undefined
            }
          >
            {line}
          </motion.span>
        </span>
      ))}
    </motion.h2>
  )
}

// ── Eyebrow label ──
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <motion.p
      variants={rise}
      className="mb-5 flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.28em] text-white/45"
    >
      <span className="inline-block h-px w-6" style={{ background: "var(--brand-ring)" }} />
      {children}
    </motion.p>
  )
}

// ── Editorial "menu" choice ──
export type MenuChoiceProps = {
  title: string
  description: string
  selected?: boolean
  busy?: boolean
  trailing?: ReactNode
  onHover?: (hovering: boolean) => void
  onClick: () => void
}

export function MenuChoice(props: MenuChoiceProps) {
  return (
    <motion.button
      type="button"
      variants={rise}
      onClick={props.onClick}
      onPointerEnter={() => props.onHover?.(true)}
      onPointerLeave={() => props.onHover?.(false)}
      onFocus={() => props.onHover?.(true)}
      onBlur={() => props.onHover?.(false)}
      disabled={props.busy}
      aria-pressed={props.selected}
      className="group relative flex w-full items-center gap-5 border-t border-white/10 py-5 pl-6 text-left outline-none transition-opacity last:border-b disabled:cursor-default"
      style={{ opacity: props.busy && !props.selected ? 0.4 : 1 }}
    >
      <motion.span
        aria-hidden
        className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-full"
        initial={false}
        animate={{ scaleY: props.selected ? 1 : 0, opacity: props.selected ? 1 : 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        style={{ background: "var(--brand-ring)", boxShadow: "0 0 16px var(--brand-ring)" }}
      />
      <span className="min-w-0 flex-1">
        <span
          className="block text-[22px] leading-tight tracking-[-0.01em] transition-colors duration-200"
          style={{
            fontFamily: SERIF,
            fontWeight: 500,
            color: props.selected ? "var(--brand-word)" : "#f3ede4",
          }}
        >
          {props.title}
        </span>
        <span className="mt-1 block text-[13.5px] leading-snug text-white/45">
          {props.description}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        {props.trailing ?? (
          <ArrowUpRightIcon className="size-5 -translate-x-1 text-white/25 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-hover:text-white/70" />
        )}
      </span>
    </motion.button>
  )
}

// ── Pill CTA button ──
export function Pill({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <motion.button
      type="button"
      variants={rise}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
      className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-[14px] font-medium disabled:opacity-50"
      style={{
        background: "var(--brand-ring)",
        color: "var(--brand-ink)",
        boxShadow: "0 14px 44px var(--brand-soft)",
      }}
    >
      {children}
    </motion.button>
  )
}

// ── EncryptedText reveal ──
const DEFAULT_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[];:,.<>/?"

function generateRandomCharacter(charset: string): string {
  return charset.charAt(Math.floor(Math.random() * charset.length))
}

function generateGibberishPreservingSpaces(original: string, charset: string): string {
  if (!original) return ""
  let result = ""
  for (let i = 0; i < original.length; i += 1) {
    result += original[i] === " " ? " " : generateRandomCharacter(charset)
  }
  return result
}

export function EncryptedText({
  text,
  className,
  revealDelayMs = 50,
  charset = DEFAULT_CHARSET,
  flipDelayMs = 50,
  encryptedClassName,
  revealedClassName,
}: {
  text: string
  className?: string
  revealDelayMs?: number
  charset?: string
  flipDelayMs?: number
  encryptedClassName?: string
  revealedClassName?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })

  const [revealCount, setRevealCount] = useState<number>(0)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const lastFlipTimeRef = useRef<number>(0)
  const scrambleCharsRef = useRef<string[]>(
    text ? generateGibberishPreservingSpaces(text, charset).split("") : [],
  )

  useEffect(() => {
    if (!isInView) return

    const initial = text ? generateGibberishPreservingSpaces(text, charset) : ""
    scrambleCharsRef.current = initial.split("")
    startTimeRef.current = performance.now()
    lastFlipTimeRef.current = startTimeRef.current
    setRevealCount(0)

    let isCancelled = false

    const update = (now: number) => {
      if (isCancelled) return

      const elapsedMs = now - startTimeRef.current
      const totalLength = text.length
      const currentRevealCount = Math.min(
        totalLength,
        Math.floor(elapsedMs / Math.max(1, revealDelayMs)),
      )

      setRevealCount(currentRevealCount)

      if (currentRevealCount >= totalLength) {
        return
      }

      const timeSinceLastFlip = now - lastFlipTimeRef.current
      if (timeSinceLastFlip >= Math.max(0, flipDelayMs)) {
        for (let index = 0; index < totalLength; index += 1) {
          if (index >= currentRevealCount) {
            scrambleCharsRef.current[index] =
              text[index] === " " ? " " : generateRandomCharacter(charset)
          }
        }
        lastFlipTimeRef.current = now
      }

      animationFrameRef.current = requestAnimationFrame(update)
    }

    animationFrameRef.current = requestAnimationFrame(update)

    return () => {
      isCancelled = true
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isInView, text, revealDelayMs, charset, flipDelayMs])

  if (!text) return null

  return (
    <motion.span ref={ref} className={cn(className)} aria-label={text} role="text">
      {text.split("").map((char, index) => {
        const isRevealed = index < revealCount
        const displayChar = isRevealed
          ? char
          : char === " "
            ? " "
            : (scrambleCharsRef.current[index] ?? generateRandomCharacter(charset))

        return (
          // eslint-disable-next-line react/no-array-index-key
          <span key={index} className={cn(isRevealed ? revealedClassName : encryptedClassName)}>
            {displayChar}
          </span>
        )
      })}
    </motion.span>
  )
}

// ── ChatGPT glyph SVG ──
export const chatgptGlyph = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-full">
    <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .75 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5zM3.6 18.3a4.47 4.47 0 0 1-.53-3.01l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95A4.5 4.5 0 0 1 3.6 18.3zM2.34 7.9a4.49 4.49 0 0 1 2.37-1.98v5.68a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0L3.99 14a4.5 4.5 0 0 1-1.65-6.1zm16.6 3.86L13.1 8.36l2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.79.79 0 0 0-.4-.67zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.7 5.46a.79.79 0 0 0-.39.68zm1.1-2.37 2.6-1.5 2.61 1.5v3l-2.6 1.5-2.61-1.5z" />
  </svg>
)

// ── StyleTag: grain and animation CSS ──
export function StyleTag() {
  return (
    <style>{`
      .ob-star {
        position: absolute;
        border-radius: 9999px;
        background: #fff;
        opacity: var(--o, 0.5);
        animation: ob-twinkle var(--d, 4s) ease-in-out infinite;
        will-change: opacity, transform;
      }
      @keyframes ob-twinkle {
        0%, 100% { opacity: var(--o, 0.5); transform: scale(1); }
        50% { opacity: 0.12; transform: scale(0.6); }
      }
      .ob-drift-slow { animation: ob-drift-slow 38s ease-in-out infinite; }
      .ob-drift { animation: ob-drift 24s ease-in-out infinite; }
      @keyframes ob-drift-slow {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
        50% { transform: translate3d(2%, 3%, 0) scale(1.05); }
      }
      @keyframes ob-drift {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
        50% { transform: translate3d(-3%, -2%, 0) rotate(5deg); }
      }
      .ob-orbit { animation: ob-spin 1.05s linear infinite; }
      @keyframes ob-spin { to { transform: rotate(360deg); } }
      .ob-float { animation: ob-float 4.5s ease-in-out infinite; }
      @keyframes ob-float {
        0%,100% { transform: translateY(0); }
        50% { transform: translateY(-7px); }
      }
      .ob-grain {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
      }
      @media (prefers-reduced-motion: reduce) {
        .ob-star, .ob-orbit, .ob-float { animation: none; }
      }
    `}</style>
  )
}
