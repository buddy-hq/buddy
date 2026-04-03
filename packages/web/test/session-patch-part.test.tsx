import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"
import { seedDirectoryChatState } from "./test-utils"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function assistantMessage(parts: MessagePart[]): MessageWithParts {
  return {
    info: {
      id: "msg_assistant",
      sessionID: "ses_patch",
      role: "assistant",
      parentID: "msg_user",
      providerID: "test",
      modelID: "test-model",
      mode: "buddy",
      agent: "buddy",
      path: {
        cwd: "/repo",
        root: "/",
      },
      time: {
        created: 2,
        completed: 3,
      },
      tokens: {
        total: 0,
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
      cost: 0,
    },
    parts,
  }
}

function userMessage(text: string): MessageWithParts {
  return {
    info: {
      id: "msg_user",
      sessionID: "ses_patch",
      role: "user",
      agent: "buddy",
      model: {
        providerID: "test",
        modelID: "test-model",
      },
      time: {
        created: 1,
      },
    },
    parts: [
      {
        id: "prt_user",
        sessionID: "ses_patch",
        messageID: "msg_user",
        type: "text",
        text,
      },
    ],
  }
}

describe("session patch parts", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("hides patch parts with visible workspace file changes", async () => {
    const messages: MessageWithParts[] = [
      userMessage("show me the patch"),
      assistantMessage([
        {
          id: "prt_patch",
          sessionID: "ses_patch",
          messageID: "msg_assistant",
          type: "patch",
          hash: "d7d370ce31526dd5cb81d718da2f360b93ea3cc",
          files: ["/repo/src/app.ts", "/repo/src/utils/math.ts"],
        },
      ]),
    ]

    await act(async () => {
      seedDirectoryChatState("/repo", { messages })
      root.render(<ChatTranscript directory="/repo" />)
      await flushEffects()
    })

    expect(container.querySelector('[data-component="session-patch-part"]')).toBeNull()
    expect(container.textContent).not.toContain('"type": "patch"')
  })

  test("hides patch summaries that only contain Buddy internal artifact writes", async () => {
    const messages: MessageWithParts[] = [
      userMessage("render a diagram"),
      assistantMessage([
        {
          id: "prt_patch",
          sessionID: "ses_patch",
          messageID: "msg_assistant",
          type: "patch",
          hash: "d7d370ce31526dd5cb81d718da2f360b93ea3cc",
          files: [
            "/repo/.buddy/mermaid-artifacts/abc123/diagram.mmd",
            "/repo/.buddy/mermaid-artifacts/abc123/manifest.json",
          ],
        },
      ]),
    ]

    await act(async () => {
      seedDirectoryChatState("/repo", { messages })
      root.render(<ChatTranscript directory="/repo" />)
      await flushEffects()
    })

    expect(container.querySelector('[data-component="session-patch-part"]')).toBeNull()
    expect(container.textContent).not.toContain("mermaid-artifacts")
    expect(container.textContent).not.toContain('"type": "patch"')
  })
})
