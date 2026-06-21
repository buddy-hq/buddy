import { benchClientActionBroker } from "./client-actions"
import type { BenchTarget } from "./context"

type DispatchBestEffortBenchPresentInput = {
  directory: string
  sessionID: string
  messageID: string
  callID: string | null
  target: BenchTarget
}

function dispatchBestEffortBenchPresent(input: DispatchBestEffortBenchPresentInput): void {
  benchClientActionBroker.enqueueBestEffortAction({
    directory: input.directory,
    sessionID: input.sessionID,
    messageID: input.messageID,
    callID: input.callID,
    command: {
      type: "present",
      target: input.target,
    },
  })
}

export { dispatchBestEffortBenchPresent }
export type { DispatchBestEffortBenchPresentInput }
