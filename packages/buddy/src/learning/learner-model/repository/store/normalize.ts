const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "project",
  "workspace",
  "buddy",
])

export function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function normalizeList(values: readonly string[] | undefined) {
  return Array.from(new Set((values ?? []).map((value) => normalizeText(value)).filter(Boolean)))
}

export function inferTags(input: string) {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
    ),
  ).slice(0, 12)
}
