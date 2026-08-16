import { Config } from "../config.js"
import { parseConfigObject } from "../parse-values.js"

function stableSerialize<TValue>(value: TValue): string {
  if (value === null) {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`
  }

  const record = parseConfigObject(value)
  if (record !== undefined) {
    const entries = Object.entries(record).toSorted(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`
  }

  return JSON.stringify(value)
}

function fingerprintOpenCodeConfig<TOverlay>(config: Config.Info, overlay: TOverlay): string {
  return stableSerialize({
    config,
    overlay,
  })
}

export { fingerprintOpenCodeConfig }
