import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ToolPartCard } from "../src/components/chat/parts/assistant-part/tool-part"
import { renderIngestFullTextTool } from "../src/components/chat/tools/render/ingest-full-text"
import type { ToolPartProps } from "../src/components/chat/tools/registry"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function createIngestFullTextProps(): ToolPartProps {
  return {
    part: {
      id: "prt_full_text",
      sessionID: "ses_full_text",
      messageID: "msg_full_text",
      type: "tool",
    },
    state: {
      status: "completed",
      input: {
        resource: "guns-of-august",
      },
      metadata: {
        resource: "guns-of-august",
        fullTextEstTokens: 308341,
        truncated: true,
        outputPath: "/tmp/tool-output",
      },
      attachments: [],
      output: "<resource_full_text_ingestion>preview</resource_full_text_ingestion>",
    },
    info: {
      title: "Full text",
    },
    tool: "ingest_full_text",
  }
}

describe("ingest_full_text tool rendering", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
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
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("shows truncation details instead of claiming the full source entered context", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          {renderIngestFullTextTool(createIngestFullTextProps())}
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Read Full Text: ~246,673 words")
    expect(container.textContent).toContain("guns-of-august")
    expect(container.textContent).not.toContain("tokens loaded")
    expect(container.textContent).toContain(
      "The plugin runtime truncated this full-text output. The full text did not all enter the live chat context.",
    )
    expect(container.textContent).toContain("/tmp/tool-output")
  })

  test("keeps ingest_full_text backend error details visible through ToolPartCard", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ToolPartCard
            part={{
              id: "prt_full_text_error",
              sessionID: "ses_full_text",
              messageID: "msg_full_text",
              callID: "call_full_text_error",
              type: "tool",
              tool: "ingest_full_text",
              state: {
                status: "error",
                input: {
                  resource: "guns-of-august",
                },
                error:
                  'Cannot ingest full text for resource "guns-of-august" because the live session context is too full.\nUse scoped reading instead of full-text ingestion in this session.',
                time: { start: 1, end: 2 },
              },
            }}
          />
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Read Full Text")
    expect(container.textContent).toContain(
      'Cannot ingest full text for resource "guns-of-august" because the live session context is too full.',
    )
    expect(container.textContent).toContain(
      "Use scoped reading instead of full-text ingestion in this session.",
    )
  })
})
