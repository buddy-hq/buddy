import { parseConfigObject, parseConfigString, type TConfigJsonObject, type TConfigJsonValue } from "../parse-values"

export const CONFIG_SECRET_REDACTED = "[REDACTED]"

const PUBLIC_PROVIDER_OPTIONS = new Set(["baseURL", "enterpriseUrl", "endpoint", "region", "project", "location", "deployment", "organization", "apiVersion", "timeout", "headerTimeout", "chunkTimeout", "setCacheKey"])

function isSecretPath(keys: readonly string[]): boolean {
  if (keys[0] === "mcp") {
    return keys[2] === "environment" || keys[2] === "headers" ||
      (keys[2] === "oauth" && keys[3] === "clientSecret")
  }
  if (keys[0] !== "provider") return false
  if (keys.includes("headers")) return true
  const optionsIndex = keys.indexOf("options")
  const option = keys[optionsIndex + 1]
  if (optionsIndex !== -1 && option !== undefined && !PUBLIC_PROVIDER_OPTIONS.has(option)) return true
  return keys.slice(2).some((key) => key !== "setCacheKey" && /key|token|secret|password|credential|authorization|authentication/iu.test(key))
}

function projectValue(value: TConfigJsonValue, keys: readonly string[]): TConfigJsonValue {
  const text = parseConfigString(value)
  if (text !== undefined && /\{(?:env|file):[^}]+\}/u.test(text) && (!isSecretPath(keys) || /^\{(?:env|file):[^}]+\}$/u.test(text))) return text
  if (Array.isArray(value)) return value.map((entry, index) => projectValue(entry, [...keys, String(index)]))
  const record = parseConfigObject(value)
  if (record) return projectObject(record, keys)
  return isSecretPath(keys) && value !== null && value !== "" ? CONFIG_SECRET_REDACTED : value
}

function projectObject(value: TConfigJsonObject, keys: readonly string[]): TConfigJsonObject {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) =>
    entry === undefined ? [] : [[key, projectValue(entry, [...keys, key])]],
  ))
}

export function projectWebSafeConfig<TConfig>(config: TConfig): TConfigJsonObject {
  return projectObject(parseConfigObject(config) ?? {}, [])
}

function preserveValue(value: TConfigJsonValue, current: TConfigJsonValue | undefined, keys: readonly string[]): TConfigJsonValue | undefined {
  if (value === CONFIG_SECRET_REDACTED && isSecretPath(keys)) return current
  if (Array.isArray(value)) return value.map((entry, index) => preserveValue(entry, Array.isArray(current) ? current[index] : undefined, [...keys, String(index)]) ?? null)
  const record = parseConfigObject(value)
  if (!record) return value
  return preserveObject(record, parseConfigObject(current), keys)
}

function preserveObject(nextRecord: TConfigJsonObject, currentRecord: TConfigJsonObject | undefined, keys: readonly string[]): TConfigJsonObject {
  return Object.fromEntries(Object.entries(nextRecord).flatMap(([key, entry]) => {
    const value = entry === undefined ? undefined : preserveValue(entry, currentRecord?.[key], [...keys, key])
    return value === undefined ? [] : [[key, value]]
  }))
}

export function preserveConfigSecrets<TNext, TCurrent>(next: TNext, current: TCurrent): TConfigJsonObject {
  return preserveObject(parseConfigObject(next) ?? {}, parseConfigObject(current), [])
}
