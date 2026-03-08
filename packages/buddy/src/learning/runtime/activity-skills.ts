import fs from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import { resolveBuddyBundledSkillRoots } from "../../config/opencode/skills.js"

export type LoadedActivitySkill = {
  name: string
  description?: string
  content: string
}

async function readBundledSkillDocument(name: string): Promise<string | undefined> {
  const relativePath = path.join(name, "SKILL.md")
  const roots = await resolveBuddyBundledSkillRoots()
  for (const root of roots) {
    const document = await fs.readFile(path.join(root, relativePath), "utf8").catch(() => undefined)
    if (document) {
      return document
    }
  }
  return undefined
}

export async function loadBundledActivitySkill(name: string): Promise<LoadedActivitySkill | undefined> {
  const document = await readBundledSkillDocument(name)
  if (!document) return undefined

  const parsed = matter(document)
  const description = typeof parsed.data.description === "string" ? parsed.data.description.trim() : undefined

  return {
    name,
    description,
    content: parsed.content.trim(),
  }
}

export async function loadBundledActivitySkills(names: string[]): Promise<LoadedActivitySkill[]> {
  const loaded = await Promise.all(names.map((name) => loadBundledActivitySkill(name)))
  return loaded.filter((skill): skill is LoadedActivitySkill => !!skill)
}
