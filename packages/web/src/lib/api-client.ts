import { parseTString } from "@/components/chat/tools/types"

export function stringifyError<TError>(error: TError) {
  if (error instanceof Error) {
    return error.message
  }
  const text = parseTString(error)
  if (text !== undefined) {
    return text
  }
  try {
    return JSON.stringify(error)
  } catch {
    return `${error}`
  }
}
