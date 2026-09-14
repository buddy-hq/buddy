import { z } from "zod"

const TAGS_PROPERTY_NAME = "tags"
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/u
const DATE_FORMAT = { dateStyle: "medium" } satisfies Intl.DateTimeFormatOptions
const DATETIME_FORMAT = {
  dateStyle: "medium",
  timeStyle: "short",
} satisfies Intl.DateTimeFormatOptions

const propertyValueSchema = z.json()
const frontmatterSchema = z.record(z.string(), propertyValueSchema)
const listValueSchema = z.array(propertyValueSchema)
const stringValueSchema = z.string()
const numberValueSchema = z.number()
const booleanValueSchema = z.boolean()

type MarkdownBenchPropertyValue = z.infer<typeof propertyValueSchema>

/** One frontmatter entry, typed the way Obsidian's Properties view displays it. */
export type MarkdownBenchProperty =
  | { name: string; kind: "checkbox"; checked: boolean }
  | { name: string; kind: "list" | "tags"; items: string[] }
  | { name: string; kind: "date" | "datetime"; text: string; iso: string }
  | { name: string; kind: "number" | "text"; text: string }

function parseLocalCalendarDate(value: string): Date | undefined {
  if (!ISO_DATE_PATTERN.test(value)) return undefined
  const [yearText, monthText, dayText] = value.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(`${value}T00:00:00`)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return undefined
  }
  return date
}

function parseIsoDateTime(value: string): Date | undefined {
  if (!ISO_DATETIME_PATTERN.test(value) || !parseLocalCalendarDate(value.slice(0, 10))) {
    return undefined
  }
  const normalized = value.at(10) === " " ? `${value.slice(0, 10)}T${value.slice(11)}` : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return date.toLocaleString(undefined, options)
}

function propertyText(value: MarkdownBenchPropertyValue): string {
  if (value === null) return ""
  const text = stringValueSchema.safeParse(value)
  return text.success ? text.data.trim() : JSON.stringify(value)
}

function propertyItems(values: readonly MarkdownBenchPropertyValue[]): string[] {
  return values.map(propertyText).filter((text) => text.length > 0)
}

function markdownBenchProperty(
  name: string,
  value: MarkdownBenchPropertyValue,
): MarkdownBenchProperty {
  const list = listValueSchema.safeParse(value)
  if (name === TAGS_PROPERTY_NAME) {
    return { name, kind: "tags", items: propertyItems(list.success ? list.data : [value]) }
  }
  if (list.success) return { name, kind: "list", items: propertyItems(list.data) }

  const checkbox = booleanValueSchema.safeParse(value)
  if (checkbox.success) return { name, kind: "checkbox", checked: checkbox.data }
  if (numberValueSchema.safeParse(value).success) {
    return { name, kind: "number", text: propertyText(value) }
  }

  const iso = stringValueSchema.safeParse(value)
  if (iso.success) {
    const date = parseLocalCalendarDate(iso.data)
    if (date) return { name, kind: "date", text: formatDate(date, DATE_FORMAT), iso: iso.data }
  }
  if (iso.success) {
    const dateTime = parseIsoDateTime(iso.data)
    if (dateTime) {
      return {
        name,
        kind: "datetime",
        text: formatDate(dateTime, DATETIME_FORMAT),
        iso: iso.data,
      }
    }
  }
  return { name, kind: "text", text: propertyText(value) }
}

/** Parses note frontmatter into display-ready properties; unparseable input shows none. */
export function parseMarkdownBenchProperties<TFrontmatter>(
  frontmatter: TFrontmatter,
): MarkdownBenchProperty[] {
  const parsed = frontmatterSchema.safeParse(frontmatter)
  if (!parsed.success) return []
  return Object.entries(parsed.data).map(([name, value]) => markdownBenchProperty(name, value))
}
