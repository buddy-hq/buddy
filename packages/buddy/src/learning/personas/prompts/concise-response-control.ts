import type { Persona } from "../../shared/teaching-vocabulary"
import STUDENT_CONCISE_RESPONSES from "./sections/product/concise-responses/student.p.md"
import TEACHER_CONCISE_RESPONSES from "./sections/product/concise-responses/teacher.p.md"

const TEACH_THROUGH_CONVERSATION_HEADING = "## Teach through conversation; don't lecture."
const KEEP_ANSWERS_CONCISE = "- Keep answers concise unless you're asked for depth."
const SIMPLE_ANSWER_ONE_LINER =
  "- The complexity of the answer should match the question. If the question is simple, your answer should be a one-liner."
const COMPLEXITY_AND_ONE_LINER = `${SIMPLE_ANSWER_ONE_LINER} Order sections from general to specific to supporting.`
const FLEXIBLE_COMPLEXITY = "- Order sections from general to specific to supporting."

function responseStyleBody(source: string): string {
  return source.trim().replace(`${TEACH_THROUGH_CONVERSATION_HEADING}\n\n`, "")
}

export function renderConciseResponseInstructions(persona: Persona): string {
  if (persona === "code") return ""
  const personaInstructions =
    persona === "buddy" ? STUDENT_CONCISE_RESPONSES : TEACHER_CONCISE_RESPONSES
  return [personaInstructions.trim(), KEEP_ANSWERS_CONCISE, SIMPLE_ANSWER_ONE_LINER].join("\n")
}

export function stripConciseResponseInstructions(input: {
  persona: Persona
  systemPrompt: string
}): string {
  if (input.persona === "code") return input.systemPrompt

  const personaInstructions = responseStyleBody(
    input.persona === "buddy" ? STUDENT_CONCISE_RESPONSES : TEACHER_CONCISE_RESPONSES,
  )

  return input.systemPrompt
    .replace(`\n\n${personaInstructions}\n\n`, "\n\n")
    .replace(`\n${KEEP_ANSWERS_CONCISE}`, "")
    .replace(COMPLEXITY_AND_ONE_LINER, FLEXIBLE_COMPLEXITY)
}
