import { motion, useReducedMotion } from "motion/react"
import { cn } from "@buddy/ui"
import { language } from "@/context/language"
import { Markdown } from "@/components/markdown/Markdown"
import { REVIEW_HINGE_TRANSITION } from "./flashcard-review-motion"
import { REVIEW_CARD_CHROME, REVIEW_CARD_RADIUS } from "./flashcard-review-surface"
import {
  isBasicFlashcardFields,
  isClozeFlashcardFields,
  parseClozeText,
} from "./flashcard-card-content"
import type { ReviewNote } from "./flashcard-review-session"
import type { ReactNode } from "react"

/**
 * The index card.
 *
 * A labelled eyebrow over a hairline rule, then left-aligned document type.
 * The answer face keeps the question above it as a caption, so the two faces
 * read as one document rather than as a thing and its replacement.
 */

// ─── Cloze ─────────────────────────────────────────────────────────────────

/** The blank a person could actually write on. Its width tracks the answer. */
function ClozeBlank(props: { answer: string }) {
  return (
    <span className="relative mx-0.5 inline-block border-b-2 border-border-strong-base align-baseline">
      <span className="invisible">{props.answer}</span>
    </span>
  )
}

function ClozeFilled(props: { answer: string }) {
  return (
    <span className="mx-0.5 inline-block border-b-2 border-border-interactive-base text-text-interactive-base">
      {props.answer}
    </span>
  )
}

/**
 * Cloze text renders as React nodes rather than through `Markdown`, because the
 * blank has to be a real element — a rule you can see the width of. Markdown
 * inside cloze text is therefore not formatted; basic cards keep full Markdown.
 *
 * Non-target clozes render plain: only this card's own ordinal is the question.
 */
export function ClozeText(props: { text: string; ordinal: number; revealed: boolean }) {
  const pieces: ReactNode[] = parseClozeText(props.text).map((segment, index) => {
    if (segment.kind === "text") return segment.text
    const key = `${segment.ordinal}-${index}`

    if (segment.ordinal !== props.ordinal) {
      return <span key={key}>{segment.answer}</span>
    } else if (props.revealed) {
      return <ClozeFilled key={key} answer={segment.answer} />
    }
    return <ClozeBlank key={key} answer={segment.answer} />
  })

  return <>{pieces}</>
}

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
          <p className="text-pretty text-[17px] leading-relaxed text-text-stronger">
            <ClozeText
              text={note.fields.text}
              ordinal={props.templateIdx + 1}
              revealed={props.revealed}
            />
          </p>
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
 */
export function ReviewCardHinge(props: {
  note: ReviewNote
  templateIdx: number
  revealed: boolean
}) {
  const reduceMotion = useReducedMotion()
  const face = cn("absolute inset-0 overflow-hidden", REVIEW_CARD_RADIUS, REVIEW_CARD_CHROME)

  if (reduceMotion) {
    return (
      <div className={face}>
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
      className={cn("absolute inset-0 text-left", REVIEW_CARD_RADIUS)}
      style={{ transformStyle: "preserve-3d" }}
      initial={false}
      animate={{ rotateY: props.revealed ? 180 : 0 }}
      transition={REVIEW_HINGE_TRANSITION}
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
