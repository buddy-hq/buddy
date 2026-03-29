import { language } from "@/context/language"

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
  auto: language.t("prompt.placeholder.intents.auto"),
  learn: language.t("prompt.placeholder.intents.learn"),
  practice: language.t("prompt.placeholder.intents.practice"),
  assess: language.t("prompt.placeholder.intents.assess"),
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
