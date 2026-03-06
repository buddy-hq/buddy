import fs from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import { resolveBuddyBundledSkillRoots } from "../../config/opencode/skills.js"

export type LoadedActivitySkill = {
  name: string
  description?: string
  content: string
}

function bundledSkillPath(name: string) {
  return path.join(name, "SKILL.md")
}

export async function loadBundledActivitySkill(name: string): Promise<LoadedActivitySkill | undefined> {
  const roots = await resolveBuddyBundledSkillRoots()
  let document: string | undefined

  for (const root of roots) {
    const filePath = path.join(root, bundledSkillPath(name))
    document = await fs.readFile(filePath, "utf8").catch(() => undefined)
    if (document) break
  }

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
