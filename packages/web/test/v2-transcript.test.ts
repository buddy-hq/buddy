import { describe, expect, test } from "bun:test"
import { assistantPartRenderable } from "../src/components/chat/utils/message-utils"
import {
  MessageInfoEventSchema,
  MessagePartEventSchema,
} from "../src/lib/directory-chat/chat-event-schemas"
import type { AssistantMessageInfo, MessagePart } from "../src/state/chat-types"

describe("v2 transcript compatibility", () => {
  test("retains synthetic notice metadata and renders native compaction markers", () => {
    const info: AssistantMessageInfo = {
      id: "msg_notice",
      sessionID: "ses_notice",
      role: "assistant",
      kind: "synthetic",
      description: "Research",
      metadata: { source: "subagent", childID: "ses_child" },
      parentID: "",
      agent: "",
      mode: "",
      modelID: "",
      providerID: "",
      path: { cwd: "/repo", root: "/repo" },
      time: { created: 1, completed: 1 },
      finish: "stop",
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }
    expect(MessageInfoEventSchema.parse(info)).toEqual(info)
    const notice: MessagePart = {
      id: "prt_notice",
      sessionID: info.sessionID,
      messageID: info.id,
      type: "notice",
      source: "subagent",
      text: "Subagent completed: Research",
    }
    expect(MessagePartEventSchema.parse(notice)).toEqual(notice)
    expect(assistantPartRenderable(notice, false)).toBe(true)
    expect(
      assistantPartRenderable(
        { ...notice, type: "compaction", status: "running", auto: false },
        false,
      ),
    ).toBe(true)
    expect(
      assistantPartRenderable({ ...notice, type: "compaction", status: undefined }, false),
    ).toBe(false)
  })
})
