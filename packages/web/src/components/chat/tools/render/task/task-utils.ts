export const FLASHCARD_AUTHOR_SUBAGENT = "flashcard-author" as const
export const QUESTION_SET_AUTHOR_SUBAGENT = "question-set-author" as const
export const TASK_RESULT_OPEN_TAG = "<task_result>" as const
export const TASK_RESULT_CLOSE_TAG = "</task_result>" as const

export function parseTaskResultOutput(output: string): string {
  const start = output.indexOf(TASK_RESULT_OPEN_TAG)
  const end = output.indexOf(TASK_RESULT_CLOSE_TAG)

  if (start === -1 || end === -1 || end <= start) {
    return output.trim()
  }

  return output.slice(start + TASK_RESULT_OPEN_TAG.length, end).trim()
}
