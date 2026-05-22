const FLASHCARD_COMMAND_NAME = "flashcard" as const

type BuddyCommandTemplate = {
  description: string
  expand: (argumentsText: string) => string
}

const FLASHCARD_COMMAND_TEMPLATE = [
  "Create flashcards about $ARGUMENTS",
  "",
  "Use the flashcard-author subagent if it is available. If no arguments are provided, create flashcards based on the current conversation and context.",
  "",
  "Before delegating to the flashcard-author subagent, use the task prompt to pass along the learner's requested scope and any relevant conversation context. Keep the short task description concise, but make the delegated prompt itself specific.",
  "",
  "If the task is grounded in one or more resources, do not replace those resources with your own summary. Instead, enumerate each relevant resource in the delegation prompt with its title, alias or resource key when known, and the prepared full-text path when available. State the exact scope to read from each resource, and explicitly tell the flashcard-author subagent to call `ingest_full_text` for the named resources before authoring cards unless the full text is already present in the delegated context.",
  "",
  "After delegation, do not add separate rendering instructions. Decks saved by flashcard-author are surfaced automatically from persisted state.",
].join("\n")

const BUDDY_COMMANDS: Record<string, BuddyCommandTemplate> = {
  [FLASHCARD_COMMAND_NAME]: {
    description: "Generate flashcards from context in learn mode",
    expand(argumentsText) {
      const trimmed = argumentsText.trim()
      const replacement = trimmed.length > 0 ? trimmed : "the current conversation and context"
      return FLASHCARD_COMMAND_TEMPLATE.replace("$ARGUMENTS", replacement)
    },
  },
}

export type { BuddyCommandTemplate }
export { BUDDY_COMMANDS }
