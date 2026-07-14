/// <reference lib="webworker" />

import type { IndigoWorkerRenderFailure, IndigoWorkerRenderResponse } from "./worker-protocol"
import {
  indigoErrorCode,
  indigoErrorMessage,
  isIndigoRenderRequest,
  renderWithIndigo,
} from "./indigo-runtime"

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isIndigoRenderRequest(event.data)) {
    return
  }
  const request = event.data
  void renderWithIndigo(request)
    .then((response) => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- DedicatedWorkerGlobalScope.postMessage has no target-origin parameter.
      self.postMessage(response satisfies IndigoWorkerRenderResponse)
    })
    .catch((error: unknown) => {
      const response: IndigoWorkerRenderFailure = {
        type: "error",
        requestID: request.requestID,
        code: indigoErrorCode(error),
        message: indigoErrorMessage(error),
      }
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- DedicatedWorkerGlobalScope.postMessage has no target-origin parameter.
      self.postMessage(response satisfies IndigoWorkerRenderResponse)
    })
})
