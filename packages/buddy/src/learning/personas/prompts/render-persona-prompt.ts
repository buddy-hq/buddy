import { definePromptTemplate } from "../../prompt/template/engine"
import LEARNING_COMPANION_DOCUMENT from "./learning-companion.p.md"
import GUIDANCE_IS_NOT_LAW from "./sections/constitution/guidance-is-not-law.p.md"
import RESPECT from "./sections/constitution/respect.p.md"
import SHARE_IDEAS_NOT_MECHANICS from "./sections/constitution/share-ideas-not-mechanics.p.md"
import STUDENT_SHOW_DONT_TELL from "./sections/constitution/student/show-dont-tell.p.md"
import STUDENT_TEACH_THROUGH_CONVERSATION from "./sections/constitution/student/teach-through-conversation.p.md"
import TEACHER_SHOW_DONT_TELL from "./sections/constitution/teacher/show-dont-tell.p.md"
import TEACHER_TEACH_THROUGH_CONVERSATION from "./sections/constitution/teacher/teach-through-conversation.p.md"
import ABOUT_BUDDY from "./sections/product/about-buddy.p.md"
import STUDENT_CONCISE_RESPONSES from "./sections/product/concise-responses/student.p.md"
import TEACHER_CONCISE_RESPONSES from "./sections/product/concise-responses/teacher.p.md"
import FORMATTING from "./sections/product/formatting.p.md"
import SKILLS from "./sections/product/skills.p.md"
import VOCABULARY from "./sections/product/vocabulary.p.md"
import TEACHING_PRINCIPLES from "./sections/teaching/principles.p.md"
import TEACHING_RESOURCES from "./sections/teaching/resources.p.md"
import PICK_A_TEACHING_MODEL from "./sections/teaching/student/pick-a-teaching-model.p.md"
import TEACHING_ASSISTANT_DOCUMENT from "./teaching-assistant.p.md"

/**
 * Every section a persona document can pull in, keyed by its path under
 * `sections/`: `{{product/vocabulary}}` is `sections/product/vocabulary.p.md`.
 * Folders group sections by what they are about, not by who reads them.
 *
 * A section that reads the same for everyone sits at the root of its intent
 * folder. One whose meaning changes with who Buddy is talking to lives under
 * `student/` or `teacher/` — the whiteboard is shared with the learner in one
 * and with the educator in the other, so that text cannot be neutral. Wording
 * that merely mentions a learner is not a reason to split; write it neutrally
 * and keep one copy at the root.
 *
 * A section may also exist for one persona alone.
 * `teaching/student/pick-a-teaching-model` has no teacher counterpart because
 * choosing a teaching model is the educator's call, not Buddy's — the teaching
 * assistant simply omits it. Documents are not required to mirror each other.
 */
const PERSONA_PROMPT_SECTIONS = new Map([
  ["constitution/guidance-is-not-law", GUIDANCE_IS_NOT_LAW],
  ["constitution/respect", RESPECT],
  ["constitution/share-ideas-not-mechanics", SHARE_IDEAS_NOT_MECHANICS],
  ["constitution/student/show-dont-tell", STUDENT_SHOW_DONT_TELL],
  ["constitution/student/teach-through-conversation", STUDENT_TEACH_THROUGH_CONVERSATION],
  ["constitution/teacher/show-dont-tell", TEACHER_SHOW_DONT_TELL],
  ["constitution/teacher/teach-through-conversation", TEACHER_TEACH_THROUGH_CONVERSATION],
  ["product/about-buddy", ABOUT_BUDDY],
  ["product/concise-responses/student", STUDENT_CONCISE_RESPONSES],
  ["product/concise-responses/teacher", TEACHER_CONCISE_RESPONSES],
  ["product/formatting", FORMATTING],
  ["product/skills", SKILLS],
  ["product/vocabulary", VOCABULARY],
  ["teaching/principles", TEACHING_PRINCIPLES],
  ["teaching/resources", TEACHING_RESOURCES],
  ["teaching/student/pick-a-teaching-model", PICK_A_TEACHING_MODEL],
])

/**
 * One document per persona, at the top level of `prompts/`. Which sections it
 * includes, in what order, and what prose sits between them is owned by the
 * document, not by this file.
 */
const PERSONA_PROMPT_DOCUMENTS = {
  "learning-companion": definePromptTemplate({
    source: LEARNING_COMPANION_DOCUMENT,
    debugName: "learning-companion-persona-prompt",
  }),
  "teaching-assistant": definePromptTemplate({
    source: TEACHING_ASSISTANT_DOCUMENT,
    debugName: "teaching-assistant-persona-prompt",
  }),
} as const

type PersonaPromptID = keyof typeof PERSONA_PROMPT_DOCUMENTS

const PERSONA_PROMPT_ID = {
  learningCompanion: "learning-companion",
  teachingAssistant: "teaching-assistant",
} as const satisfies Readonly<Record<string, PersonaPromptID>>

function resolveSection(name: string, personaPromptID: PersonaPromptID): string {
  const section = PERSONA_PROMPT_SECTIONS.get(name)
  if (section === undefined) {
    throw new Error(`persona document "${personaPromptID}" references unknown section "${name}"`)
  }
  return section.trim()
}

export function renderBuddyPersonaPrompt(personaPromptID: PersonaPromptID): string {
  const document = PERSONA_PROMPT_DOCUMENTS[personaPromptID]

  return document.render(
    document
      .placeholderNames()
      .map((name) => [name, resolveSection(name, personaPromptID)] as const),
  )
}

export { PERSONA_PROMPT_ID }
export type { PersonaPromptID }
