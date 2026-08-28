import { parseTJsonText, parseTJsonValue, type TJsonValue } from "./parse"

export type { TJsonObject, TJsonPrimitive, TJsonValue } from "./parse"

export type TParsedJsonText =
  | {
      ok: true
      value: TJsonValue | undefined
    }
  | {
      ok: false
    }

export function isJsonContentType(value: string | null | undefined): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized.includes("application/json") || normalized.includes("+json")
}

export function safeJsonParse(text: string): TJsonValue | undefined {
  return parseTJsonText(text)
}

export async function safeReadJson(
  response: Response,
  input?: { clone?: boolean },
): Promise<TJsonValue | undefined> {
  try {
    const source = input?.clone || response.bodyUsed ? response.clone() : response
    return await source
      .json()
      .then(parseTJsonValue)
      .catch(() => undefined)
  } catch {
    return undefined
  }
}

export function parseJsonText(text: string): TParsedJsonText {
  const parsed = safeJsonParse(text)
  if (parsed === undefined && text.trim().length > 0) {
    return { ok: false }
  }
  return { ok: true, value: parsed }
}
