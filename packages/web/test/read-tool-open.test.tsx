import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createQueryTestRoot } from "./query-test-root"

import type { MessagePart } from "../src/state/chat-types"
import { activityPresentation, presentationMetadata } from "./tool-presentation-fixtures"

const openBench = mock(async () => ({ outcome: "committed" }))

mock.module("@/lib/use-open-bench", () => ({
  useOpenBench: () => openBench,
}))

const [
  { ActivityRow },
  { renderReadTool },
  { createActivityEntry },
  { BENCH_WORKSPACE_ROOT_NOTEBOOK },
] = await Promise.all([
  import("../src/components/chat/tools/activity-row"),
  import("../src/components/chat/tools/render/read"),
  import("../src/components/chat/tools/activity-row/entries"),
  import("../src/lib/bench-navigation"),
])

const directory = "/notebooks/llm"

function readSummary(filePath: string | undefined) {
  return filePath ? { kind: "read-file", subject: filePath } : { kind: "read-file" }
}

function readPart(input: {
  filePath?: string
  detail: string
  status?: "completed" | "running"
  image?: boolean
}): MessagePart {
  const metadata = presentationMetadata(
    activityPresentation({
      phase: input.status ?? "completed",
      action: input.status === "running" ? "Reading" : "Read",
      detail: input.detail,
      category: "read-files",
      summary: "Read files",
      icon: "read",
      renderer: "read",
    }),
  )
  const part = {
    id: "part_read",
    sessionID: "ses_read",
    messageID: "msg_read",
    type: "tool" as const,
    tool: "read",
    callID: "call_read",
    metadata,
  }
  if (input.status === "running") {
    return {
      ...part,
      state: {
        status: "running",
        input: {},
        metadata: {},
        time: { start: 1 },
        summary: readSummary(input.filePath),
      },
    }
  }

  return {
    ...part,
    state: {
      status: "completed",
      input: {},
      metadata: {},
      output: "contents",
      title: input.detail,
      attachments: input.image
        ? [
            {
              id: "photo",
              sessionID: "ses_read",
              messageID: "msg_read",
              type: "file" as const,
              mime: "image/png",
              url: "data:image/png;base64,aaaa",
              filename: "photo.png",
            },
          ]
        : [],
      time: { start: 1, end: 2 },
      summary: readSummary(input.filePath),
    },
  }
}

function toolEntry(part: MessagePart) {
  const entry = createActivityEntry(part)
  if (entry?.kind !== "tool") throw new Error("Expected a read activity entry")
  return entry
}

function benchTarget(path: string, viewer: "file" | "markdown") {
  return expect.objectContaining({
    directory,
    target: { type: "workspace-file", root: BENCH_WORKSPACE_ROOT_NOTEBOOK, path, viewer },
  })
}

describe("opening a file from a Read step", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    openBench.mockClear()
    container = document.createElement("div")
    document.body.append(container)
    root = createQueryTestRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  function buttonNamed(name: string) {
    return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.getAttribute("aria-label") === name,
    )
  }

  function textNode(tag: "button" | "span", text: string) {
    return Array.from(container.querySelectorAll<HTMLElement>(tag)).find(
      (element) => element.textContent === text,
    )
  }

  async function renderExpandedRow(part: MessagePart, notebookDirectory: string | undefined) {
    await act(async () =>
      root.render(
        <ActivityRow
          parts={[part]}
          seed="activity:turn:0"
          zeroEntryLabel="Thinking"
          directory={notebookDirectory}
        />,
      ),
    )
    const header = container.querySelector<HTMLButtonElement>("[data-activity-row] > button")
    await act(async () => header?.click())
  }

  async function renderCard(part: MessagePart, notebookDirectory: string | undefined) {
    const entry = toolEntry(part)
    await act(async () =>
      root.render(
        renderReadTool({
          part: entry.part,
          state: entry.state,
          info: entry.info,
          tool: "read",
          directory: notebookDirectory,
        }),
      ),
    )
  }

  test("opens a notebook file from the Read step name", async () => {
    await renderExpandedRow(
      readPart({ filePath: `${directory}/notes/tracker.md`, detail: "tracker.md" }),
      directory,
    )

    const link = buttonNamed("Open tracker.md on Bench")
    expect(link?.textContent).toBe("tracker.md")
    await act(async () => link?.click())

    expect(openBench).toHaveBeenCalledTimes(1)
    expect(openBench).toHaveBeenCalledWith(benchTarget("notes/tracker.md", "markdown"))
  })

  test("opens a notebook-relative Read path", async () => {
    await renderExpandedRow(
      readPart({ filePath: "notes/tracker.md", detail: "tracker.md" }),
      directory,
    )

    await act(async () => buttonNamed("Open tracker.md on Bench")?.click())

    expect(openBench).toHaveBeenCalledTimes(1)
    expect(openBench).toHaveBeenCalledWith(benchTarget("notes/tracker.md", "markdown"))
  })

  test.each(["./notes/tracker.md", "notes/../notes/tracker.md", ".\\notes\\tracker.md"])(
    "opens a Read path after resolving dot segments: %s",
    async (filePath) => {
      await renderExpandedRow(readPart({ filePath, detail: "tracker.md" }), directory)

      await act(async () => buttonNamed("Open tracker.md on Bench")?.click())

      expect(openBench).toHaveBeenCalledTimes(1)
      expect(openBench).toHaveBeenCalledWith(benchTarget("notes/tracker.md", "markdown"))
    },
  )

  test.each([
    "../secret.md",
    "notes/../../secret.md",
    "..\\secret.md",
    "C:..\\secret.md",
    "C:secret.md",
  ])("leaves a Read plain when dot segments resolve outside the notebook: %s", async (filePath) => {
    await renderExpandedRow(readPart({ filePath, detail: "secret.md" }), directory)

    expect(container.textContent).toContain("Read secret.md")
    expect(buttonNamed("Open secret.md on Bench")).toBeUndefined()
    expect(openBench).not.toHaveBeenCalled()
  })

  test.each(["~/notes/tracker.md", "~\\notes\\tracker.md"])(
    "leaves a home-relative Read plain: %s",
    async (filePath) => {
      await renderExpandedRow(readPart({ filePath, detail: "tracker.md" }), directory)

      expect(container.textContent).toContain("Read tracker.md")
      expect(buttonNamed("Open tracker.md on Bench")).toBeUndefined()
      expect(openBench).not.toHaveBeenCalled()
    },
  )

  test("opens an image Read on the file Bench from the step name", async () => {
    await renderExpandedRow(
      readPart({ filePath: `${directory}/photos/photo.png`, detail: "photo.png" }),
      directory,
    )

    await act(async () => buttonNamed("Open photo.png on Bench")?.click())

    expect(openBench).toHaveBeenCalledWith(benchTarget("photos/photo.png", "file"))
  })

  test("leaves the step name plain for a file outside the notebook", async () => {
    await renderExpandedRow(
      readPart({ filePath: "/tmp/tracker.md", detail: "tracker.md" }),
      directory,
    )

    expect(container.textContent).toContain("Read tracker.md")
    expect(buttonNamed("Open tracker.md on Bench")).toBeUndefined()
    expect(openBench).not.toHaveBeenCalled()
  })

  test("leaves the step name plain while the read is still running", async () => {
    await renderExpandedRow(
      readPart({
        filePath: `${directory}/notes/tracker.md`,
        detail: "tracker.md",
        status: "running",
      }),
      directory,
    )

    expect(container.textContent).toContain("Reading tracker.md")
    expect(buttonNamed("Open tracker.md on Bench")).toBeUndefined()
  })

  test("leaves the step name plain when the read has no file path", async () => {
    await renderExpandedRow(readPart({ detail: "tracker.md" }), directory)

    expect(buttonNamed("Open tracker.md on Bench")).toBeUndefined()
  })

  test("opens the file when the read card subject is clicked", async () => {
    await renderCard(
      readPart({ filePath: `${directory}/notes/tracker.md`, detail: "tracker.md" }),
      directory,
    )

    const subject = buttonNamed("Open tracker.md on Bench")
    expect(subject?.textContent).toBe("tracker.md")
    await act(async () => subject?.click())

    expect(openBench).toHaveBeenCalledTimes(1)
    expect(openBench).toHaveBeenCalledWith(benchTarget("notes/tracker.md", "markdown"))
  })

  test("keeps an outside-notebook read card subject as plain text", async () => {
    await renderCard(readPart({ filePath: "/tmp/tracker.md", detail: "tracker.md" }), directory)

    expect(textNode("span", "tracker.md")).toBeDefined()
    expect(buttonNamed("Open tracker.md on Bench")).toBeUndefined()
  })

  test("keeps a skill reference read as a plain label", async () => {
    await renderCard(
      readPart({
        filePath: `${directory}/skills/writing/SKILL.md`,
        detail: "SKILL.md",
      }),
      directory,
    )

    expect(container.textContent).toContain("Referred:")
    expect(textNode("span", "Writing")).toBeDefined()
    expect(buttonNamed("Open Writing on Bench")).toBeUndefined()
    expect(buttonNamed("Open SKILL.md on Bench")).toBeUndefined()
  })

  test("keeps an image preview as a picture without an open control", async () => {
    await renderCard(
      readPart({
        filePath: `${directory}/photos/photo.png`,
        detail: "photo.png",
        image: true,
      }),
      directory,
    )

    expect(container.querySelector("img")?.getAttribute("alt")).toBe("photo.png")
    expect(container.querySelector("button")).toBeNull()
    expect(openBench).not.toHaveBeenCalled()
  })
})
