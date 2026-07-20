import type { CollectionEntry } from "astro:content"
import { getCollection } from "astro:content"
import { content } from "../content/site"
import { COMPARE_PATH, LEARNER_PATH } from "./constants"
import type { JsonLdObject } from "./seo"

const COMPARE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISO_DATE_LENGTH = 10
const compareSourceFiles = import.meta.glob<string>("../content/compares/**/*.{yaml,yml}", {
  eager: true,
  import: "default",
  query: "?raw",
})

export type CompareEntry = CollectionEntry<"compares">
export type CompareSection = CompareEntry["data"]["sections"][number]

function assertUniqueValue(
  entries: readonly CompareEntry[],
  getValue: (entry: CompareEntry) => string,
  label: string,
): void {
  const owners = new Map<string, string>()

  for (const entry of entries) {
    const value = getValue(entry)
    const existingOwner = owners.get(value)
    if (existingOwner) {
      throw new Error(
        `Compare entries "${existingOwner}" and "${entry.id}" use the same ${label}: "${value}".`,
      )
    }
    owners.set(value, entry.id)
  }
}

function validateCompareEntries(entries: readonly CompareEntry[]): void {
  const entryIds = new Set(entries.map((entry) => entry.id))

  assertUniqueValue(entries, (entry) => entry.data.title, "title")
  assertUniqueValue(entries, (entry) => entry.data.description, "description")
  assertUniqueValue(entries, (entry) => entry.data.competitorUrl, "competitor URL")

  for (const entry of entries) {
    if (!COMPARE_SLUG_PATTERN.test(entry.id)) {
      throw new Error(
        `Compare entry "${entry.id}" must use one lowercase kebab-case URL segment.`,
      )
    }

    const sourceSuffixes = [`/${entry.id}.yaml`, `/${entry.id}.yml`]
    const hasSource = Object.keys(compareSourceFiles).some((sourcePath) =>
      sourceSuffixes.some((suffix) => sourcePath.endsWith(suffix)),
    )
    if (!hasSource) {
      throw new Error(`Compare entry "${entry.id}" has no matching YAML source.`)
    }

    const relatedIds = new Set<string>()
    for (const relatedId of entry.data.relatedCompares) {
      if (relatedId === entry.id) {
        throw new Error(`Compare entry "${entry.id}" cannot relate to itself.`)
      }
      if (!entryIds.has(relatedId)) {
        throw new Error(
          `Compare entry "${entry.id}" references missing related compare "${relatedId}".`,
        )
      }
      if (relatedIds.has(relatedId)) {
        throw new Error(
          `Compare entry "${entry.id}" references related compare "${relatedId}" more than once.`,
        )
      }
      relatedIds.add(relatedId)
    }
  }
}

export async function getCompareEntries(): Promise<readonly CompareEntry[]> {
  if (Object.keys(compareSourceFiles).length === 0) return []

  const entries = (await getCollection("compares")).toSorted((left, right) =>
    left.data.competitor.localeCompare(right.data.competitor),
  )
  validateCompareEntries(entries)
  return entries
}

export function getComparePath(slug: string): string {
  return `${COMPARE_PATH}${slug}/`
}

export function getCompareUrl(slug: string): string {
  return new URL(getComparePath(slug), content.meta.siteUrl).href
}

export function formatCompareDate(date: Date): string {
  return date.toISOString().slice(0, ISO_DATE_LENGTH)
}

export function getRelatedCompareEntries(
  entry: CompareEntry,
  entries: readonly CompareEntry[],
): readonly CompareEntry[] {
  const relatedIds = new Set(entry.data.relatedCompares)
  return entries.filter((candidate) => relatedIds.has(candidate.id))
}

export function buildCompareBreadcrumbJsonLd(entry: CompareEntry): JsonLdObject {
  const homeUrl = new URL(LEARNER_PATH, content.meta.siteUrl).href
  const compareHubUrl = new URL(COMPARE_PATH, content.meta.siteUrl).href

  return {
    "@type": "BreadcrumbList",
    "@id": `${getCompareUrl(entry.id)}#breadcrumb`,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: homeUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Compare",
        item: compareHubUrl,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: entry.data.competitor,
        item: getCompareUrl(entry.id),
      },
    ],
  }
}

export function buildCompareFaqJsonLd(entry: CompareEntry): JsonLdObject {
  return {
    "@type": "FAQPage",
    "@id": `${getCompareUrl(entry.id)}#faq`,
    mainEntity: entry.data.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }
}

export function buildComparedProductJsonLd(entry: CompareEntry): JsonLdObject {
  const comparedProductId = new URL(entry.data.competitorUrl)
  comparedProductId.hash = "compared-product"

  return {
    "@type": "Thing",
    "@id": comparedProductId.href,
    name: entry.data.competitor,
    url: entry.data.competitorUrl,
  }
}

export function buildCompareItemListJsonLd(entries: readonly CompareEntry[]): JsonLdObject {
  const compareHubUrl = new URL(COMPARE_PATH, content.meta.siteUrl).href

  return {
    "@type": "ItemList",
    "@id": `${compareHubUrl}#comparisons`,
    name: "Buddy comparisons",
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.data.headline,
      url: getCompareUrl(entry.id),
    })),
  }
}
