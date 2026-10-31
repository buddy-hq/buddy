import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createQueryTestRoot } from "./query-test-root"

import type { MessagePart } from "../src/state/chat-types"
import { activityPresentation, presentationMetadata } from "./tool-presentation-fixtures"

const openBench = mock(async () => ({ outcome: "committed" }))
const openMarkdownFile = mock(async (_path: string) => undefined)

mock.module("@/lib/use-open-bench", () => ({
  useOpenBench: () => openBench,
}))

mock.module("@/components/markdown/use-markdown-file-link-open", () => ({
  useMarkdownFileOpen: () => openMarkdownFile,
  useMarkdownFileLinkOpen: () => openMarkdownFile,
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
    openMarkdownFile.mockClear()
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

  async function renderExpandedRow(
    part: MessagePart | MessagePart[],
    notebookDirectory: string | undefined,
  ) {
    await act(async () =>
      root.render(
        <ActivityRow
          parts={Array.isArray(part) ? part : [part]}
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

  test.each(["../secret.md", "notes/../../secret.md", "..\\secret.md"])(
    "opens a Read whose dot segments resolve outside the notebook: %s",
    async (filePath) => {
      await renderExpandedRow(readPart({ filePath, detail: "secret.md" }), directory)

      const link = buttonNamed("Open secret.md on Bench")
      expect(link?.textContent).toBe("secret.md")
      await act(async () => link?.click())

      expect(openMarkdownFile).toHaveBeenCalledTimes(1)
      expect(openMarkdownFile).toHaveBeenCalledWith(filePath)
      expect(openBench).not.toHaveBeenCalled()
    },
  )

  test.each(["C:..\\secret.md", "C:secret.md"])(
    "leaves a Read plain when dot segments resolve outside the notebook: %s",
    async (filePath) => {
      await renderExpandedRow(readPart({ filePath, detail: "secret.md" }), directory)

      expect(container.textContent).toContain("Read secret.md")
      expect(buttonNamed("Open secret.md on Bench")).toBeUndefined()
      expect(openBench).not.toHaveBeenCalled()
    },
  )

  test.each(["~/notes/tracker.md", "~\\notes\\tracker.md"])(
    "opens a home-relative Read through the markdown opener: %s",
    async (filePath) => {
      await renderExpandedRow(readPart({ filePath, detail: "tracker.md" }), directory)

      const link = buttonNamed("Open tracker.md on Bench")
      expect(link?.textContent).toBe("tracker.md")
      await act(async () => link?.click())

      expect(openMarkdownFile).toHaveBeenCalledTimes(1)
      expect(openMarkdownFile).toHaveBeenCalledWith(filePath)
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

  test.each(["/tmp/tracker.md", "C:\\tmp\\tracker.md"])(
    "opens an outside-notebook Read step through the markdown opener: %s",
    async (filePath) => {
      await renderExpandedRow(readPart({ filePath, detail: "tracker.md" }), directory)

      const link = buttonNamed("Open tracker.md on Bench")
      expect(link?.textContent).toBe("tracker.md")
      await act(async () => link?.click())

      expect(openMarkdownFile).toHaveBeenCalledTimes(1)
      expect(openMarkdownFile).toHaveBeenCalledWith(filePath)
      expect(openBench).not.toHaveBeenCalled()
    },
  )

  test("opens an outside Read while keeping a Wrote row for the same path plain", async () => {
    const filePath = "/tmp/tracker.md"
    const wrote: MessagePart = {
      id: "part_write",
      sessionID: "ses_read",
      messageID: "msg_read",
      type: "tool",
      tool: "write",
      callID: "call_write",
      metadata: presentationMetadata(
        activityPresentation({
          phase: "completed",
          action: "Wrote",
          detail: "tracker.md",
          category: "edit-files",
          summary: "Edited files",
          renderer: "edit",
        }),
      ),
      state: {
        status: "completed",
        input: {},
        metadata: {},
        output: "written",
        title: "tracker.md",
        time: { start: 1, end: 2 },
        summary: { kind: "write-file", subject: filePath },
        fileChanges: [{ path: filePath, content: "contents" }],
      },
    }
    await renderExpandedRow([readPart({ filePath, detail: "tracker.md" }), wrote], directory)

    const wroteRow = container.querySelector('[data-part-id="part_write"]')
    expect(wroteRow?.textContent).toContain("Wrote tracker.md")
    expect(wroteRow?.querySelector('[aria-label="Open tracker.md on Bench"]')).toBeNull()
    const link = buttonNamed("Open tracker.md on Bench")
    expect(link?.textContent).toBe("tracker.md")
    await act(async () => link?.click())

    expect(openMarkdownFile).toHaveBeenCalledTimes(1)
    expect(openMarkdownFile).toHaveBeenCalledWith(filePath)
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

  test("opens an outside-notebook read card subject through the markdown opener", async () => {
    await renderCard(readPart({ filePath: "/tmp/tracker.md", detail: "tracker.md" }), directory)

    const subject = buttonNamed("Open tracker.md on Bench")
    expect(subject?.textContent).toBe("tracker.md")
    await act(async () => subject?.click())

    expect(openMarkdownFile).toHaveBeenCalledTimes(1)
    expect(openMarkdownFile).toHaveBeenCalledWith("/tmp/tracker.md")
    expect(openBench).not.toHaveBeenCalled()
  })

  test("opens a notebook skill reference using its display name", async () => {
    await renderCard(
      readPart({
        filePath: `${directory}/skills/writing/SKILL.md`,
        detail: "SKILL.md",
      }),
      directory,
    )

    expect(container.textContent).toContain("Referred:")
    const subject = buttonNamed("Open Writing on Bench")
    expect(subject?.textContent).toBe("Writing")
    await act(async () => subject?.click())

    expect(openBench).toHaveBeenCalledTimes(1)
    expect(openBench).toHaveBeenCalledWith(benchTarget("skills/writing/SKILL.md", "markdown"))
    expect(buttonNamed("Open SKILL.md on Bench")).toBeUndefined()
  })

  test("opens an outside skill reference using its display name", async () => {
    const filePath = "/app/skills/buddy-help/references/handy-voice.md"
    await renderCard(readPart({ filePath, detail: "handy-voice.md" }), directory)

    expect(container.textContent).toContain("Referred:")
    const subject = buttonNamed("Open Handy Voice on Bench")
    expect(subject?.textContent).toBe("Handy Voice")
    await act(async () => subject?.click())

    expect(openMarkdownFile).toHaveBeenCalledTimes(1)
    expect(openMarkdownFile).toHaveBeenCalledWith(filePath)
    expect(openBench).not.toHaveBeenCalled()
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
