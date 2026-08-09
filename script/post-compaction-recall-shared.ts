import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

export function parseJson(value: string): unknown {
  const parsed: unknown = JSON.parse(value)
  return parsed
}

export function normalizeText(value: string): string {
  return value.replaceAll("\r\n", "\n").trim()
}

export function requireFlagValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

export async function consumeJsonl(
  sourcePath: string,
  addRecord: (record: unknown) => void,
): Promise<boolean> {
  const input = createReadStream(sourcePath, { encoding: "utf8" })
  const lines = createInterface({ crlfDelay: Infinity, input })
  let lineNumber = 0
  let pendingMalformedLine: number | undefined

  for await (const line of lines) {
    lineNumber += 1
    if (line.trim().length === 0) continue
    if (pendingMalformedLine !== undefined) {
      throw new Error(
        `Malformed JSONL record at line ${pendingMalformedLine} is not the trailing record`,
      )
    }

    let record: unknown
    try {
      record = parseJson(line)
    } catch {
      pendingMalformedLine = lineNumber
      continue
    }
    addRecord(record)
  }

  return pendingMalformedLine !== undefined
}
