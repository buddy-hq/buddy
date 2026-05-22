const WILDCARD_PATTERN = "*" as const
const GLOB_SPECIAL_CHARS = /[.+^${}()|[\]\\]/gu

function escapeGlobLiteral(value: string) {
  return value.replace(GLOB_SPECIAL_CHARS, "\\$&")
}

function wildcardMatch(pattern: string, value: string) {
  if (pattern === WILDCARD_PATTERN) return true
  if (!pattern.includes(WILDCARD_PATTERN)) return pattern === value
  const regex = new RegExp(
    `^${pattern
      .split(WILDCARD_PATTERN)
      .map((segment) => escapeGlobLiteral(segment))
      .join(".*")}$`,
    "u",
  )
  return regex.test(value)
}

export { wildcardMatch }
