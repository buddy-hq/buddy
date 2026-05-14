import fs from "node:fs"
import path from "node:path"

type EnvMap = Record<string, string>

const PROVIDER_SECRET_KEY_PATTERN =
  /(^|_)(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|BEARER_TOKEN|SECRET_KEY)$/

function parseEnvFile(content: string) {
  const env: EnvMap = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line
    const separatorIndex = normalized.indexOf("=")
    if (separatorIndex <= 0) continue

    const key = normalized.slice(0, separatorIndex).trim()
    const rawValue = normalized.slice(separatorIndex + 1).trim()
    if (!key) continue

    const quote = rawValue[0]
    const quoted =
      (quote === '"' || quote === "'") && rawValue.endsWith(quote)
        ? rawValue.slice(1, -1)
        : rawValue
    env[key] = quoted
  }

  return env
}

function shouldStripProviderSecret(key: string) {
  if (!PROVIDER_SECRET_KEY_PATTERN.test(key)) return false
  return !key.startsWith("BUDDY_") && !key.startsWith("OPENCODE_")
}

export function loadSafeRepoEnv(repoRoot: string) {
  const envPath = path.join(repoRoot, ".env")
  if (!fs.existsSync(envPath)) return {}

  const parsed = parseEnvFile(fs.readFileSync(envPath, "utf8"))
  return Object.fromEntries(
    Object.entries(parsed).filter(([key]) => !shouldStripProviderSecret(key)),
  )
}

export function mergeSafeRepoEnv(baseEnv: EnvMap, repoRoot: string) {
  const envPath = path.join(repoRoot, ".env")
  const parsed = fs.existsSync(envPath) ? parseEnvFile(fs.readFileSync(envPath, "utf8")) : {}
  const merged = { ...baseEnv }

  for (const key of Object.keys(parsed)) {
    if (!shouldStripProviderSecret(key)) continue
    delete merged[key]
  }

  return {
    ...loadSafeRepoEnv(repoRoot),
    ...merged,
  }
}
