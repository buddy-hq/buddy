import matter from "gray-matter"
import z from "zod"

export type ParsedMarkdownArtifact<T> = {
  frontmatter: T
  body: string
}

export function parseMarkdownArtifact<T>(raw: string, schema: z.ZodType<T>): ParsedMarkdownArtifact<T> {
  const parsed = matter(raw)
  const result = schema.safeParse(parsed.data)
  if (!result.success) {
    throw new Error(`Invalid learner artifact frontmatter: ${result.error.issues[0]?.message ?? "parse failed"}`)
  }

  return {
    frontmatter: result.data,
    body: parsed.content.trim(),
  }
}

export function stringifyMarkdownArtifact(frontmatter: Record<string, unknown>, body?: string) {
  const normalizedBody = body?.trim() ?? ""
  const sanitized = sanitizeFrontmatter(frontmatter)
  return matter.stringify(normalizedBody, sanitized)
}

function sanitizeFrontmatter(value: Record<string, unknown>) {
  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key, sanitizeValue(entryValue)])
    .filter(([, entryValue]) => entryValue !== undefined)
  return Object.fromEntries(entries)
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .map(([key, entryValue]) => [key, sanitizeValue(entryValue)])

  return Object.fromEntries(entries)
}
