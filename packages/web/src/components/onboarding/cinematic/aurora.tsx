import { AnimatePresence, motion } from "motion/react"
import { useEffect } from "react"
import { EASE_OUT, FONT_HREF, FONT_LINK_ID, getBgFilter, type MoodColors } from "./constants"

export function useFont() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return
    const link = document.createElement("link")
    link.id = FONT_LINK_ID
    link.rel = "stylesheet"
    link.href = FONT_HREF
    document.head.appendChild(link)
  }, [])
}

function NebulaOrionBackground({ mood }: { mood: MoodColors }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#010102]">
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="orion-nebula-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.007" numOctaves="4" result="noise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="110"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div
        className="ob-drift absolute inset-0 opacity-[0.55]"
        style={{
          filter: "url(#orion-nebula-filter)",
          backgroundImage: [
            `radial-gradient(55% 55% at 15% 15%, ${mood.a}, transparent 70%)`,
            `radial-gradient(65% 65% at 85% 85%, ${mood.b}, transparent 70%)`,
            `radial-gradient(45% 45% at 80% 15%, ${mood.c}, transparent 65%)`,
          ].join(", "),
        }}
      />
    </div>
  )
}

export function Aurora({
  mood,
  bloom,
  expanding,
}: {
  mood: MoodColors
  bloom: boolean
  expanding: boolean
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ filter: getBgFilter() }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, scale: expanding ? 2.5 : 1 }}
        transition={{
          scale: { duration: 2.8, ease: [0.16, 1, 0.3, 1] },
          default: { duration: 0.8, ease: EASE_OUT },
        }}
        className="absolute inset-0 origin-center"
      >
        <NebulaOrionBackground mood={mood} />
      </motion.div>

      <div className="absolute inset-0 bg-[radial-gradient(130%_120%_at_50%_-10%,transparent_44%,rgba(0,0,0,0.66)_100%)]" />
      <div className="ob-grain absolute inset-0 mix-blend-soft-light opacity-[0.05]" />
      <AnimatePresence>
        {bloom ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.95, 0], scale: 1.7 }}
            transition={{ duration: 1.5, ease: EASE_OUT }}
            className="absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: "radial-gradient(closest-side, var(--brand-bloom), transparent 70%)",
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function Sweep({ stepKey }: { stepKey: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
      style={{ filter: getBgFilter() }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={stepKey}
          initial="initial"
          animate="animate"
          exit="exit"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <motion.div
            variants={{
              initial: { opacity: 0 },
              animate: { opacity: [0, 0.65, 0] },
            }}
            transition={{ duration: 1.4, ease: "easeInOut" }}
            className="absolute inset-0 flex items-center justify-center bg-[#090a0f]/40 backdrop-blur-[12px]"
          >
            <div
              className="absolute size-[400px] rounded-full opacity-40 blur-[80px]"
              style={{ background: "var(--brand-soft)" }}
            />
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
