import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BenchOpenRequest } from "../src/lib/bench-navigation"

const EXTERNAL_PATH = "/outside/notes.md"
const openBench = mock(async (_request: BenchOpenRequest) => ({ outcome: "committed" }))
const presentFile = mock(async (_input: { directory: string; path: string }) => ({
  data: { objectID: "media-notes" },
  error: undefined,
  response: new Response(null, { status: 200 }),
}))
const resolveFile = mock(async (_input: { directory: string; path: string }) => ({
  data: {
    absolutePath: EXTERNAL_PATH,
    fileName: "notes.md",
    workspacePath: null,
    renderMode: "file",
    mimeType: "text/markdown",
    sizeBytes: 12,
  },
  error: undefined,
  response: new Response(null, { status: 200 }),
}))

const buddyClient = await import("../src/lib/buddy-client")
mock.module("@/lib/buddy-client", () => ({
  ...buddyClient,
  getBuddyClient: () => ({ objectMediaPresentation: { resolveFile, presentFile } }),
}))
mock.module("@/lib/use-open-bench", () => ({
  useOpenBench: () => openBench,
}))

const [{ useMarkdownFileOpen }, { useExternalFileOpenDialogStore }, { useUiPreferences }] =
  await Promise.all([
    import("../src/components/markdown/use-markdown-file-link-open"),
    import("../src/state/external-file-open-dialog-store"),
    import("../src/state/ui-preferences"),
  ])

type OpenMarkdownFile = ReturnType<typeof useMarkdownFileOpen>

async function flushEffects() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("useMarkdownFileOpen", () => {
  let container: HTMLDivElement
  let root: Root
  let openFile: OpenMarkdownFile | undefined

  function Probe() {
    openFile = useMarkdownFileOpen("/notebook")
    return null
  }

  function requireOpenFile(): OpenMarkdownFile {
    if (!openFile) throw new Error("Expected the Markdown file opener")
    return openFile
  }

  beforeEach(async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    openBench.mockClear()
    presentFile.mockClear()
    useUiPreferences.getState().setOpenExternalFilesWithoutAsking(false)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(<Probe />)
      await flushEffects()
    })
  })

  afterEach(() => {
    useExternalFileOpenDialogStore.getState().resolveRequest("cancel")
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("opens a cited external file without asking again", async () => {
    const opened = await requireOpenFile()(EXTERNAL_PATH, "citation")

    expect(useExternalFileOpenDialogStore.getState().request).toBeUndefined()
    expect(presentFile).toHaveBeenCalledWith({ directory: "/notebook", path: EXTERNAL_PATH })
    expect(opened).toMatchObject({
      kind: "external",
      target: { type: "object", ref: { kind: "media-presentation", objectID: "media-notes" } },
      outcome: "committed",
    })
  })

  test("still asks before a link opens an external file", async () => {
    const opening = requireOpenFile()(EXTERNAL_PATH)
    await act(async () => {
      await flushEffects()
    })
    expect(useExternalFileOpenDialogStore.getState().request).toMatchObject({
      kind: "open",
      path: EXTERNAL_PATH,
    })
    expect(presentFile).not.toHaveBeenCalled()

    useExternalFileOpenDialogStore.getState().resolveRequest("open")
    await opening
    expect(presentFile).toHaveBeenCalledTimes(1)
    expect(openBench).toHaveBeenCalledTimes(1)
  })
})
