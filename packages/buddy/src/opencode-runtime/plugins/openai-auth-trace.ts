import fs from "node:fs/promises"
import path from "node:path"
import { BUDDY_ENV } from "../../storage/constants"

type OpenAIAuthTraceValue = boolean | number | string | undefined
type OpenAIAuthTraceDetails = Record<string, OpenAIAuthTraceValue>

let pendingWrite = Promise.resolve()

export function getOpenAIAuthTraceFile() {
  const configured = process.env[BUDDY_ENV.OPENAI_AUTH_TRACE_FILE]?.trim()
  return configured && configured !== "undefined" ? path.resolve(configured) : undefined
}

export async function traceOpenAIAuth(
  event: string,
  details: OpenAIAuthTraceDetails = {},
): Promise<void> {
  const traceFile = getOpenAIAuthTraceFile()
  if (!traceFile) return

  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details,
  })
  pendingWrite = pendingWrite.then(async () => {
    await fs.mkdir(path.dirname(traceFile), { recursive: true })
    await fs.appendFile(traceFile, `${entry}\n`, "utf8")
  })

  try {
    await pendingWrite
  } catch (error) {
    pendingWrite = Promise.resolve()
    console.warn(
      "Could not write the redacted OpenAI auth trace",
      error instanceof Error ? error.message : String(error),
    )
  }
}
