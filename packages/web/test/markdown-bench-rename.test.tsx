import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { MarkdownBenchFileController } from "../src/components/bench/markdown/use-file"

const openBench = mock(async () => ({ outcome: "committed" }))

mock.module("@/lib/use-open-bench", () => ({
  useOpenBench: () => openBench,
}))

const [
  { createMarkdownBenchFileStore },
  { markdownBenchPendingSaveSnapshot },
  { useMarkdownBenchRename },
  { BENCH_WORKSPACE_ROOT_NOTEBOOK, BENCH_WORKSPACE_ROOT_NOTES },
] = await Promise.all([
  import("../src/components/bench/markdown/file-store"),
  import("../src/components/bench/markdown/file-rules"),
  import("../src/components/bench/markdown/use-rename"),
  import("../src/lib/bench-targets"),
])

type BenchTarget = Parameters<typeof useMarkdownBenchRename>[0]["target"]

const directory = "/notebooks/llm"
const storageDirectory = "/notes"

function fileController(location: {
  directory: string
  path: string
}): MarkdownBenchFileController {
  const store = createMarkdownBenchFileStore({ content: "# Draft\n", version: "v1" })
  const snapshot = () => markdownBenchPendingSaveSnapshot(store.getState(), location)
  return {
    store,
    snapshot,
    saveFile: async () => ({ path: location.path, content: "", version: "v1" }),
    waitForSaveToSettle: async () => snapshot(),
    reload: async () => {},
    save: async () => {},
    synchronize: async () => ({ changed: false }),
    leaveGuard: async () => ({ status: "allow" }),
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  openBench.mockClear()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
})

async function renameWith(input: {
  path: string
  target: BenchTarget
  renamed: { path: string; target: BenchTarget }
}) {
  const location = { directory: storageDirectory, path: input.path }
  const file = fileController(location)
  let rename: ((title: string) => Promise<void>) | undefined
  function Harness() {
    rename = useMarkdownBenchRename({
      directory,
      location,
      file,
      target: input.target,
      renameTitle: async () => input.renamed,
      setRenaming: () => {},
    })
    return null
  }
  act(() => root.render(<Harness />))
  await act(async () => {
    await rename?.("Renamed note")
  })
  return file.store.getState()
}

describe("Markdown Bench rename", () => {
  test("keeps an id-keyed note editable in place after renaming it", async () => {
    const before: BenchTarget = {
      type: "workspace-file",
      root: BENCH_WORKSPACE_ROOT_NOTES,
      path: "Untitled.md",
      id: "note_1",
      viewer: "markdown",
    }
    const after: BenchTarget = { ...before, path: "Renamed note.md" }

    const state = await renameWith({
      path: "Untitled.md",
      target: before,
      renamed: { path: "Renamed note.md", target: after },
    })

    expect(state.exists).toBe(true)
    expect(state.saveError).toBeUndefined()
    expect(openBench).toHaveBeenCalledTimes(1)
  })

  test("retires a path-keyed file editor after renaming it", async () => {
    const before: BenchTarget = {
      type: "workspace-file",
      root: BENCH_WORKSPACE_ROOT_NOTEBOOK,
      path: "draft.md",
      viewer: "markdown",
    }
    const after: BenchTarget = { ...before, path: "Renamed note.md" }

    const state = await renameWith({
      path: "draft.md",
      target: before,
      renamed: { path: "Renamed note.md", target: after },
    })

    expect(state.exists).toBe(false)
    expect(openBench).toHaveBeenCalledTimes(1)
  })
})
