import { motion, AnimatePresence } from "motion/react"
import { language } from "@/context/language"
import { cn } from "@buddy/ui"
import { Markdown } from "@/components/markdown/Markdown"

type BasicFields = {
  front: string
  back: string
}

type ClozeFields = {
  text: string
}

type FlashcardNote = {
  noteID: string
  type: "basic" | "cloze"
  fields: BasicFields | ClozeFields
}

type CardRating = "again" | "hard" | "good" | "easy"

type FlashcardCardDisplayProps = {
  note: FlashcardNote
  templateIdx: number
  revealed: boolean
  onToggleReveal: () => void
  swipeRating?: CardRating | null
}

function isBasicFields(fields: BasicFields | ClozeFields): fields is BasicFields {
  return "front" in fields && "back" in fields
}

function isClozeFields(fields: BasicFields | ClozeFields): fields is ClozeFields {
  return "text" in fields && !("front" in fields)
}

/** Replace the nth cloze `{{cN::answer}}` with a blank or reveal. */
function renderClozeText(text: string, ordinal: number, revealed: boolean): string {
  return text.replace(/\{\{c(\d+)::([^}]+)\}\}/gu, (_match, indexStr: string, answer: string) => {
    const clozeOrdinal = Number.parseInt(indexStr, 10)
    if (clozeOrdinal === ordinal) {
      return revealed ? answer : "[...]"
    }
    // Other cloze deletions are always shown
    return answer
  })
}

export function FlashcardCardDisplay({
  note,
  templateIdx,
  revealed,
  onToggleReveal,
  swipeRating,
}: FlashcardCardDisplayProps) {
  if (isBasicFields(note.fields)) {
    return (
      <BasicCardDisplay
        front={note.fields.front}
        back={note.fields.back}
        revealed={revealed}
        onToggleReveal={onToggleReveal}
        swipeRating={swipeRating}
      />
    )
  }

  if (isClozeFields(note.fields)) {
    // templateIdx is 0-based, cloze ordinals in text are 1-based
    const ordinal = templateIdx + 1
    return (
      <ClozeCardDisplay
        text={note.fields.text}
        ordinal={ordinal}
        revealed={revealed}
        onToggleReveal={onToggleReveal}
        swipeRating={swipeRating}
      />
    )
  }

  return null
}

function getSwipeOverlayClass(rating?: CardRating | null) {
  switch (rating) {
    case "again":
      return "bg-surface-critical-base/40"
    case "hard":
      return "bg-surface-warning-base/40"
    case "good":
      return "bg-surface-success-base/40"
    case "easy":
      return "bg-surface-interactive-base/40"
    default:
      return ""
  }
}

function BasicCardDisplay(props: {
  front: string
  back: string
  revealed: boolean
  onToggleReveal: () => void
  swipeRating?: CardRating | null
}) {
  return (
    <div className="relative h-full w-full bg-transparent" style={{ perspective: 1200 }}>
      <motion.div
        className="absolute inset-0 h-full w-full cursor-pointer"
        style={{ transformStyle: "preserve-3d" }}
        initial={false}
        onClick={props.onToggleReveal}
        animate={{ rotateY: props.revealed ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 100, damping: 15 }}
      >
        {/* Front Face */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-border-base bg-surface-base shadow-md hover:shadow-lg transition-shadow"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <div className="absolute left-0 right-0 top-8 h-px bg-brand-base/20" />

          <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 pb-6 pt-12">
            <Markdown
              text={props.front}
              className="max-w-prose text-center text-xl font-medium leading-relaxed text-text-stronger"
            />
          </div>
          {!props.revealed && (
            <div className="shrink-0 bg-surface-base py-4 text-center text-xs font-medium text-text-weaker">
              {language.t("workspaceFlashcard.flipToReveal")}
            </div>
          )}
        </div>

        {/* Back Face */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-border-base bg-surface-base shadow-md hover:shadow-lg transition-shadow"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="absolute left-0 right-0 top-8 h-px bg-brand-base/20" />

          <div className="flex w-full shrink-0 items-center justify-center px-6 pt-12">
            <p className="max-w-prose truncate text-center text-[13px] font-medium text-text-weaker">
              Q: {props.front}
            </p>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 pb-10 pt-4">
            <Markdown
              text={props.back}
              className="max-w-prose text-center text-xl font-medium leading-relaxed text-brand-base"
            />
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {props.swipeRating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "pointer-events-none absolute inset-0 z-50 rounded-2xl mix-blend-multiply",
              getSwipeOverlayClass(props.swipeRating),
            )}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ClozeCardDisplay(props: {
  text: string
  ordinal: number
  revealed: boolean
  onToggleReveal: () => void
  swipeRating?: CardRating | null
}) {
  const frontText = renderClozeText(props.text, props.ordinal, false)
  const backText = renderClozeText(props.text, props.ordinal, true)

  return (
    <div className="relative h-full w-full bg-transparent" style={{ perspective: 1200 }}>
      <motion.div
        className="absolute inset-0 h-full w-full cursor-pointer"
        style={{ transformStyle: "preserve-3d" }}
        initial={false}
        onClick={props.onToggleReveal}
        animate={{ rotateY: props.revealed ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 100, damping: 15 }}
      >
        {/* Front Face */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-border-base bg-surface-base shadow-md hover:shadow-lg transition-shadow"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <div className="absolute left-0 right-0 top-8 h-px bg-brand-base/20" />

          <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 pb-6 pt-12">
            <Markdown
              text={frontText}
              className="max-w-prose text-center text-xl font-medium leading-relaxed text-text-stronger"
            />
          </div>

          {!props.revealed && (
            <div className="shrink-0 bg-surface-base py-4 text-center text-xs font-medium text-text-weaker">
              {language.t("workspaceFlashcard.flipToReveal")}
            </div>
          )}
        </div>

        {/* Back Face */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-border-base bg-surface-base shadow-md hover:shadow-lg transition-shadow"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="absolute left-0 right-0 top-8 h-px bg-brand-base/20" />

          <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 pb-6 pt-12">
            <Markdown
              text={backText}
              className="max-w-prose text-center text-xl font-medium leading-relaxed text-brand-base"
            />
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {props.swipeRating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "pointer-events-none absolute inset-0 z-50 rounded-2xl mix-blend-multiply",
              getSwipeOverlayClass(props.swipeRating),
            )}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
