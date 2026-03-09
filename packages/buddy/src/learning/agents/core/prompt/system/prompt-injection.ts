import type {
  PromptInjectionCache,
  PromptInjectionDecision,
  PromptInjectionPolicy,
  RuntimePromptSection,
} from "./types"

type PromptInjectionLegacyCache = {
  stableHeader: string
  turnContext: string
}

type IndexedSection = {
  key: string
  fingerprint: string
  section: RuntimePromptSection
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isSectionCache(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false
  for (const item of Object.values(value)) {
    if (typeof item !== "string") return false
  }
  return true
}

function readPreviousCache(previous: unknown): PromptInjectionCache | undefined {
  if (!isRecord(previous)) return undefined

  const stableHeaderSections = previous.stableHeaderSections
  const turnContextSections = previous.turnContextSections

  if (!isSectionCache(stableHeaderSections) || !isSectionCache(turnContextSections)) {
    return undefined
  }

  return {
    stableHeaderSections,
    turnContextSections,
  }
}

function sectionFingerprint(section: RuntimePromptSection): string {
  return `${section.label}\n${section.text}`.trim()
}

function indexSections(sections: RuntimePromptSection[]): IndexedSection[] {
  const result: IndexedSection[] = []
  const counts = new Map<string, number>()

  for (const section of sections) {
    const baseKey = `${section.kind}:${section.label}`
    const seenCount = (counts.get(baseKey) ?? 0) + 1
    counts.set(baseKey, seenCount)

    result.push({
      key: seenCount === 1 ? baseKey : `${baseKey}#${seenCount}`,
      fingerprint: sectionFingerprint(section),
      section,
    })
  }

  return result
}

function buildSectionCache(entries: IndexedSection[]): Record<string, string> {
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.fingerprint]))
}

function diffSectionCache(previous: Record<string, string> | undefined, next: Record<string, string>): {
  changedKeys: string[]
  removedKeys: string[]
} {
  const changedKeys: string[] = []
  const removedKeys: string[] = []

  for (const [key, value] of Object.entries(next)) {
    if (!previous || previous[key] !== value) {
      changedKeys.push(key)
    }
  }

  if (!previous) {
    return { changedKeys, removedKeys }
  }

  for (const key of Object.keys(previous)) {
    if (!(key in next)) {
      removedKeys.push(key)
    }
  }

  return { changedKeys, removedKeys }
}

function includeKinds(
  allEntries: IndexedSection[],
  currentEntries: IndexedSection[],
  kinds: RuntimePromptSection["kind"][] | undefined,
): IndexedSection[] {
  if (!kinds || kinds.length === 0) {
    return currentEntries
  }

  const wantedKinds = new Set(kinds)
  const seenKeys = new Set(currentEntries.map((entry) => entry.key))
  const merged = [...currentEntries]

  for (const entry of allEntries) {
    if (seenKeys.has(entry.key)) continue
    if (!wantedKinds.has(entry.section.kind)) continue
    seenKeys.add(entry.key)
    merged.push(entry)
  }

  return merged
}

function pickSectionsToInject(input: {
  allEntries: IndexedSection[]
  changedKeys: string[]
  injectAll: boolean
  forceKinds?: RuntimePromptSection["kind"][]
}): IndexedSection[] {
  const changedKeySet = new Set(input.changedKeys)

  const selected = input.injectAll
    ? [...input.allEntries]
    : input.allEntries.filter((entry) => changedKeySet.has(entry.key))

  return includeKinds(input.allEntries, selected, input.forceKinds)
}

function renderStableHeader(sections: RuntimePromptSection[]): string {
  return sections.map((section) => section.text).join("\n\n").trim()
}

function renderTurnContext(sections: RuntimePromptSection[]): string {
  if (sections.length === 0) return ""

  return [
    "<buddy_turn_context>",
    ...sections.map((section) => `${section.label}:\n${section.text}`),
    "</buddy_turn_context>",
  ].join("\n\n").trim()
}

export function resolvePromptInjectionDecision(input: {
  previous?: PromptInjectionCache | PromptInjectionLegacyCache
  stableHeaderSections: RuntimePromptSection[]
  turnContextSections: RuntimePromptSection[]
  policy?: PromptInjectionPolicy
}): PromptInjectionDecision {
  const previousCache = readPreviousCache(input.previous)

  const stableEntries = indexSections(input.stableHeaderSections)
  const turnEntries = indexSections(input.turnContextSections)

  const nextStableCache = buildSectionCache(stableEntries)
  const nextTurnCache = buildSectionCache(turnEntries)

  const stableDiff = diffSectionCache(previousCache?.stableHeaderSections, nextStableCache)
  const turnDiff = diffSectionCache(previousCache?.turnContextSections, nextTurnCache)

  const injectAllStableHeader =
    !previousCache || !!input.policy?.forceInjectStableHeader || stableDiff.removedKeys.length > 0

  const injectAllTurnContext =
    !previousCache || !!input.policy?.forceInjectTurnContext || turnDiff.removedKeys.length > 0

  const stableToInject = pickSectionsToInject({
    allEntries: stableEntries,
    changedKeys: stableDiff.changedKeys,
    injectAll: injectAllStableHeader,
    forceKinds: input.policy?.forceStableHeaderKinds,
  })

  let turnToInject = pickSectionsToInject({
    allEntries: turnEntries,
    changedKeys: turnDiff.changedKeys,
    injectAll: injectAllTurnContext,
    forceKinds: input.policy?.forceTurnContextKinds,
  })

  turnToInject = includeKinds(turnEntries, turnToInject, input.policy?.alwaysIncludeTurnContextKinds)

  const stableHeader = renderStableHeader(stableToInject.map((entry) => entry.section))
  const turnContext = renderTurnContext(turnToInject.map((entry) => entry.section))

  return {
    injectStableHeader: stableHeader.length > 0,
    injectTurnContext: turnContext.length > 0,
    stableHeader,
    turnContext,
    changedStableHeaderSectionKeys: [...stableDiff.changedKeys, ...stableDiff.removedKeys],
    changedTurnContextSectionKeys: [...turnDiff.changedKeys, ...turnDiff.removedKeys],
    cache: {
      stableHeaderSections: nextStableCache,
      turnContextSections: nextTurnCache,
    },
  }
}

export type {
  PromptInjectionCache,
  PromptInjectionDecision,
  PromptInjectionPolicy,
}
