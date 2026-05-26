import { motion } from "motion/react"
import { Gamepad2Icon } from "lucide-react"

type GameBallProps = {
  onClick: () => void
}

export function GameBall({ onClick }: GameBallProps) {
  return (
    <motion.button
      initial={{ y: 20, opacity: 0, scale: 0.5 }}
      animate={{ y: -8, opacity: 1, scale: 1 }}
      exit={{ y: 20, opacity: 0, scale: 0.5 }}
      whileHover={{ y: -12, scale: 1.1, boxShadow: "0 0 20px var(--surface-interactive-base)" }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="absolute right-6 top-0 -translate-y-full z-10 flex items-center justify-center size-10 rounded-full bg-surface-interactive-base text-text-on-interactive-base shadow-xl shadow-surface-interactive-base/20 ring-4 ring-background-base transition-shadow"
      title="Take a break?"
    >
      <Gamepad2Icon className="size-5" />
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute inset-0 rounded-full bg-white/20"
      />
    </motion.button>
  )
}
