import { inspect } from "node:util"
import { Cause, Predicate } from "effect"

export function redactLogText(text: string): string {
  return text
    .replace(/params: [^\r\n]*/g, "params: [redacted]")
    .replace(
      /((["']?)\b(?:access|refresh|key|apiKey|api_key|token|accessToken|refreshToken|access_token|refresh_token|clientSecret|client_secret|password|authorization)\b\2\s*[:=]\s*)(["'])(?:\\[\s\S]|(?!\3)[^\\])*\3/gi,
      "$1$3[redacted]$3",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
}

export function formatOpenCodeLogDetails(entry: {
  attributes?: unknown
  cause?: unknown
}): string[] {
  return [entry.attributes, entry.cause]
    .filter((value) => value !== undefined)
    .map((value) => {
      if (Cause.isCause(value)) return Cause.pretty(value)
      if (Predicate.isString(value)) return value
      return inspect(value, { depth: 6, breakLength: Infinity })
    })
    .map(redactLogText)
}
