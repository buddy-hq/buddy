import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import type { MessagePart } from "../src/state/chat-types"
import { activityPresentation, presentationMetadata } from "./tool-presentation-fixtures"

const openBench = mock(async () => ({ outcome: "committed" }))

mock.module("@/lib/use-open-bench", () => ({
  useOpenBench: () => openBench,
}))

// The diff viewer needs a real browser; a marker is enough to tell whether details are showing.
mock.module("@/components/chat/tools/activity-row/pierre-content", () => ({
  PierreContentCode: () => <div data-pierre-content="" />,
  PierreContentDiff: () => <div data-pierre-content="" />,
}))

const [
  { ActivityRow },
  { ActivityFileChangeDetails },
  { createActivityEntry },
  { BENCH_WORKSPACE_ROOT_NOTEBOOK },
] = await Promise.all([
  import("../src/components/chat/tools/activity-row"),
  import("../src/components/chat/tools/activity-row/file-change-details"),
  import("../src/components/chat/tools/activity-row/entries"),
  import("../src/lib/bench-navigation"),
])

const directory = "/notebooks/llm"

function writePart(filePath: string, status: "completed" | "running" = "completed"): MessagePart {
  const input = { filePath, content: "# Goals\n" }
  return {
    id: "part_write",
    sessionID: "ses_bench",
    messageID: "msg_bench",
    type: "tool",
    tool: "write",
    callID: "call_write",
    metadata: presentationMetadata(
      activityPresentation({
        phase: status,
        action: status === "completed" ? "Wrote" : "Writing",
        detail: "tracker.md",
        category: "edit-files",
        summary: "Edited files",
        icon: "edit",
        renderer: "edit",
      }),
    ),
    state:
      status === "completed"
        ? {
            status,
            input,
            output: "Wrote file successfully.",
            title: "tracker.md",
            metadata: { filepath: filePath },
            attachments: [],
            time: { start: 1, end: 2 },
          }
        : { status, input, metadata: {}, time: { start: 1 } },
  }
}

function patchFile(relativePath: string, type: "add" | "update" | "delete") {
  return {
    filePath: `${directory}/${relativePath}`,
    relativePath,
    type,
    before: type === "add" ? "" : "old\n",
    after: type === "delete" ? "" : "new\n",
    additions: type === "delete" ? 0 : 1,
    deletions: type === "add" ? 0 : 1,
  }
}

function applyPatchPart(): MessagePart {
  return {
    id: "part_patch",
    sessionID: "ses_bench",
    messageID: "msg_bench",
    type: "tool",
    tool: "apply_patch",
    callID: "call_patch",
    metadata: presentationMetadata(
      activityPresentation({
        phase: "completed",
        action: "Applied edits",
        detail: "3 files",
        category: "edit-files",
        summary: "Edited files",
        icon: "edit",
        renderer: "edit",
      }),
    ),
    state: {
      status: "completed",
      input: {},
      output: "Done",
      title: "3 files",
      metadata: {
        files: [
          patchFile("notes/tracker.md", "update"),
          patchFile("model.py", "add"),
          patchFile("old.py", "delete"),
        ],
      },
      attachments: [],
      time: { start: 1, end: 2 },
    },
  }
}

function toolEntry(part: MessagePart) {
  const entry = createActivityEntry(part)
  if (entry?.kind !== "tool") throw new Error("Expected a tool activity entry")
  return entry
}

function benchTarget(path: string, viewer: "file" | "markdown") {
  return expect.objectContaining({
    directory,
    target: { type: "workspace-file", root: BENCH_WORKSPACE_ROOT_NOTEBOOK, path, viewer },
  })
}

describe("opening changed files on the Bench from their names", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    openBench.mockClear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
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

  function detailsShown() {
    return container.querySelectorAll("[data-pierre-content]").length
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

  test("opens a written notebook file from its name without expanding the row", async () => {
    await renderExpandedRow(writePart(`${directory}/notes/tracker.md`), directory)

    const link = buttonNamed("Open tracker.md on Bench")
    expect(link?.textContent).toBe("tracker.md")
    await act(async () => link?.click())

    expect(openBench).toHaveBeenCalledTimes(1)
    expect(openBench).toHaveBeenCalledWith(benchTarget("notes/tracker.md", "markdown"))
    expect(detailsShown()).toBe(0)

    await act(async () => buttonNamed("Wrote tracker.md")?.click())
    expect(detailsShown()).toBe(1)
  })

  test("leaves the name plain for a file outside the notebook", async () => {
    await renderExpandedRow(writePart("/tmp/tracker.md"), directory)

    expect(container.textContent).toContain("Wrote tracker.md")
    expect(buttonNamed("Open tracker.md on Bench")).toBeUndefined()
  })

  test("leaves the name plain without a notebook", async () => {
    await renderExpandedRow(writePart(`${directory}/notes/tracker.md`), undefined)

    expect(buttonNamed("Open tracker.md on Bench")).toBeUndefined()
  })

  test("leaves the name plain while the file is still being written", async () => {
    await renderExpandedRow(writePart(`${directory}/notes/tracker.md`, "running"), directory)

    expect(buttonNamed("Open tracker.md on Bench")).toBeUndefined()
  })

  test("links each multi-file row name except deleted files", async () => {
    await act(async () =>
      root.render(
        <ActivityFileChangeDetails entry={toolEntry(applyPatchPart())} directory={directory} />,
      ),
    )

    expect(buttonNamed("Open tracker.md on Bench")).toBeDefined()
    expect(buttonNamed("Open old.py on Bench")).toBeUndefined()
    expect(detailsShown()).toBe(2)

    await act(async () => buttonNamed("Open model.py on Bench")?.click())
    expect(openBench).toHaveBeenCalledTimes(1)
    expect(openBench).toHaveBeenCalledWith(benchTarget("model.py", "file"))
    expect(detailsShown()).toBe(2)

    await act(async () => buttonNamed("model.py")?.click())
    expect(detailsShown()).toBe(1)
  })
})
