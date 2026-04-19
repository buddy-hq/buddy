import { motion } from "motion/react"
import { language } from "@/context/language"

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

type FlashcardCardDisplayProps = {
  note: FlashcardNote
  templateIdx: number
  revealed: boolean
  onReveal: () => void
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
  onReveal,
}: FlashcardCardDisplayProps) {
  if (isBasicFields(note.fields)) {
    return (
      <BasicCardDisplay
        front={note.fields.front}
        back={note.fields.back}
        revealed={revealed}
        onReveal={onReveal}
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
        onReveal={onReveal}
      />
    )
  }

  return null
}

function BasicCardDisplay(props: {
  front: string
  back: string
  revealed: boolean
  onReveal: () => void
}) {
  return (
    <div className="flex min-h-[12rem] flex-col">
      {/* Front side — question / prompt */}
      <div className="flex flex-1 items-center justify-center px-5 py-8">
        <p className="max-w-prose text-center text-[15px] leading-[1.7] text-text-base whitespace-pre-wrap">
          {props.front}
        </p>
      </div>

      {/* Back side — answer (animated reveal) */}
      {props.revealed ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className="border-t border-border-base/30 bg-surface-weak/30 px-5 py-6"
        >
          <p className="max-w-prose text-center text-[15px] leading-[1.7] text-text-base whitespace-pre-wrap">
            {props.back}
          </p>
        </motion.div>
      ) : (
        <RevealButton onReveal={props.onReveal} />
      )}
    </div>
  )
}

function ClozeCardDisplay(props: {
  text: string
  ordinal: number
  revealed: boolean
  onReveal: () => void
}) {
  const displayText = renderClozeText(props.text, props.ordinal, props.revealed)

  return (
    <div className="flex min-h-[12rem] flex-col">
      <div className="flex flex-1 items-center justify-center px-5 py-8">
        <p className="max-w-prose text-center text-[15px] leading-[1.7] text-text-base whitespace-pre-wrap">
          {displayText}
        </p>
      </div>

      {!props.revealed ? <RevealButton onReveal={props.onReveal} /> : null}
    </div>
  )
}

function RevealButton(props: { onReveal: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onReveal}
      className="cursor-pointer border-t border-border-base/30 px-5 py-3.5 text-center text-xs font-medium text-text-weak transition-all duration-150 ease-out hover:bg-surface-weak/40 hover:text-text-base active:scale-[0.98]"
    >
      {language.t("workspaceFlashcard.flipToReveal")}
    </button>
  )
}
