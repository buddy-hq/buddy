import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { afterEach, describe, expect, test } from "bun:test"
import {
  clearBenchContextRegistry,
  publishBenchContext,
} from "../../src/learning/features/bench/context"
import {
  benchPresentTool,
  presentOnBench,
} from "../../src/learning/features/bench/tools/present"
import {
  addResource,
  resolveResourceObjectByKey,
} from "../../src/resources/resource-registry-service"
import { createBuddyToolContext } from "../helpers/tools"
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
        type: "workspace-file",
        title: path.basename(input.relativePath),
        workspaceRoot: input.directory,
        path: input.relativePath,
        absolutePath: path.join(input.directory, input.relativePath),
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

async function waitForResourceReader(input: {
  directory: string
  resourceKey: string
}): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const resource = await resolveResourceObjectByKey({
      directory: input.directory,
      resourceKey: input.resourceKey,
    }).catch(() => undefined)
    if (resource?.readerPath) return
    await sleep(100)
  }
  throw new Error(`Expected resource ${input.resourceKey} to expose a reader path.`)
}

describe("bench_present", () => {
  test("accepts omitted inactive nullable fields for close", async () => {
    await using project = await tmpdir({ git: true })
    publishClosedBenchContext(project.path)

    const result = await benchPresentTool.run(
      {
        action: "close",
      },
      createBuddyToolContext({
        directory: project.path,
        sessionID: SESSION_ID,
        messageID: "msg_bench_present_omitted_nulls",
        agent: "buddy",
      }),
    )

    expect(result.output).toBe("Requested closing Bench.")
    expect(result.metadata).toMatchObject({
      benchAction: "close",
      benchStatus: "closed",
      reason: "closed_by_request",
      benchTarget: null,
    })
  })

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
      objectID: null,
    })

    expect(result).toMatchObject({
      status: "presented",
      reason: "presented_file",
      target: {
        type: "workspace-file",
        path: "notes.md",
      },
      benchTarget: {
        type: "workspace-file",
        path: "notes.md",
        viewer: "markdown",
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
      objectID: null,
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
      objectID: null,
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
      objectID: null,
    })

    expect(result).toMatchObject({
      status: "already_presenting",
      reason: "already_showing_target",
      target: {
        type: "workspace-file",
        path: "notes.md",
      },
      benchTarget: {
        type: "workspace-file",
        path: "notes.md",
        viewer: "markdown",
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
      objectID: null,
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "blocked_by_unsaved_work",
      target: {
        type: "workspace-file",
        path: "notes.md",
      },
      benchTarget: {
        type: "workspace-file",
        path: "notes.md",
        viewer: "markdown",
      },
    })
  })

  test("presents a resource using the original PDF source path", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "original.pdf"), "%PDF-1.4\n")
        await addResource({
          directory,
          sourcePath: "original.pdf",
          alias: "book",
        })
      },
    })
    publishClosedBenchContext(project.path)
    await waitForResourceReader({
      directory: project.path,
      resourceKey: "book",
    })

    const result = await presentOnBench({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_resource",
      path: null,
      resourceKey: "book",
      objectID: null,
    })

    expect(result).toMatchObject({
      status: "presented",
      reason: "presented_resource",
      target: {
        type: "object",
        viewID: "reader",
      },
      benchTarget: {
        type: "object",
        viewID: "reader",
      },
    })
  })

  test("blocks text-only resources instead of presenting internal full text to reading mode", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "essay.txt"), "Self-Reliance\n")
        await addResource({
          directory,
          sourcePath: "essay.txt",
          alias: "essay",
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
      objectID: null,
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "unsupported_target",
      target: null,
    })
  })
})
