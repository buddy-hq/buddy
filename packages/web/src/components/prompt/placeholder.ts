type TeachingIntent = "auto" | "learn" | "practice" | "assess"

type PromptPlaceholderInput = {
  mode: "normal" | "shell"
  commentCount: number
  example: string
  suggest: boolean
  intent: TeachingIntent
  t: (key: string, params?: Record<string, string>) => string
}

const INTENT_PLACEHOLDERS: Record<TeachingIntent, string> = {
  auto: "Ask Buddy...",
  learn: "Teach me about...",
  practice: "Help me practice...",
  assess: "Quiz me on...",
}

export function promptPlaceholder(input: PromptPlaceholderInput): string {
  if (input.mode === "shell") return input.t("prompt.placeholder.shell")
  if (input.commentCount > 1) return input.t("prompt.placeholder.summarizeComments")
  if (input.commentCount === 1) return input.t("prompt.placeholder.summarizeComment")
  if (!input.suggest) return INTENT_PLACEHOLDERS[input.intent]
  return input.t("prompt.placeholder.normal", { example: input.example })
}

export function getIntentPlaceholder(intent: TeachingIntent): string {
  return INTENT_PLACEHOLDERS[intent]
}
