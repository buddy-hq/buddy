const HIDDEN_OPENCODE_SKILLS = [
  {
    name: "customize-opencode",
    location: "<built-in>",
  },
] as const

type OpenCodeSkillIdentity = {
  name: string
  location: string
}

export function hiddenOpenCodeSkillNames(): readonly string[] {
  return Array.from(new Set(HIDDEN_OPENCODE_SKILLS.map((skill) => skill.name)))
}

export function isSuppressedOpenCodeSkill(skill: OpenCodeSkillIdentity): boolean {
  return HIDDEN_OPENCODE_SKILLS.some((hiddenSkill) => {
    return hiddenSkill.name === skill.name && hiddenSkill.location === skill.location
  })
}
