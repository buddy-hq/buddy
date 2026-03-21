import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const GUARD_PLUGIN_BASENAME = "buddy-system-prompt-guard"
const GUARD_PLUGIN_DIR = "plugins"

function resolvePluginPathCandidate(filename: string) {
  return path.resolve(import.meta.dir, GUARD_PLUGIN_DIR, filename)
}

export function resolveBuddySystemPromptGuardPluginUrl() {
  const candidates = [
    resolvePluginPathCandidate(`${GUARD_PLUGIN_BASENAME}.js`),
    resolvePluginPathCandidate(`${GUARD_PLUGIN_BASENAME}.ts`),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return pathToFileURL(candidate).href
    }
  }

  return undefined
}
