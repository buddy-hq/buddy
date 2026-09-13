import { parseTJsonObject, parseTString } from "../shared/parse-external"

export type TRendererStoreSnapshot = {
  valuesByKey: Record<string, string>
}

export function parseRendererStoreRecord<TValue>(value: TValue): TRendererStoreSnapshot {
  const source = parseTJsonObject(value)
  const valuesByKey: Record<string, string> = {}
  if (!source) return { valuesByKey }
  for (const [key, candidate] of Object.entries(source)) {
    const stored = parseTString(candidate)
    if (stored !== undefined) valuesByKey[key] = stored
  }
  return { valuesByKey }
}

export function readRendererStoreValue(
  snapshot: TRendererStoreSnapshot,
  key: string,
): string | undefined {
  return snapshot.valuesByKey[key]
}

export function setRendererStoreValue(
  snapshot: TRendererStoreSnapshot,
  key: string,
  value: string,
): TRendererStoreSnapshot {
  return { valuesByKey: { ...snapshot.valuesByKey, [key]: value } }
}

export function deleteRendererStoreValue(
  snapshot: TRendererStoreSnapshot,
  key: string,
): TRendererStoreSnapshot {
  const next = { ...snapshot.valuesByKey }
  delete next[key]
  return { valuesByKey: next }
}

export function listRendererStoreKeys(snapshot: TRendererStoreSnapshot): string[] {
  return Object.keys(snapshot.valuesByKey)
}
