import type { RuntimePromptSection } from "./types.js"

type SectionCache = Record<string, string>

export type PromptInjectionCache = {
  stableHeaderSections: SectionCache
  turnContextSections: SectionCache
}

type PromptInjectionLegacyCache = {
  stableHeader: string
  turnContext: string
}

export type PromptInjectionPolicy = {
  forceInjectStableHeader?: boolean
  forceInjectTurnContext?: boolean
  forceStableHeaderKinds?: RuntimePromptSection["kind"][]
  forceTurnContextKinds?: RuntimePromptSection["kind"][]
  alwaysIncludeTurnContextKinds?: RuntimePromptSection["kind"][]
}

export type PromptInjectionDecision = {
  injectStableHeader: boolean
  injectTurnContext: boolean
  stableHeader: string
  turnContext: string
  changedStableHeaderSectionKeys: string[]
  changedTurnContextSectionKeys: string[]
  cache: PromptInjectionCache
}

type IndexedSection = {
  key: string
  fingerprint: string
  section: RuntimePromptSection
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isSectionCache(value: unknown): value is SectionCache {
  if (!isRecord(value)) return false
  for (const item of Object.values(value)) {
    if (typeof item !== "string") return false
  }
  return true
}

function isPromptInjectionCache(value: unknown): value is PromptInjectionCache {
  if (!isRecord(value)) return false
  return isSectionCache(value.stableHeaderSections) && isSectionCache(value.turnContextSections)
}

function isPromptInjectionLegacyCache(value: unknown): value is PromptInjectionLegacyCache {
  if (!isRecord(value)) return false
  return typeof value.stableHeader === "string" && typeof value.turnContext === "string"
}

function normalizePreviousCache(previous: unknown): PromptInjectionCache | undefined {
  if (isPromptInjectionCache(previous)) return previous
  if (isPromptInjectionLegacyCache(previous)) return undefined
  return undefined
}

function sectionFingerprint(section: RuntimePromptSection) {
  return `${section.label}\n${section.text}`.trim()
}

function indexSections(sections: RuntimePromptSection[]): IndexedSection[] {
  const counts = new Map<string, number>()
  const result: IndexedSection[] = []

  for (const section of sections) {
    const baseKey = `${section.kind}:${section.label}`
    const seen = (counts.get(baseKey) ?? 0) + 1
    counts.set(baseKey, seen)
    const key = seen === 1 ? baseKey : `${baseKey}#${seen}`
    result.push({
      key,
      fingerprint: sectionFingerprint(section),
      section,
    })
  }

  return result
}

function toCache(entries: IndexedSection[]): SectionCache {
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.fingerprint]))
}

function diffSections(previous: SectionCache | undefined, next: SectionCache) {
  const changed = [] as string[]
  const removed = [] as string[]

  for (const [key, value] of Object.entries(next)) {
    if (!previous || previous[key] !== value) {
      changed.push(key)
    }
  }

  if (previous) {
    for (const key of Object.keys(previous)) {
      if (!(key in next)) {
        removed.push(key)
      }
    }
  }

  return { changed, removed }
}

function renderStableHeader(sections: RuntimePromptSection[]) {
  return sections.map((section) => section.text).join("\n\n").trim()
}

function renderTurnContext(sections: RuntimePromptSection[]) {
  if (sections.length === 0) return ""
  return [
    "<buddy_turn_context>",
    ...sections.map((section) => `${section.label}:\n${section.text}`),
    "</buddy_turn_context>",
  ].join("\n\n").trim()
}

function includeByKinds(
  sections: IndexedSection[],
  existing: IndexedSection[],
  kinds: RuntimePromptSection["kind"][] | undefined,
) {
  if (!kinds || kinds.length === 0) return existing
  const wanted = new Set(kinds)
  const seen = new Set(existing.map((entry) => entry.key))
  const merged = [...existing]
  for (const section of sections) {
    if (!wanted.has(section.section.kind) || seen.has(section.key)) continue
    seen.add(section.key)
    merged.push(section)
  }
  return merged
}

export function resolvePromptInjectionDecision(input: {
  previous?: PromptInjectionCache | PromptInjectionLegacyCache
  stableHeaderSections: RuntimePromptSection[]
  turnContextSections: RuntimePromptSection[]
  policy?: PromptInjectionPolicy
}): PromptInjectionDecision {
  const previous = normalizePreviousCache(input.previous)
  const stableEntries = indexSections(input.stableHeaderSections)
  const turnEntries = indexSections(input.turnContextSections)
  const stableCache = toCache(stableEntries)
  const turnCache = toCache(turnEntries)
  const stableDiff = diffSections(previous?.stableHeaderSections, stableCache)
  const turnDiff = diffSections(previous?.turnContextSections, turnCache)

  const injectAllStableHeader =
    !previous || !!input.policy?.forceInjectStableHeader || stableDiff.removed.length > 0
  const injectAllTurnContext =
    !previous || !!input.policy?.forceInjectTurnContext || turnDiff.removed.length > 0

  const changedStableKeys = new Set(stableDiff.changed)
  const changedTurnKeys = new Set(turnDiff.changed)

  let stableToInject = injectAllStableHeader
    ? stableEntries
    : stableEntries.filter((entry) => changedStableKeys.has(entry.key))
  stableToInject = includeByKinds(stableEntries, stableToInject, input.policy?.forceStableHeaderKinds)

  let turnToInject = injectAllTurnContext
    ? turnEntries
    : turnEntries.filter((entry) => changedTurnKeys.has(entry.key))
  turnToInject = includeByKinds(turnEntries, turnToInject, input.policy?.forceTurnContextKinds)
  turnToInject = includeByKinds(turnEntries, turnToInject, input.policy?.alwaysIncludeTurnContextKinds)

  const stableHeader = renderStableHeader(stableToInject.map((entry) => entry.section))
  const turnContext = renderTurnContext(turnToInject.map((entry) => entry.section))

  return {
    injectStableHeader: stableHeader.length > 0,
    injectTurnContext: turnContext.length > 0,
    stableHeader,
    turnContext,
    changedStableHeaderSectionKeys: [...stableDiff.changed, ...stableDiff.removed],
    changedTurnContextSectionKeys: [...turnDiff.changed, ...turnDiff.removed],
    cache: {
      stableHeaderSections: stableCache,
      turnContextSections: turnCache,
    },
  }
}
