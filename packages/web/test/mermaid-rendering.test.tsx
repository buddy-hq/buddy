import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatTranscript } from "../src/components/chat/chat-transcript"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"

const ARTIFACT_ID = "a".repeat(64)

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

async function waitForAssertion(assertion: () => void, timeoutMs = 1500) {
  const start = Date.now()
  while (true) {
    try {
      assertion()
      return
    } catch (error) {
      if (Date.now() - start >= timeoutMs) {
        throw error
      }
      await flushEffects(20)
    }
  }
}

function readMermaidZoomLabel() {
  return document.querySelector('[aria-label="Mermaid zoom level"]')?.textContent ?? ""
}

function assistantMessage(parts: MessagePart[]): MessageWithParts {
  return {
    info: {
      id: "msg_assistant",
      sessionID: "ses_mermaid",
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
      sessionID: "ses_mermaid",
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
        sessionID: "ses_mermaid",
        messageID: "msg_user",
        type: "text",
        text,
      },
    ],
  }
}

function mermaidToolPart(input: {
  source?: string
  artifactID?: string
  alt?: string
  caption?: string
  partID?: string
}): MessagePart {
  return {
    id: input.partID ?? "prt_tool_mermaid",
    sessionID: "ses_mermaid",
    messageID: "msg_assistant",
    type: "tool",
    tool: "render_mermaid",
    callID: "call_mermaid",
    state: {
      status: "completed",
      input: {
        kind: "mermaid.v1",
        alt: input.alt ?? "Mermaid diagram",
      },
      output: "",
      metadata: {
        artifact: "RenderMermaidOutput",
        value: {
          artifactID: input.artifactID ?? ARTIFACT_ID,
          artifactUrl: `/api/mermaid-artifacts/${input.artifactID ?? ARTIFACT_ID}?directory=${encodeURIComponent("/repo")}`,
          ...(input.source ? { source: input.source } : {}),
          diagramType: "flowchart",
          repairAttempts: 0,
          repairLog: [],
          alt: input.alt ?? "Mermaid diagram",
          ...(input.caption ? { caption: input.caption } : {}),
        },
      },
      time: {
        start: 2,
        end: 3,
      },
    },
  }
}

describe("mermaid rendering", () => {
  let container: HTMLDivElement
  let root: Root
  let originalFetch: typeof globalThis.fetch
  let originalClipboard: Clipboard | undefined
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined
  let clipboardWrites: string[]
  let createdObjectUrls: string[]
  let revokedObjectUrls: string[]
  let createdSvgBlobs: Blob[]
  let fetchCalls: string[]
  let mermaidRenderCalls: number
  let mermaidBindCalls: number

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    fetchCalls = []
    clipboardWrites = []
    createdObjectUrls = []
    revokedObjectUrls = []
    createdSvgBlobs = []
    mermaidRenderCalls = 0
    mermaidBindCalls = 0
    originalFetch = globalThis.fetch
    originalClipboard = navigator.clipboard
    originalCreateObjectURL = URL.createObjectURL
    originalRevokeObjectURL = URL.revokeObjectURL
    const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      fetchCalls.push(url)

      if (url.includes(`/api/mermaid-artifacts/${ARTIFACT_ID}`)) {
        return new Response(
          JSON.stringify({
            artifactID: ARTIFACT_ID,
            kind: "mermaid.v1",
            diagramType: "flowchart",
            alt: "rehydrated",
            repairAttempts: 1,
            repairLog: ["pass 1: extracted Mermaid fenced block from wrapped prose."],
            source: "flowchart TD\nA --> B",
            createdAt: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      return new Response("not found", { status: 404 })
    }
    globalThis.fetch = mockFetch

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          clipboardWrites.push(value)
        },
      } satisfies Pick<Clipboard, "writeText">,
    })

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        createdSvgBlobs.push(blob)
        const objectUrl = `blob:mermaid-test-${createdSvgBlobs.length}`
        createdObjectUrls.push(objectUrl)
        return objectUrl
      },
    })

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: (objectUrl: string) => {
        revokedObjectUrls.push(objectUrl)
      },
    })

    globalThis.__BUDDY_TEST_MERMAID_RUNTIME__ = {
      initialize() {},
      async render(_id: string, source: string) {
        mermaidRenderCalls += 1
        if (source.includes("BROKEN_GRAPH")) {
          throw new Error("mock mermaid parse error")
        }
        return {
          svg: `<svg data-mermaid="true" xmlns="http://www.w3.org/2000/svg"><text>${source.length}</text></svg>`,
          bindFunctions() {
            mermaidBindCalls += 1
          },
        }
      },
    }
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()

    globalThis.fetch = originalFetch
    globalThis.__BUDDY_TEST_MERMAID_RUNTIME__ = undefined
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    })
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("renders completed render_mermaid tool output directly from stored source metadata", async () => {
    const messages: MessageWithParts[] = [
      userMessage("draw this"),
      assistantMessage([
        mermaidToolPart({
          artifactID: ARTIFACT_ID,
          source: "flowchart TD\nA --> B",
        }),
      ]),
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} directory="/repo" />)
      await flushEffects(10)
    })

    expect(container.querySelector('[data-component="mermaid-diagram"] svg')).not.toBeNull()
    expect(fetchCalls.some((url) => url.includes(`/api/mermaid-artifacts/${ARTIFACT_ID}`))).toBe(
      false,
    )
  })

  test("shows Mermaid copy and download actions on the rendered diagram", async () => {
    const source = "flowchart TD\nA --> B"
    const messages: MessageWithParts[] = [
      userMessage("draw this"),
      assistantMessage([
        mermaidToolPart({
          artifactID: ARTIFACT_ID,
          source,
        }),
      ]),
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} directory="/repo" />)
      await flushEffects(20)
    })

    await waitForAssertion(() => {
      expect(container.querySelector('[data-component="mermaid-diagram"] svg')).not.toBeNull()
    })

    const copyButton = container.querySelector('[aria-label="Copy Mermaid"]')
    const downloadButton = container.querySelector('[aria-label="Download SVG"]')
    expect(copyButton).not.toBeNull()
    expect(downloadButton).not.toBeNull()

    await act(async () => {
      ;(copyButton as HTMLButtonElement).click()
      await flushEffects()
    })

    expect(clipboardWrites).toEqual([source])

    await act(async () => {
      ;(downloadButton as HTMLButtonElement).click()
      await flushEffects()
    })

    expect(createdObjectUrls).toEqual(["blob:mermaid-test-1"])
    expect(revokedObjectUrls).toEqual(["blob:mermaid-test-1"])
    expect(createdSvgBlobs).toHaveLength(1)
    expect(await createdSvgBlobs[0].text()).toContain("<svg")
  })

  test("opens Mermaid fullscreen with zoom controls and a scrollable canvas", async () => {
    const source = "flowchart TD\nA --> B"
    const messages: MessageWithParts[] = [
      userMessage("open fullscreen"),
      assistantMessage([
        mermaidToolPart({
          artifactID: ARTIFACT_ID,
          source,
        }),
      ]),
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} directory="/repo" />)
      await flushEffects(20)
    })

    await waitForAssertion(() => {
      expect(container.querySelector('[aria-label="Open Mermaid fullscreen"]')).not.toBeNull()
    })

    await act(async () => {
      ;(
        container.querySelector('[aria-label="Open Mermaid fullscreen"]') as HTMLButtonElement
      ).click()
      await flushEffects(20)
    })

    await waitForAssertion(() => {
      expect(
        document.querySelector('[data-component="mermaid-diagram-fullscreen"] svg'),
      ).not.toBeNull()
      expect(readMermaidZoomLabel()).toContain("%")
    })

    const initialZoom = readMermaidZoomLabel()

    await act(async () => {
      ;(document.querySelector('[aria-label="Zoom in Mermaid"]') as HTMLButtonElement).click()
      await flushEffects()
    })

    const afterZoom = readMermaidZoomLabel()
    expect(afterZoom).toContain("%")
    expect(afterZoom).not.toBe(initialZoom)
    expect(
      (document.querySelector('[data-component="mermaid-diagram-fullscreen"]') as HTMLElement)
        ?.style.width,
    ).not.toBe("")
  })

  test("normalizes Mermaid foreignObject line breaks before downloading SVG", async () => {
    const originalRuntime = globalThis.__BUDDY_TEST_MERMAID_RUNTIME__
    globalThis.__BUDDY_TEST_MERMAID_RUNTIME__ = {
      initialize() {},
      async render() {
        return {
          svg: [
            '<svg xmlns="http://www.w3.org/2000/svg">',
            '<foreignObject width="100" height="40">',
            '<div xmlns="http://www.w3.org/1999/xhtml"><p>Cooldown<br>2 weeks</p></div>',
            "</foreignObject>",
            "</svg>",
          ].join(""),
        }
      },
    }

    const messages: MessageWithParts[] = [
      userMessage("draw this"),
      assistantMessage([
        mermaidToolPart({
          artifactID: ARTIFACT_ID,
          source: "flowchart TD\nA[Cooldown<br>2 weeks]",
        }),
      ]),
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} directory="/repo" />)
      await flushEffects(20)
    })

    await waitForAssertion(() => {
      expect(container.querySelector('[aria-label="Download SVG"]')).not.toBeNull()
    })

    await act(async () => {
      ;(container.querySelector('[aria-label="Download SVG"]') as HTMLButtonElement).click()
      await flushEffects()
    })

    expect(createdSvgBlobs).toHaveLength(1)
    const downloadedSvg = await createdSvgBlobs[0].text()
    expect(downloadedSvg).toContain("<br />")
    expect(downloadedSvg).not.toContain("<br>2 weeks")

    globalThis.__BUDDY_TEST_MERMAID_RUNTIME__ = originalRuntime
  })

  test("rehydrates render_mermaid tool output through the generated SDK when source is compacted", async () => {
    const messages: MessageWithParts[] = [
      userMessage("draw this"),
      assistantMessage([
        mermaidToolPart({
          artifactID: ARTIFACT_ID,
        }),
      ]),
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} directory="/repo" />)
      await flushEffects(20)
    })

    expect(fetchCalls.some((url) => url.includes(`/api/mermaid-artifacts/${ARTIFACT_ID}`))).toBe(
      true,
    )
    expect(container.querySelector('[data-component="mermaid-diagram"] svg')).not.toBeNull()
  })

  test("renders fenced mermaid blocks inline inside assistant markdown", async () => {
    const messages: MessageWithParts[] = [
      userMessage("show inline"),
      assistantMessage([
        {
          id: "prt_text_inline_mermaid",
          sessionID: "ses_mermaid",
          messageID: "msg_assistant",
          type: "text",
          text: ["A quick flow:", "```mermaid", "flowchart TD", "A --> B", "```"].join("\n"),
        },
      ]),
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} directory="/repo" />)
      await flushEffects(20)
    })

    const inlineMermaid = container.querySelector('[data-buddy-mermaid-enhanced="true"] svg')
    expect(inlineMermaid).not.toBeNull()
  })

  test("renders fenced mermaid blocks inline when the markdown uses CRLF line endings", async () => {
    const messages: MessageWithParts[] = [
      userMessage("show inline"),
      assistantMessage([
        {
          id: "prt_text_inline_mermaid_crlf",
          sessionID: "ses_mermaid",
          messageID: "msg_assistant",
          type: "text",
          text: ["A quick flow:", "```mermaid", "flowchart TD", "A --> B", "```"].join("\r\n"),
        },
      ]),
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} directory="/repo" />)
      await flushEffects(20)
    })

    expect(container.querySelector('[data-buddy-mermaid-enhanced="true"] svg')).not.toBeNull()
  })

  test("keeps Mermaid examples literal when they are inside an outer fenced code block", async () => {
    const messages: MessageWithParts[] = [
      userMessage("show the source"),
      assistantMessage([
        {
          id: "prt_text_nested_mermaid_example",
          sessionID: "ses_mermaid",
          messageID: "msg_assistant",
          type: "text",
          text: ["````markdown", "```mermaid", "flowchart TD", "A --> B", "```", "````"].join("\n"),
        },
      ]),
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} directory="/repo" />)
      await flushEffects(20)
    })

    await waitForAssertion(() => {
      const nestedExample = container.querySelector('[data-component="markdown-code"] code')
      expect(container.querySelector('[data-buddy-mermaid-enhanced="true"]')).toBeNull()
      expect(nestedExample).not.toBeNull()
      expect(nestedExample?.textContent ?? "").toContain("```mermaid")
    })
  })

  test("shows markdown Mermaid fallback panel plus raw source when rendering fails", async () => {
    const messages: MessageWithParts[] = [
      userMessage("broken inline"),
      assistantMessage([
        {
          id: "prt_text_broken_mermaid",
          sessionID: "ses_mermaid",
          messageID: "msg_assistant",
          type: "text",
          text: ["```mermaid", "BROKEN_GRAPH", "```"].join("\n"),
        },
      ]),
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} directory="/repo" />)
      await flushEffects(20)
    })

    expect(container.textContent).toContain("Unable to render Mermaid diagram:")
    expect(container.textContent).toContain("Showing raw Mermaid source instead.")
    expect(container.textContent).toContain("BROKEN_GRAPH")
  })

  test("dedupes identical fenced mermaid markdown after a successful render_mermaid tool result", async () => {
    const source = "flowchart TD\nA --> B"
    const messages: MessageWithParts[] = [
      userMessage("avoid duplicate"),
      assistantMessage([
        mermaidToolPart({
          artifactID: ARTIFACT_ID,
          source,
        }),
        {
          id: "prt_text_duplicate_mermaid",
          sessionID: "ses_mermaid",
          messageID: "msg_assistant",
          type: "text",
          text: ["```mermaid", source, "```"].join("\n"),
        },
      ]),
    ]

    await act(async () => {
      root.render(<ChatTranscript messages={messages} directory="/repo" />)
      await flushEffects(20)
    })

    expect(container.querySelectorAll('[data-component="mermaid-diagram"]').length).toBe(1)
    expect(container.querySelectorAll('[data-buddy-mermaid-enhanced="true"]').length).toBe(0)
  })

  test("keeps Mermaid interactivity bindings when tool output is served from SVG cache", async () => {
    const source = "flowchart TD\nCacheA --> CacheB"
    const cacheArtifactID = "b".repeat(64)

    await act(async () => {
      root.render(
        <ChatTranscript
          messages={[
            userMessage("first render"),
            assistantMessage([
              mermaidToolPart({
                artifactID: cacheArtifactID,
                source,
                partID: "prt_tool_mermaid_first",
              }),
            ]),
          ]}
          directory="/repo"
        />,
      )
      await flushEffects(20)
    })

    await act(async () => {
      root.render(
        <ChatTranscript
          messages={[
            userMessage("second render"),
            assistantMessage([
              mermaidToolPart({
                artifactID: cacheArtifactID,
                source,
                partID: "prt_tool_mermaid_second",
              }),
            ]),
          ]}
          directory="/repo"
        />,
      )
      await flushEffects(20)
    })

    expect(mermaidRenderCalls).toBe(1)
    expect(mermaidBindCalls).toBe(2)
  })
})
