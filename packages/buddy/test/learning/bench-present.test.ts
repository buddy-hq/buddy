import fs from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import {
  clearBenchContextRegistry,
  publishBenchContext,
} from "../../src/learning/features/bench/context"
import { presentOnBench } from "../../src/learning/features/bench/tools/present"
import { tmpdir } from "../helpers/tmpdir"

const SESSION_ID = "session-bench-present"

afterEach(() => {
  clearBenchContextRegistry()
})

function publishMarkdownBenchContext(input: {
  directory: string
  relativePath: string
  dirty: boolean
}) {
  publishBenchContext({
    directory: input.directory,
    sessionID: SESSION_ID,
    value: {
      status: "open",
      target: {
        type: "markdown",
        artifactKind: "none",
        title: path.basename(input.relativePath),
        workspaceRoot: input.directory,
        path: input.relativePath,
        absolutePath: path.join(input.directory, input.relativePath),
        resourceID: null,
        artifactID: null,
        itemID: null,
        route: `/_bench/markdown?path=${encodeURIComponent(input.relativePath)}`,
        status: input.dirty ? "dirty" : "ready",
      },
      metadata: [
        `dirty: ${input.dirty}`,
        "save_state: ready",
      ],
      content: "Current markdown snapshot.",
      refs: [
        {
          kind: "file",
          value: input.relativePath,
          note: "Markdown file on Bench.",
        },
      ],
      hints: [],
    },
  })
}

function publishClosedBenchContext(directory: string) {
  publishBenchContext({
    directory,
    sessionID: SESSION_ID,
    value: {
      status: "closed",
    },
  })
}

async function createRegisteredResource(input: {
  directory: string
  alias: string
  sourceFile: {
    path: string
    content: string
  }
  sourceOriginRelpath?: string
}) {
  const resourceDirectory = path.join(input.directory, "resources", input.alias)
  await fs.mkdir(resourceDirectory, { recursive: true })
  await fs.writeFile(
    path.join(resourceDirectory, input.sourceFile.path),
    input.sourceFile.content,
  )
  await fs.writeFile(
    path.join(resourceDirectory, ".buddy-source.json"),
    JSON.stringify(
      input.sourceOriginRelpath
        ? { sourceOriginRelpath: input.sourceOriginRelpath }
        : {},
      null,
      2,
    ),
  )
}

describe("bench_present", () => {
  test("presents an existing workspace file when Bench is synchronized closed", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "notes.md"), "# Notes\n")
      },
    })
    publishClosedBenchContext(project.path)

    const result = await presentOnBench({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "notes.md",
      resourceKey: null,
    })

    expect(result).toMatchObject({
      status: "presented",
      reason: "presented_file",
      target: {
        type: "markdown",
        path: "notes.md",
      },
    })
  })

  test("blocks HTML files so widgets use present_html_widget instead", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "widget.html"), "<button>Start</button>")
      },
    })
    publishClosedBenchContext(project.path)

    const result = await presentOnBench({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "widget.html",
      resourceKey: null,
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "unsupported_target",
      target: null,
    })
    expect(result.message).toContain("present_html_widget")
  })

  test("blocks when Bench state has not been synchronized", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "notes.md"), "# Notes\n")
      },
    })

    const result = await presentOnBench({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "notes.md",
      resourceKey: null,
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "sync_error",
      target: null,
    })
  })

  test("reports already_presenting for the active target", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "notes.md"), "# Notes\n")
      },
    })
    publishMarkdownBenchContext({
      directory: project.path,
      relativePath: "notes.md",
      dirty: false,
    })

    const result = await presentOnBench({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "notes.md",
      resourceKey: null,
    })

    expect(result).toMatchObject({
      status: "already_presenting",
      reason: "already_showing_target",
      target: {
        type: "markdown",
        path: "notes.md",
      },
    })
  })

  test("blocks replacing dirty markdown from the synchronized bench snapshot", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "notes.md"), "# Notes\n")
        await fs.writeFile(path.join(directory, "other.txt"), "Other\n")
      },
    })
    publishMarkdownBenchContext({
      directory: project.path,
      relativePath: "notes.md",
      dirty: true,
    })

    const result = await presentOnBench({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "other.txt",
      resourceKey: null,
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "blocked_by_unsaved_work",
      target: {
        type: "markdown",
        path: "notes.md",
      },
    })
  })

  test("presents a resource using the original PDF source path", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "original.pdf"), "%PDF-1.4\n")
        await createRegisteredResource({
          directory,
          alias: "book",
          sourceFile: {
            path: "copy.pdf",
            content: "%PDF-1.4\n",
          },
          sourceOriginRelpath: "original.pdf",
        })
      },
    })
    publishClosedBenchContext(project.path)

    const result = await presentOnBench({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_resource",
      path: null,
      resourceKey: "book",
    })

    expect(result).toMatchObject({
      status: "presented",
      reason: "presented_resource",
      target: {
        type: "reading",
        path: "original.pdf",
      },
    })
  })

  test("blocks text-only resources instead of presenting internal full text to reading mode", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await createRegisteredResource({
          directory,
          alias: "essay",
          sourceFile: {
            path: "essay.txt",
            content: "Self-Reliance\n",
          },
        })
      },
    })
    publishClosedBenchContext(project.path)

    const result = await presentOnBench({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_resource",
      path: null,
      resourceKey: "essay",
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "unsupported_target",
      target: null,
    })
  })
})
