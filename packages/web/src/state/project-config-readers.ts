import { z } from "zod"
import {
  EMPTY_BUDDY_CONFIG,
  parseBooleanValue,
  parseBuddyConfigObject,
  parseFiniteNumber,
  parseStringValue,
  parseWithSchema,
  type TBuddyConfigObject,
} from "./parse-external"

export type { TBuddyConfigObject }

export type PersonalizationSettings = {
  primaryUse?: PrimaryUse
  preferredName: string
  occupation: string
  moreAboutYou: string
}

type TPersonalizationPatch = {
  primary_use?: PrimaryUse
  preferred_name?: string
  occupation?: string
  more_about_you?: string
}

export const PRIMARY_USES = ["learn", "teach"] as const
export type PrimaryUse = (typeof PRIMARY_USES)[number]

export const EMPTY_PERSONALIZATION_SETTINGS: PersonalizationSettings = {
  primaryUse: undefined,
  preferredName: "",
  occupation: "",
  moreAboutYou: "",
}

const personalizationSettingsSchema = z.object({
  primaryUse: z.enum(PRIMARY_USES).optional(),
  preferredName: z.string(),
  occupation: z.string(),
  moreAboutYou: z.string(),
})

export function isPrimaryUse(value: string): value is PrimaryUse {
  return PRIMARY_USES.some((primaryUse) => primaryUse === value)
}

export function parsePersonalizationSettings<TValue>(
  value: TValue,
): PersonalizationSettings | undefined {
  return parseWithSchema(personalizationSettingsSchema, value)
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

function configObject<TConfig>(input: TConfig): TBuddyConfigObject {
  return parseBuddyConfigObject(input) ?? EMPTY_BUDDY_CONFIG
}

export function readString<TConfig>(input: TConfig, key: string) {
  return parseStringValue(configObject(input)[key]) ?? ""
}

export function readRecord<TConfig>(input: TConfig, key: string) {
  return parseBuddyConfigObject(configObject(input)[key])
}

export function readToolToggle<TConfig>(input: TConfig, toolId: string, fallback: boolean) {
  const tools = readRecord(input, "tools")
  return parseBooleanValue(tools?.[toolId]) ?? fallback
}

export function readCompactionAuto<TConfig>(input: TConfig, fallback: boolean) {
  const compaction = readRecord(input, "compaction")
  return parseBooleanValue(compaction?.auto) ?? fallback
}

export function readLearnerMemoryEnabled<TConfig>(input: TConfig, fallback: boolean) {
  const learnerMemory = readRecord(input, "learner_memory")
  return parseBooleanValue(learnerMemory?.enabled) ?? fallback
}

export function readLearnerMemoryAutoExtract<TConfig>(input: TConfig, fallback: boolean) {
  const learnerMemory = readRecord(input, "learner_memory")
  return parseBooleanValue(learnerMemory?.auto_extract) ?? fallback
}

export function readLearnerMemoryNumber<TConfig>(input: TConfig, key: string, fallback: number) {
  const learnerMemory = readRecord(input, "learner_memory")
  return parseFiniteNumber(learnerMemory?.[key]) ?? fallback
}

export function readLearnerMemoryString<TConfig>(input: TConfig, key: string) {
  const learnerMemory = readRecord(input, "learner_memory")
  return parseStringValue(learnerMemory?.[key]) ?? ""
}

export function readPersonalization<TConfig>(input: TConfig): PersonalizationSettings {
  const personalization = readRecord(input, "personalization")
  if (!personalization) {
    return EMPTY_PERSONALIZATION_SETTINGS
  }

  const primaryUseValue = parseStringValue(personalization.primary_use)

  return {
    primaryUse:
      primaryUseValue !== undefined && isPrimaryUse(primaryUseValue) ? primaryUseValue : undefined,
    preferredName: parseStringValue(personalization.preferred_name) ?? "",
    occupation: parseStringValue(personalization.occupation) ?? "",
    moreAboutYou: parseStringValue(personalization.more_about_you) ?? "",
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

  const personalization: TPersonalizationPatch = Object.assign(
    Object.assign(
      {},
      primaryUse ? { primary_use: primaryUse } : undefined,
      preferredName ? { preferred_name: preferredName } : undefined,
      occupation ? { occupation } : undefined,
    ),
    moreAboutYou ? { more_about_you: moreAboutYou } : undefined,
  )

  return { personalization }
}
