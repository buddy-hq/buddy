import "../happydom"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { GroupedBenchPresentToolCard } from "../src/components/chat/tools/render/bench-present"
import type { MessagePart } from "../src/state/chat-types"

const DIRECTORY = "/notebook"
const SESSION_ID = "session-1"
const MESSAGE_ID = "message-1"

let root: Root | undefined
let host: HTMLElement | undefined

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
})

afterAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
})

afterEach(() => {
  if (root) act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
})

function presentPart(input: {
  id: string
  metadata: Record<string, unknown>
}): MessagePart {
  return {
    id: input.id,
    type: "tool",
    sessionID: SESSION_ID,
    messageID: MESSAGE_ID,
    callID: input.id,
    tool: "bench_present",
    state: {
      status: "completed",
      input: { action: "present_object" },
      metadata: input.metadata,
      output: "presented",
      title: "Bench Presentation",
      time: { start: 0, end: 1 },
    },
  } as unknown as MessagePart
}

function objectMetadata(objectID: string, title: string) {
  return {
    benchAction: "present_object",
    benchStatus: "presented",
    reason: "presented_object",
    benchTarget: {
      type: "object",
      ref: { kind: "mermaid", objectID, revisionID: null, itemID: null },
      viewID: "rendered",
    },
    buddyObjectResult: {
      version: 1,
      status: "ok",
      reason: null,
      message: "presented",
      primaryRef: { kind: "mermaid", objectID, revisionID: null, itemID: null },
      objects: [
        {
          kind: "mermaid",
          objectID,
          title,
          status: "ready",
          lifecycle: "revisioned",
          sourceRoot: null,
        },
      ],
      presentations: [],
    },
  }
}

function render(node: React.ReactNode) {
  host = document.createElement("div")
  document.body.append(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(host)
  act(() => {
    root?.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
  })
  return host
}

function rowsIn(container: HTMLElement) {
  return [...container.querySelectorAll("[data-component='object-row']")]
}

describe("bench present receipt", () => {
  test("names the presented object and renders it as an md receipt row", () => {
    const container = render(
      <GroupedBenchPresentToolCard
        directory={DIRECTORY}
        parts={[presentPart({ id: "part-1", metadata: objectMetadata("obj-1", "Cell cycle") })]}
      />,
    )
    const rows = rowsIn(container)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.getAttribute("data-variant")).toBe("md")
    expect(rows[0]?.getAttribute("data-kind")).toBe("mermaid")
    expect(rows[0]?.textContent).toContain("Cell cycle")
  })

  test("a repeat of the same target within a band leaves one receipt", () => {
    const container = render(
      <GroupedBenchPresentToolCard
        directory={DIRECTORY}
        parts={[
          presentPart({ id: "part-1", metadata: objectMetadata("obj-1", "Cell cycle") }),
          presentPart({ id: "part-2", metadata: objectMetadata("obj-2", "Mitosis") }),
          presentPart({ id: "part-3", metadata: objectMetadata("obj-1", "Cell cycle") }),
        ]}
      />,
    )
    const rows = rowsIn(container)

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.textContent?.includes("Cell cycle"))).toEqual([true, false])
  })

  test("a workspace file is named by its file name when no object summary exists", () => {
    const container = render(
      <GroupedBenchPresentToolCard
        directory={DIRECTORY}
        parts={[
          presentPart({
            id: "part-1",
            metadata: {
              benchAction: "present_file",
              benchStatus: "presented",
              reason: "presented_file",
              benchTarget: {
                type: "workspace-file",
                path: "notes/week-3/photosynthesis.md",
                viewer: "markdown",
              },
            },
          }),
        ]}
      />,
    )
    const rows = rowsIn(container)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.getAttribute("data-kind")).toBe("workspace-file")
    expect(rows[0]?.textContent).toContain("photosynthesis.md")
  })

  test("a part with no resolved target renders nothing", () => {
    const container = render(
      <GroupedBenchPresentToolCard
        directory={DIRECTORY}
        parts={[
          presentPart({
            id: "part-1",
            metadata: { benchAction: "close", benchStatus: "closed", reason: "closed_by_request" },
          }),
        ]}
      />,
    )

    expect(rowsIn(container)).toHaveLength(0)
  })

  test("does not render an error target as a ready receipt", () => {
    const container = render(
      <GroupedBenchPresentToolCard
        directory={DIRECTORY}
        parts={[
          presentPart({
            id: "part-1",
            metadata: {
              benchAction: "present_file",
              benchStatus: "error",
              reason: "surface_error",
              benchTarget: {
                type: "workspace-file",
                path: "broken.mdx",
                viewer: "markdown",
              },
            },
          }),
        ]}
      />,
    )

    expect(rowsIn(container)).toHaveLength(0)
  })
})
