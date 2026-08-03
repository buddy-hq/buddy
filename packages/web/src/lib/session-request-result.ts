import { buddyResultMessage } from "@/lib/buddy-client"

const SESSION_NOT_FOUND_ERROR = "Session not found"
const HTTP_STATUS_NOT_FOUND = 404

type SessionRequestResult = {
  error: unknown
  response: Response | undefined
}

export function isSessionNotFoundResult(result: SessionRequestResult): boolean {
  return (
    result.response?.status === HTTP_STATUS_NOT_FOUND &&
    buddyResultMessage(result) === SESSION_NOT_FOUND_ERROR
  )
}
