const DISABLED_BUNDLED_SKILL_NAMES = [
  "learn",
  "practice",
  "assess",
  "explain",
  "worked-example",
  "compare-concepts",
] as const

const DISABLED_BUNDLED_SKILL_NAME_SET: ReadonlySet<string> = new Set(
  DISABLED_BUNDLED_SKILL_NAMES,
)

function isDisabledBundledSkillName(name: string): boolean {
  return DISABLED_BUNDLED_SKILL_NAME_SET.has(name)
}

export { DISABLED_BUNDLED_SKILL_NAMES, isDisabledBundledSkillName }
