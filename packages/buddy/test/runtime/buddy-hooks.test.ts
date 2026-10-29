import { expect, test } from "bun:test"
import type { SessionAccess } from "@buddy/agent-runtime/extension"
import { createBuddyHooks } from "../../src/runtime/buddy-hooks"
import { temporaryDirectory } from "../helpers/temporary-directory"

function unexpectedSessionAccess(): never {
  throw new Error("Unexpected session access")
}

const sessions: SessionAccess = {
  get: unexpectedSessionAccess,
  patchMetadata: unexpectedSessionAccess,
  setRules: unexpectedSessionAccess,
  agentRules: unexpectedSessionAccess,
  toolPermissions: unexpectedSessionAccess,
}

test.each([
  { unavailable: true, tools: ["imagegen", "read"], hiddenTools: ["imagegen"], calls: 1 },
  { unavailable: false, tools: ["imagegen", "read"], hiddenTools: undefined, calls: 1 },
  { unavailable: true, tools: ["read"], hiddenTools: undefined, calls: 0 },
])(
  "image tool visibility with unavailable=$unavailable and tools=$tools",
  async ({ unavailable, tools, hiddenTools, calls }) => {
    await using directory = await temporaryDirectory({ prefix: "buddy-image-plan-hooks-" })
    let gateCalls = 0
    const hooks = createBuddyHooks({ directory: directory.path }, sessions, {
      imageGenerationUnavailable: async () => {
        gateCalls += 1
        return unavailable
      },
    })
    const update = await hooks.context({
      sessionID: "ses_image_plan",
      agent: "fixture",
      system: [],
      tools,
    })
    expect(update.hiddenTools).toEqual(hiddenTools)
    if (hiddenTools === undefined) expect(update).not.toHaveProperty("hiddenTools")
    expect(gateCalls).toBe(calls)
  },
)
