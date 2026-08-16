/// <reference lib="webworker" />

import type { IndigoWorkerRenderFailure, IndigoWorkerRenderResponse } from "./worker-protocol"
import {
  indigoErrorCode,
  indigoErrorMessage,
  parseIndigoWorkerMessage,
  renderWithIndigo,
} from "./indigo-runtime"

self.addEventListener("message", (event: MessageEvent) => {
  const request = parseIndigoWorkerMessage(event)
  if (!request) {
    return
  }
  void renderWithIndigo(request)
    .then((response) => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- DedicatedWorkerGlobalScope.postMessage has no target-origin parameter.
      self.postMessage(response satisfies IndigoWorkerRenderResponse)
    })
    .catch((error) => {
      const failure =
        error instanceof Error
          ? error
          : new Error("Indigo could not render this chemistry source.")
      const response: IndigoWorkerRenderFailure = {
        type: "error",
        requestID: request.requestID,
        code: indigoErrorCode(failure),
        message: indigoErrorMessage(failure),
      }
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- DedicatedWorkerGlobalScope.postMessage has no target-origin parameter.
      self.postMessage(response satisfies IndigoWorkerRenderResponse)
    })
})
