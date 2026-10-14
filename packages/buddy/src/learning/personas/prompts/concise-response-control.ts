import type { Persona } from "../../shared/teaching-vocabulary"
import CONCISE_RESPONSES from "./concise-response-preference.p.md"

/** Render the shared preference for a turn reminder without changing the base prompt. */
export function renderConciseResponseInstructions(persona: Persona): string {
  if (persona === "code") return ""
  return CONCISE_RESPONSES.trim()
}

/** Omit only the preference when the chat's fixed base configuration has concision off. */
export function stripConciseResponseInstructions(input: {
  persona: Persona
  systemPrompt: string
}): string {
  if (input.persona === "code") return input.systemPrompt

  return input.systemPrompt.replace(`\n\n${CONCISE_RESPONSES.trim()}\n\n`, "\n\n")
}
