import { z } from "zod"
import { createElement } from "react"
import type { FoliateReaderLocation } from "../foliate-reader-types"
import type { FoliateSearchExcerpt } from "foliate-js/view.js"

const FoliateLocalizedTextRecordSchema = z.record(z.string(), z.string())
const FoliateLocalizedTextSchema = z.union([z.string(), FoliateLocalizedTextRecordSchema])
const FoliateNamedContributorSchema = z.object({
  name: FoliateLocalizedTextSchema.optional(),
})
const FoliateContributorSchema = z.union([
  FoliateLocalizedTextSchema,
  FoliateNamedContributorSchema,
])
export const FoliateMetadataValueSchema = z.union([
  FoliateContributorSchema,
  z.array(FoliateContributorSchema),
])

export type TFoliateLocalizedText = z.infer<typeof FoliateLocalizedTextSchema>
export type TFoliateContributor = z.infer<typeof FoliateContributorSchema>
export type TFoliateMetadataValue = z.infer<typeof FoliateMetadataValueSchema>

export function readLocalizedText(value: TFoliateLocalizedText): string | undefined {
  const asString = z.string().safeParse(value)
  if (asString.success) {
    const trimmed = asString.data.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  for (const entry of Object.values(value)) {
    const trimmed = entry.trim()
    if (trimmed.length > 0) return trimmed
  }

  return undefined
}

function formatNamedContributor(value: TFoliateContributor): string | undefined {
  const asLocalized = FoliateLocalizedTextSchema.safeParse(value)
  if (asLocalized.success) return readLocalizedText(asLocalized.data)

  const asNamed = FoliateNamedContributorSchema.safeParse(value)
  if (!asNamed.success || asNamed.data.name === undefined) return undefined
  return readLocalizedText(asNamed.data.name)
}

export function formatContributor(
  value: TFoliateContributor | TFoliateContributor[],
): string | undefined {
  if (Array.isArray(value)) {
    const entries = value
      .map(formatNamedContributor)
      .filter((entry): entry is string => Boolean(entry))
    return entries.length > 0 ? entries.join(", ") : undefined
  }

  return formatNamedContributor(value)
}

export function formatMetadataValue(value: TFoliateMetadataValue): string | undefined {
  return formatContributor(value) ?? undefined
}

export function toPercentLabel(fraction?: number) {
  if (fraction === undefined || !Number.isFinite(fraction)) return undefined
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
