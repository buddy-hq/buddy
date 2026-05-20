import {
  ensureSkillServicePatched as ensureOpenCodeSkillServicePatched,
  setSkillVisibilityFilter,
} from "@buddy/opencode-adapter/skill-live"
import { isSuppressedOpenCodeSkill } from "./hidden-opencode-skills"

export async function ensureSkillServicePatched() {
  setSkillVisibilityFilter((skill) => !isSuppressedOpenCodeSkill(skill))
  await ensureOpenCodeSkillServicePatched()
}
