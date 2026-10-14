import type { SkillEditor } from "@buddy/opencode-adapter/plugin"

const HIDDEN_OPENCODE_SKILLS = [
  {
    id: "opencode",
    path: "/builtin/opencode.md",
  },
  {
    id: "report",
    path: "/builtin/report.md",
  },
] as const

type OpenCodeSkillIdentity = {
  id: string
  path: string
}

export function isSuppressedOpenCodeSkill(skill: OpenCodeSkillIdentity): boolean {
  return HIDDEN_OPENCODE_SKILLS.some((hiddenSkill) => {
    return hiddenSkill.id === skill.id && hiddenSkill.path === skill.path
  })
}

export function removeSuppressedOpenCodeSkills(editor: SkillEditor) {
  for (const skill of editor.list()) {
    if (isSuppressedOpenCodeSkill({ id: String(skill.id), path: String(skill.path) })) {
      editor.remove(String(skill.id))
    }
  }
}
