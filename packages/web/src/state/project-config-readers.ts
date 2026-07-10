function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export type PersonalizationSettings = {
  primaryUse?: PrimaryUse
  preferredName: string
  occupation: string
  moreAboutYou: string
}

export const PRIMARY_USES = ["learn", "teach"] as const
export type PrimaryUse = (typeof PRIMARY_USES)[number]

export const EMPTY_PERSONALIZATION_SETTINGS: PersonalizationSettings = {
  primaryUse: undefined,
  preferredName: "",
  occupation: "",
  moreAboutYou: "",
}

export function isPrimaryUse(value: string): value is PrimaryUse {
  return PRIMARY_USES.some((primaryUse) => primaryUse === value)
}

export function normalizePersonalizationSettings(
  input: PersonalizationSettings,
): PersonalizationSettings {
  return {
    primaryUse: input.primaryUse,
    preferredName: input.preferredName.trim(),
    occupation: input.occupation.trim(),
    moreAboutYou: input.moreAboutYou.trim(),
  }
}

export function personalizationSettingsMatch(
  left: PersonalizationSettings,
  right: PersonalizationSettings,
) {
  const normalizedLeft = normalizePersonalizationSettings(left)
  const normalizedRight = normalizePersonalizationSettings(right)

  return (
    normalizedLeft.primaryUse === normalizedRight.primaryUse &&
    normalizedLeft.preferredName === normalizedRight.preferredName &&
    normalizedLeft.occupation === normalizedRight.occupation &&
    normalizedLeft.moreAboutYou === normalizedRight.moreAboutYou
  )
}

export function shouldResetPersonalizationForm(input: {
  nextValues: PersonalizationSettings
  currentValues: PersonalizationSettings
  lastSavedValues?: PersonalizationSettings
}) {
  if (personalizationSettingsMatch(input.nextValues, input.currentValues)) {
    return false
  }

  if (!input.lastSavedValues) {
    return personalizationSettingsMatch(input.nextValues, EMPTY_PERSONALIZATION_SETTINGS)
  }

  return personalizationSettingsMatch(input.nextValues, input.lastSavedValues)
}

export function readString(input: Record<string, unknown>, key: string) {
  const value = input[key]
  return typeof value === "string" ? value : ""
}

export function readRecord(input: Record<string, unknown>, key: string) {
  const value = input[key]
  if (!isRecord(value)) {
    return undefined
  }
  return value
}

export function readToolToggle(input: Record<string, unknown>, toolId: string, fallback: boolean) {
  const tools = readRecord(input, "tools")
  const value = tools?.[toolId]
  return typeof value === "boolean" ? value : fallback
}

export function readCompactionAuto(input: Record<string, unknown>, fallback: boolean) {
  const compaction = readRecord(input, "compaction")
  const value = compaction?.auto
  return typeof value === "boolean" ? value : fallback
}

export function readLearnerMemoryEnabled(input: Record<string, unknown>, fallback: boolean) {
  const learnerMemory = readRecord(input, "learner_memory")
  const value = learnerMemory?.enabled
  return typeof value === "boolean" ? value : fallback
}

export function readLearnerMemoryMasterEnabled(input: Record<string, unknown>, fallback: boolean) {
  const learnerMemory = readRecord(input, "learner_memory")
  const value = learnerMemory?.master_enabled
  return typeof value === "boolean" ? value : fallback
}

export function readLearnerMemoryAutoExtract(input: Record<string, unknown>, fallback: boolean) {
  const learnerMemory = readRecord(input, "learner_memory")
  const value = learnerMemory?.auto_extract
  return typeof value === "boolean" ? value : fallback
}

export function readLearnerMemoryNumber(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const learnerMemory = readRecord(input, "learner_memory")
  const value = learnerMemory?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function readLearnerMemoryString(input: Record<string, unknown>, key: string) {
  const learnerMemory = readRecord(input, "learner_memory")
  const value = learnerMemory?.[key]
  return typeof value === "string" ? value : ""
}

export function readPersonalization(input: Record<string, unknown>): PersonalizationSettings {
  const personalization = readRecord(input, "personalization")
  if (!personalization) {
    return EMPTY_PERSONALIZATION_SETTINGS
  }

  const primaryUse = personalization.primary_use

  return {
    primaryUse: typeof primaryUse === "string" && isPrimaryUse(primaryUse) ? primaryUse : undefined,
    preferredName:
      typeof personalization.preferred_name === "string" ? personalization.preferred_name : "",
    occupation: typeof personalization.occupation === "string" ? personalization.occupation : "",
    moreAboutYou:
      typeof personalization.more_about_you === "string" ? personalization.more_about_you : "",
  }
}

export function buildPersonalizationPatch(input: PersonalizationSettings) {
  const normalized = normalizePersonalizationSettings(input)
  const primaryUse = normalized.primaryUse
  const preferredName = normalized.preferredName
  const occupation = normalized.occupation
  const moreAboutYou = normalized.moreAboutYou

  if (!primaryUse && !preferredName && !occupation && !moreAboutYou) {
    return { personalization: null }
  }

  return {
    personalization: {
      ...(primaryUse ? { primary_use: primaryUse } : {}),
      ...(preferredName ? { preferred_name: preferredName } : {}),
      ...(occupation ? { occupation } : {}),
      ...(moreAboutYou ? { more_about_you: moreAboutYou } : {}),
    },
  }
}
