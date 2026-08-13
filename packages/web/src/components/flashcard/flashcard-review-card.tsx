import { motion, useReducedMotion } from "motion/react"
import { cn } from "@buddy/ui"
import { language } from "@/context/language"
import { Markdown } from "@/components/markdown/Markdown"
import { ClozeMarkdown } from "./flashcard-cloze-markdown"
import { REVIEW_HINGE_TRANSITION } from "./flashcard-review-motion"
import { REVIEW_CARD_CHROME, REVIEW_CARD_RADIUS } from "./flashcard-review-surface"
import { isBasicFlashcardFields, isClozeFlashcardFields } from "./flashcard-card-content"
import type { ReviewNote } from "./flashcard-review-session"
import type { KeyboardEvent } from "react"

/**
 * The index card.
 *
 * A labelled eyebrow over a hairline rule, then left-aligned document type.
 * The answer face keeps the question above it as a caption, so the two faces
 * read as one document rather than as a thing and its replacement.
 */

// ─── Card parts ────────────────────────────────────────────────────────────

/** The eyebrow + hairline that opens every face and every panel on the card. */
export function ReviewRuledHead(props: { label: string; critical?: boolean }) {
  return (
    <div className="shrink-0 px-8 pb-2 pt-5">
      <span
        className={cn(
          "text-[10px] font-medium uppercase tracking-[0.16em]",
          props.critical ? "text-text-critical-base" : "text-text-weaker",
        )}
      >
        {props.label}
      </span>
      <div
        className={cn(
          "mt-2 h-px w-full",
          props.critical ? "bg-border-critical-base" : "bg-border-base",
        )}
      />
    </div>
  )
}

function faceLabel(note: ReviewNote, templateIdx: number, revealed: boolean): string {
  if (revealed) return language.t("workspaceFlashcard.faceAnswer")
  if (isClozeFlashcardFields(note.fields)) {
    return language.t("workspaceFlashcard.clozeOrdinal", { index: templateIdx + 1 })
  }
  return language.t("workspaceFlashcard.faceQuestion")
}

export function ReviewCardFace(props: {
  note: ReviewNote
  templateIdx: number
  revealed: boolean
}) {
  const { note } = props

  return (
    <div className="flex h-full flex-col">
      <ReviewRuledHead label={faceLabel(note, props.templateIdx, props.revealed)} />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6">
        {isClozeFlashcardFields(note.fields) ? (
          <ClozeMarkdown
            text={note.fields.text}
            ordinal={props.templateIdx + 1}
            revealed={props.revealed}
            className="text-pretty text-[17px] leading-relaxed text-text-stronger"
          />
        ) : isBasicFlashcardFields(note.fields) ? (
          props.revealed ? (
            <>
              <Markdown
                text={note.fields.front}
                className="mb-3 line-clamp-2 text-[12px] leading-snug text-text-weaker"
              />
              <Markdown
                text={note.fields.back}
                className="text-pretty text-[17px] leading-relaxed text-text-interactive-base"
              />
            </>
          ) : (
            <Markdown
              text={note.fields.front}
              className="text-pretty text-[17px] leading-relaxed text-text-stronger"
            />
          )
        ) : null}
      </div>
    </div>
  )
}

/**
 * The reveal. Both faces are opaque and mounted at once; only `rotateY` moves,
 * so there is no cross-fade and no moment where both are readable.
 *
 * The card itself is the reveal affordance when `onToggle` is given. It stays a
 * `div` with `role="button"` rather than a real `<button>`: a face can carry
 * Markdown links, and those cannot live inside a button element.
 */
export function ReviewCardHinge(props: {
  note: ReviewNote
  templateIdx: number
  revealed: boolean
  onToggle?: () => void
}) {
  const reduceMotion = useReducedMotion()
  const face = cn("absolute inset-0 overflow-hidden", REVIEW_CARD_RADIUS, REVIEW_CARD_CHROME)
  const { onToggle } = props
  const toggle = onToggle
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": language.t("workspaceFlashcard.flipToReveal"),
        onClick: onToggle,
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          onToggle()
        },
      }
    : {}

  if (reduceMotion) {
    return (
      <div className={cn(face, onToggle && "cursor-pointer")} {...toggle}>
        <ReviewCardFace
          note={props.note}
          templateIdx={props.templateIdx}
          revealed={props.revealed}
        />
      </div>
    )
  }

  return (
    <motion.div
      className={cn("absolute inset-0 text-left", REVIEW_CARD_RADIUS, onToggle && "cursor-pointer")}
      style={{ transformStyle: "preserve-3d" }}
      initial={false}
      animate={{ rotateY: props.revealed ? 180 : 0 }}
      transition={REVIEW_HINGE_TRANSITION}
      {...toggle}
    >
      <div
        ref={(element) => {
          if (element) element.inert = props.revealed
        }}
        aria-hidden={props.revealed}
        className={face}
        style={{ backfaceVisibility: "hidden" }}
      >
        <ReviewCardFace note={props.note} templateIdx={props.templateIdx} revealed={false} />
      </div>
      <div
        ref={(element) => {
          if (element) element.inert = !props.revealed
        }}
        aria-hidden={!props.revealed}
        className={face}
        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
      >
        <ReviewCardFace note={props.note} templateIdx={props.templateIdx} revealed />
      </div>
    </motion.div>
  )
}
