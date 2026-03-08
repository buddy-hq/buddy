export function isJsonContentType(value: string | null | undefined): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized.includes("application/json") || normalized.includes("+json")
}

export function safeJsonParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export async function safeReadJson(response: Response): Promise<unknown | undefined> {
  return response
    .clone()
    .json()
    .catch(() => undefined)
}

export function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false } {
  const parsed = safeJsonParse(text)
  if (parsed === undefined && text.trim().length > 0) {
    return { ok: false }
  }
  return { ok: true, value: parsed }
}
