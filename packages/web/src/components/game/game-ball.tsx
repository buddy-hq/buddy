import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@buddy/ui"
import { motion } from "motion/react"
import { Gamepad2Icon } from "@/icons/app-icons"
import { useRef } from "react"
import { language } from "@/context/language"

const HIDE_DRAG_THRESHOLD_PX = 48
const HIDE_DRAG_MAX_PX = 80
const HIDE_DRAG_CLICK_GUARD_PX = 6

type GameBallProps = {
  onOpen: () => void
  onHide: () => void
  onSuggestLessOften: () => void
  onDisableSuggestions: () => void
  onOpenSettings: () => void
}

export function GameBall({
  onOpen,
  onHide,
  onSuggestLessOften,
  onDisableSuggestions,
  onOpenSettings,
}: GameBallProps) {
  const didDragRef = useRef(false)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.button
          type="button"
          initial={{ y: 20, opacity: 0, scale: 0.5 }}
          animate={{ y: -8, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.5 }}
          whileHover={{ y: -12, scale: 1.1, boxShadow: "0 0 20px var(--surface-interactive-base)" }}
          whileTap={{ scale: 0.9 }}
          whileDrag={{ scale: 0.95, cursor: "grabbing" }}
          drag="y"
          dragConstraints={{ top: 0, bottom: HIDE_DRAG_MAX_PX }}
          dragElastic={{ top: 0, bottom: 0.35 }}
          dragMomentum={false}
          dragSnapToOrigin
          onDragStart={() => {
            didDragRef.current = false
          }}
          onDrag={(_, info) => {
            if (info.offset.y > HIDE_DRAG_CLICK_GUARD_PX) {
              didDragRef.current = true
            }
          }}
          onDragEnd={(_, info) => {
            if (info.offset.y >= HIDE_DRAG_THRESHOLD_PX) {
              onHide()
            }
          }}
          onClick={() => {
            if (didDragRef.current) return
            onOpen()
          }}
          className="absolute right-6 top-0 -translate-y-full z-10 flex cursor-grab items-center justify-center size-10 rounded-full bg-surface-interactive-base text-text-on-interactive-base shadow-xl shadow-surface-interactive-base/20 ring-4 ring-background-base transition-shadow active:cursor-grabbing"
          title={language.t("game.ball.title")}
        >
          <Gamepad2Icon className="size-5" />
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute inset-0 rounded-full bg-white/20"
          />
        </motion.button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onHide}>{language.t("game.ball.hide")}</ContextMenuItem>
        <ContextMenuItem onSelect={onSuggestLessOften}>
          {language.t("game.ball.suggestLessOften")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={onDisableSuggestions}>
          {language.t("game.ball.disableSuggestions")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={onOpenSettings}>
          {language.t("game.ball.openSettings")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
