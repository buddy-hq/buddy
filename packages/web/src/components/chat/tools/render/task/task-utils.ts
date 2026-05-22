const FLASHCARD_AUTHOR_SUBAGENT = "flashcard-author" as const
const QUESTION_SET_AUTHOR_SUBAGENT = "question-set-author" as const
const TASK_RESULT_OPEN_TAG = "<task_result>" as const
const TASK_RESULT_CLOSE_TAG = "</task_result>" as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

export function readTaskAgent(input: Record<string, unknown>, metadata: Record<string, unknown>) {
  return readString(metadata.agent) ?? readString(input.agent) ?? readString(input.subagent_type)
}

export function readTaskDescription(
  input: Record<string, unknown>,
  metadata: Record<string, unknown>,
) {
  return (
    readString(metadata.description) ??
    readString(input.description) ??
    readString(input.task) ??
    readString(input.prompt)
  )
}

export function readTaskSessionId(metadata: Record<string, unknown>) {
  const sessionId = readString(metadata.sessionId)
  if (sessionId) return sessionId
  const nested = isRecord(metadata.task) ? metadata.task : undefined
  return readString(nested?.sessionId)
}

export function parseTaskResultOutput(output: string): string {
  const start = output.indexOf(TASK_RESULT_OPEN_TAG)
  const end = output.indexOf(TASK_RESULT_CLOSE_TAG)

  if (start === -1 || end === -1 || end <= start) {
    return output.trim()
  }

  return output.slice(start + TASK_RESULT_OPEN_TAG.length, end).trim()
}

export {
  FLASHCARD_AUTHOR_SUBAGENT,
  QUESTION_SET_AUTHOR_SUBAGENT,
  TASK_RESULT_CLOSE_TAG,
  TASK_RESULT_OPEN_TAG,
}
