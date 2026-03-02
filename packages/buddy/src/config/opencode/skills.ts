import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Config } from "../config.js"

async function resolveOpenCodeSkillPaths(config: Config.Info): Promise<string[] | undefined> {
  const paths = Array.isArray(config.skills?.paths)
    ? config.skills.paths.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : []
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex")
  const codexRoots = [
    path.join(codexHome, "skills"),
    path.join(codexHome, "skills", ".system"),
  ]

  for (const candidate of codexRoots) {
    const stats = await fs.stat(candidate).catch(() => undefined)
    if (!stats?.isDirectory()) continue
    if (paths.includes(candidate)) continue
    paths.push(candidate)
  }

  return paths.length > 0 ? paths : undefined
}

export { resolveOpenCodeSkillPaths }
