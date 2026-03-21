import fsp from "node:fs/promises"
import matter from "gray-matter"
import type { OpenCodeSkill } from "./contracts"

export function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

export function sanitizeSkillName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function skillDocument(input: {
  name: string
  description: string
  examplePrompt?: string
  content: string
}) {
  const frontmatter = [
    "---",
    `name: ${JSON.stringify(input.name)}`,
    `description: ${JSON.stringify(input.description)}`,
    ...(input.examplePrompt ? [`example_prompt: ${JSON.stringify(input.examplePrompt)}`] : []),
    "---",
  ]

  return [...frontmatter, "", input.content.trim(), ""].join("\n")
}

export async function loadManagedSkillFile(filepath: string): Promise<OpenCodeSkill | undefined> {
  const source = await fsp.readFile(filepath, "utf8").catch(() => undefined)
  if (!source) return undefined

  const parsed = matter(source)
  const name = readOptionalString(parsed.data.name)
  const description = readOptionalString(parsed.data.description)
  if (!name || !description) {
    return undefined
  }

  return {
    name,
    description,
    location: filepath,
    content: parsed.content.trim(),
  } satisfies OpenCodeSkill
}
