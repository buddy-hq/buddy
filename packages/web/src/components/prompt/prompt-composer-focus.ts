import { parseTNumber } from "@/components/chat/tools/types"

const PROMPT_COMPOSER_FOCUS_EVENT = "buddy:prompt-composer-focus"

const pendingFocusRequestsByDirectory = new Map<string, number>()

function nextFocusRequestID(directory: string) {
  const nextID = (pendingFocusRequestsByDirectory.get(directory) ?? 0) + 1
  pendingFocusRequestsByDirectory.set(directory, nextID)
  return nextID
}

export function requestPromptComposerFocus(directory: string) {
  const requestID = nextFocusRequestID(directory)
  window.dispatchEvent(
    new CustomEvent(PROMPT_COMPOSER_FOCUS_EVENT, {
      detail: { directory, requestID },
    }),
  )
}

export function consumePromptComposerFocusRequest(
  directory: string,
  lastConsumedRequestID: number,
) {
  const requestID = pendingFocusRequestsByDirectory.get(directory) ?? 0
  if (requestID <= lastConsumedRequestID) return undefined
  return requestID
}

export function subscribePromptComposerFocusRequests(
  directory: string,
  onRequest: (requestID: number) => void,
) {
  function handleFocusRequest(event: Event) {
    if (!(event instanceof CustomEvent)) return
    if (event.detail?.directory !== directory) return
    const requestID = event.detail?.requestID
    if (parseTNumber(requestID) === undefined) return
    onRequest(requestID)
  }

  window.addEventListener(PROMPT_COMPOSER_FOCUS_EVENT, handleFocusRequest)
  return () => window.removeEventListener(PROMPT_COMPOSER_FOCUS_EVENT, handleFocusRequest)
}
