import z from "zod"
import { parseMemoryObject } from "./structured-output"
import { ulid } from "ulid"
import { INTERNAL_LEARNER_MEMORY_SESSION_PREFIX } from "./internal-session"
import { getOpenCodeClient } from "../../../opencode-runtime/client"
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
  const client = await getOpenCodeClient()
  const signal = AbortSignal.timeout(input.timeoutMs)
  const session = await client.session.create({
    id: `${INTERNAL_LEARNER_MEMORY_SESSION_PREFIX}${ulid()}`,
    title: "Learner memory extraction",
    location: { directory: input.directory },
    model: { providerID: input.model.providerID, id: input.model.modelID },
    permissions: [{ action: "*", resource: "*", effect: "deny" }],
  }, { signal })
  try {
    let correction = ""
    for (let attempt = 0; attempt <= input.retries; attempt += 1) {
      const text = await client.session.generate({
        sessionID: session.id,
        prompt: [
          input.system,
          input.prompt,
          "Return only a JSON object matching this schema:",
          JSON.stringify(input.jsonSchema),
          correction,
        ].join("\n\n"),
      }, { signal })
      const parsed = parseMemoryObject(text.text, input.schema)
      if (parsed.success) return parsed.data
      if (attempt === input.retries) throw parsed.error
      correction = "The previous response was not valid JSON matching the schema. Return a complete JSON object with all required fields."
    }
    throw new Error("Memory generation did not produce a response")
  } finally {
    await client.session.remove({ sessionID: session.id })
  }
}
