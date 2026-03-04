import LEGACY_CODE_TEACHER_PROMPT from "../../../teaching/teacher/coding/prompt.md"
import { splitRequired } from "../utils.js"

const [codingTeacherIntro, codingTeacherRules] = splitRequired(LEGACY_CODE_TEACHER_PROMPT.trim(), "\n\nRules:\n")

export const legacyCodingTeacherPromptParts = {
  intro: codingTeacherIntro,
  rules: `Rules:\n${codingTeacherRules}`,
}
