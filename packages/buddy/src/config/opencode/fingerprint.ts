import { Config } from "../config.js"

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`
}

function fingerprintOpenCodeConfig(config: Config.Info, overlay: unknown): string {
  return stableSerialize({
    config,
    overlay,
  })
}

export { fingerprintOpenCodeConfig }
