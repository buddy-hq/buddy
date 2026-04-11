import { createElement } from "react"
import type { FoliateReaderLocation } from "../foliate-reader-types"
import type { FoliateSearchExcerpt } from "foliate-js/view.js"

export function isLocalizedTextRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).every((entry) => typeof entry === "string")
}

export function readLocalizedText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (!isLocalizedTextRecord(value)) return undefined

  for (const entry of Object.values(value)) {
    const trimmed = entry.trim()
    if (trimmed.length > 0) return trimmed
  }

  return undefined
}

export function formatContributor(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const entries = value.map(formatContributor).filter((entry): entry is string => Boolean(entry))
    return entries.length > 0 ? entries.join(", ") : undefined
  }

  const directText = readLocalizedText(value)
  if (directText) return directText

  if (!value || typeof value !== "object" || !("name" in value)) return undefined
  return readLocalizedText(value.name)
}

export function formatMetadataValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const entries = value
      .map(formatMetadataValue)
      .filter((entry): entry is string => Boolean(entry))
    return entries.length > 0 ? entries.join(", ") : undefined
  }

  const contributor = formatContributor(value)
  if (contributor) return contributor

  return readLocalizedText(value)
}

export function toPercentLabel(fraction?: number) {
  if (typeof fraction !== "number") return undefined
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)))
  return `${percent}%`
}

export function renderMetadataSummary(location: FoliateReaderLocation) {
  const segments = [location.pageLabel, location.locationLabel, toPercentLabel(location.fraction)]
    .filter((entry): entry is string => Boolean(entry))
    .join(" • ")
  return segments.length > 0 ? segments : "Ready"
}

export function renderSearchExcerpt(excerpt: FoliateSearchExcerpt) {
  return createElement(
    "span",
    { className: "inline" },
    createElement("span", null, excerpt.pre),
    createElement("span", { className: "font-semibold text-text-strong" }, excerpt.match),
    createElement("span", null, excerpt.post),
  )
}
