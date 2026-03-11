import fs from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import { resolveBuddyBundledSkillRoots } from "@buddy/backend/config/runtime"

export type LoadedBundledSkill = {
  name: string
  description?: string
  content: string
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}

function isPathInsideRoot(root: string, candidatePath: string) {
  const relative = path.relative(root, candidatePath)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

async function readBundledSkillDocument(name: string): Promise<string | undefined> {
  const roots = await resolveBuddyBundledSkillRoots()
  for (const root of roots) {
    const resolvedRoot = path.resolve(root)
    const resolvedDocumentPath = path.resolve(root, name, "SKILL.md")
    if (!isPathInsideRoot(resolvedRoot, resolvedDocumentPath)) {
      continue
    }

    try {
      const document = await fs.readFile(resolvedDocumentPath, "utf8")
      if (document !== undefined) {
        return document
      }
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        continue
      }
      throw error
    }
  }
  return undefined
}

export async function loadBundledSkill(name: string): Promise<LoadedBundledSkill | undefined> {
  const document = await readBundledSkillDocument(name)
  if (document === undefined) return undefined

  const parsed = matter(document)
  const description = typeof parsed.data.description === "string" ? parsed.data.description.trim() : undefined

  return {
    name,
    description,
    content: parsed.content.trim(),
  }
}

export async function loadBundledSkills(names: string[]): Promise<LoadedBundledSkill[]> {
  const loaded = await Promise.all(names.map((name) => loadBundledSkill(name)))
  return loaded.filter((skill): skill is LoadedBundledSkill => skill !== undefined)
}
