import z from "zod"
import { parseMemoryObject } from "./structured-output"
import { ulid } from "ulid"
import { INTERNAL_LEARNER_MEMORY_SESSION_PREFIX } from "./internal-session"
import { getAgentRuntime } from "../../../runtime/agent-runtime"
import type { LearnerMemoryModel } from "./models"

export async function generateMemoryObject<T>(input: {
  directory: string
  model: LearnerMemoryModel
  system: string
  prompt: string
  schema: z.ZodType<T>
  jsonSchema: object
  retries: number
  timeoutMs: number
}): Promise<T> {
  const runtime = await getAgentRuntime()
  const signal = AbortSignal.timeout(input.timeoutMs)
  const session = await runtime.conversations.create(input.directory, {
    id: `${INTERNAL_LEARNER_MEMORY_SESSION_PREFIX}${ulid()}`,
    title: "Learner memory extraction",
    model: { providerID: input.model.providerID, modelID: input.model.modelID },
    permissions: [{ permission: "*", pattern: "*", action: "deny" }],
    signal,
  })
  try {
    let correction = ""
    for (let attempt = 0; attempt <= input.retries; attempt += 1) {
      const text = await runtime.execution.generate({
        sessionID: session.id,
        prompt: [
          input.system,
          input.prompt,
          "Return only a JSON object matching this schema:",
          JSON.stringify(input.jsonSchema),
          correction,
        ].join("\n\n"),
        signal,
      })
      const parsed = parseMemoryObject(text, input.schema)
      if (parsed.success) return parsed.data
      if (attempt === input.retries) throw parsed.error
      correction = "The previous response was not valid JSON matching the schema. Return a complete JSON object with all required fields."
    }
    throw new Error("Memory generation did not produce a response")
  } finally {
    await runtime.conversations.remove(session.id)
  }
}
