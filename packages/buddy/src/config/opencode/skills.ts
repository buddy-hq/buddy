import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Config } from "../config.js"

const BUDDY_BUNDLED_SKILL_ROOT_CANDIDATES = [
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./skills/system"),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/system"),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../src/skills/system"),
]

async function resolveBuddyBundledSkillRoots(): Promise<string[]> {
  const resolved: string[] = []

  for (const candidate of BUDDY_BUNDLED_SKILL_ROOT_CANDIDATES) {
    const stats = await fs.stat(candidate).catch(() => undefined)
    if (!stats?.isDirectory()) continue
    if (resolved.includes(candidate)) continue
    resolved.push(candidate)
  }

  return resolved
}

async function resolveOpenCodeSkillPaths(config: Config.Info): Promise<string[] | undefined> {
  const paths = Array.isArray(config.skills?.paths)
    ? config.skills.paths.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : []
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex")
  const codexRoots = [
    path.join(codexHome, "skills"),
    path.join(codexHome, "skills", ".system"),
  ]
  const bundledRoots = await resolveBuddyBundledSkillRoots()

  for (const candidate of [...codexRoots, ...bundledRoots]) {
    const stats = await fs.stat(candidate).catch(() => undefined)
    if (!stats?.isDirectory()) continue
    if (paths.includes(candidate)) continue
    paths.push(candidate)
  }

  return paths.length > 0 ? paths : undefined
}

export { resolveBuddyBundledSkillRoots, resolveOpenCodeSkillPaths }
