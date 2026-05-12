import { Effect } from "effect"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionPrompt } from "@buddy/opencode-adapter/session-prompt"
import { isPersonaDelegateId } from "../learning/shared/teaching-vocabulary"

let registered = false

export async function ensureSessionPromptToolForwardingPatched() {
  if (registered) {
    return
  }
  registered = true

  SessionPrompt.registerPromptInputInterceptor(async ({ promptInput, run }) => {
    if (typeof promptInput.agent !== "string" || !isPersonaDelegateId(promptInput.agent)) {
      return run(promptInput)
    }

    const { withSubagentToolForwarding } = await import("./subagent-tool-forwarding-runtime")
    const delegatedPromptInput = {
      ...promptInput,
      agent: promptInput.agent,
    }
    return Effect.runPromise(
      withSubagentToolForwarding({
        directory: OpenCodeInstance.directory,
        promptInput: delegatedPromptInput,
        run: (nextInput) => Effect.promise(() => run(nextInput)),
      }),
    )
  })
}
