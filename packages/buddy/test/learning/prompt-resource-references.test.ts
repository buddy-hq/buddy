import { describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import {
  addResource,
  resolveResourceReference,
} from "../../src/resources/resource-registry-service"
import {
  flattenPromptPartsForRuntime,
  RESOURCE_REFERENCE_PART_TYPE,
  SELECTION_CONTEXT_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "../../src/learning/prompt/workspace-file-references"
import { tmpdir } from "../helpers/tmpdir"

const RESOURCE_REFERENCE_WAIT_ATTEMPTS = 40
const RESOURCE_REFERENCE_WAIT_MS = 25

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForReadyResourceReference(input: {
  directory: string
  key: string
}): Promise<Extract<Awaited<ReturnType<typeof resolveResourceReference>>, { ok: true }>> {
  for (let attempt = 0; attempt < RESOURCE_REFERENCE_WAIT_ATTEMPTS; attempt += 1) {
    const resolved = await resolveResourceReference(input)
    if (resolved.ok) return resolved
    if (resolved.reason !== "not_ready") {
      throw new Error(`Resource reference did not become ready: ${resolved.reason}`)
    }
    await sleep(RESOURCE_REFERENCE_WAIT_MS)
  }

  throw new Error("Timed out waiting for resource reference preparation.")
}

describe("message prompt resource references", () => {
  test("rewrites raw file references and workspace-file-reference parts", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const notesPath = path.join(project.path, "notes.md")
    const sourcePath = path.join(project.path, "book chapter 1.pdf")

    writeFileSync(notesPath, "# Notes\n\nPlain text reference.\n")
    writeFileSync(sourcePath, "%PDF-1.4\n% fake resource for testing\n")

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_resource_refs",
      },
      body: {
        content: "See @notes.md",
        parts: [
          {
            type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
            path: "book chapter 1.pdf",
          },
        ],
        agent: "custom-agent",
      },
      projectConfig: config,
    })

    const parts = result.transformed.parts as Array<Record<string, unknown>>
    expect(parts).toHaveLength(3)
    expect(parts[0]).toEqual({
      type: "text",
      text: "See ",
    })
    expect(parts[1]).toMatchObject({
      type: "file",
      mime: "text/plain",
      filename: "notes.md",
      url: pathToFileURL(notesPath).href,
    })
    expect(parts[2]).toMatchObject({
      type: "file",
      mime: "text/plain",
      filename: "book chapter 1.pdf",
      url: pathToFileURL(sourcePath).href,
    })
  })

  test("resolves explicit resource-reference parts to pack entry files", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)
    const alias = "shape-up"
    const sourcePath = path.join(project.path, "source-materials", "guide.html")
    mkdirSync(path.dirname(sourcePath), { recursive: true })
    writeFileSync(
      sourcePath,
      "<!doctype html><html><body><h1>Shape Up</h1><h2>Chapter 1</h2><p>Start</p></body></html>",
      "utf8",
    )
    await addResource({
      directory: project.path,
      sourcePath,
      alias,
    })
    const prepared = await waitForReadyResourceReference({
      directory: project.path,
      key: alias,
    })
    const entrypointPath = prepared.entrypointPath
    const tocPath = prepared.tocPath
    expect(tocPath).toBeDefined()

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_resource_part",
      },
      body: {
        content: "Use this resource",
        parts: [
          {
            type: RESOURCE_REFERENCE_PART_TYPE,
            key: alias,
          },
        ],
        agent: "custom-agent",
      },
      projectConfig: config,
    })

    const parts = result.transformed.parts as Array<Record<string, unknown>>
    expect(parts).toEqual([
      {
        type: "text",
        text: "Use this resource",
      },
      {
        type: "file",
        mime: "text/plain",
        filename: path.relative(project.path, entrypointPath),
        url: pathToFileURL(entrypointPath).href,
      },
      {
        type: "file",
        mime: "text/plain",
        filename: path.relative(project.path, tocPath!),
        url: pathToFileURL(tocPath!).href,
      },
    ])
  })

  test("rejects unknown resource-reference keys", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    await expect(
      runMessagePromptPipeline({
        context: {
          directory: project.path,
          sessionID: "ses_resource_missing",
        },
        body: {
          content: "",
          parts: [
            {
              type: RESOURCE_REFERENCE_PART_TYPE,
              key: "missing",
            },
          ],
          agent: "custom-agent",
        },
        projectConfig: config,
      }),
    ).rejects.toThrow("Resource reference was not found")
  })

  test("flattens Markdown selection context into model-readable prompt text", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_markdown_selection",
      },
      body: {
        content: "",
        parts: [
          {
            type: SELECTION_CONTEXT_PART_TYPE,
            source: "markdown",
            text: "Selected worksheet prompt",
            selectionKey: "selection-1",
            path: "docs/worksheet.md",
            version: "v1",
            headingPath: ["Worksheet", "Prompt"],
          },
        ],
        agent: "custom-agent",
      },
      projectConfig: config,
    })

    const parts = result.transformed.parts as Array<Record<string, unknown>>
    expect(parts).toEqual([
      {
        type: "selection-context",
        source: "markdown",
        text: "Selected worksheet prompt",
        selectionKey: "selection-1",
        path: "docs/worksheet.md",
        version: "v1",
        headingPath: ["Worksheet", "Prompt"],
      },
    ])

    expect(flattenPromptPartsForRuntime(parts)).toEqual([
      {
        type: "text",
        text: "Selected worksheet prompt",
        metadata: {
          buddyPromptPart: {
            type: "selection-context",
            source: "markdown",
            text: "Selected worksheet prompt",
            selectionKey: "selection-1",
            path: "docs/worksheet.md",
            version: "v1",
            headingPath: ["Worksheet", "Prompt"],
          },
        },
      },
    ])
  })

  test("keeps unresolved raw @tokens as text", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_raw_mentions",
      },
      body: {
        content: "Check @missing.txt and keep going",
        agent: "custom-agent",
      },
      projectConfig: config,
    })

    const parts = result.transformed.parts as Array<Record<string, unknown>>
    expect(parts).toEqual([
      {
        type: "text",
        text: "Check ",
      },
      {
        type: "text",
        text: "@missing.txt",
      },
      {
        type: "text",
        text: " and keep going",
      },
    ])
  })

  test("resolves quoted raw file references with spaces", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const notesPath = path.join(project.path, "notes with spaces.txt")
    writeFileSync(notesPath, "notes\n")

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_raw_quoted_spaces",
      },
      body: {
        content: 'Read @"notes with spaces.txt"',
        agent: "custom-agent",
      },
      projectConfig: config,
    })

    const parts = result.transformed.parts as Array<Record<string, unknown>>
    expect(parts).toEqual([
      {
        type: "text",
        text: "Read ",
      },
      {
        type: "file",
        mime: "text/plain",
        filename: "notes with spaces.txt",
        url: pathToFileURL(notesPath).href,
      },
    ])
  })

  test("keeps bare @ text untouched", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_raw_at_symbol",
      },
      body: {
        content: "Ping @ to acknowledge",
        agent: "custom-agent",
      },
      projectConfig: config,
    })

    const parts = result.transformed.parts as Array<Record<string, unknown>>
    expect(parts).toEqual([
      {
        type: "text",
        text: "Ping @ to acknowledge",
      },
    ])
  })

  test("keeps raw absolute path mentions outside workspace as text", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)
    const outsideFilename = `outside-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
    const outsidePath = path.join(path.dirname(project.path), outsideFilename)
    writeFileSync(outsidePath, "outside workspace file\n")

    try {
      const result = await runMessagePromptPipeline({
        context: {
          directory: project.path,
          sessionID: "ses_raw_absolute_outside",
        },
        body: {
          content: `Review @${outsidePath} carefully`,
          agent: "custom-agent",
        },
        projectConfig: config,
      })

      const parts = result.transformed.parts as Array<Record<string, unknown>>
      expect(parts).toEqual([
        {
          type: "text",
          text: "Review ",
        },
        {
          type: "text",
          text: `@${outsidePath}`,
        },
        {
          type: "text",
          text: " carefully",
        },
      ])
    } finally {
      rmSync(outsidePath, { force: true })
    }
  })

  test("rejects absolute paths for explicit workspace-file-reference parts", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)
    const outsidePath = path.join(project.path, "outside.pdf")
    writeFileSync(outsidePath, "%PDF-1.4\n")

    await expect(
      runMessagePromptPipeline({
        context: {
          directory: project.path,
          sessionID: "ses_explicit_absolute",
        },
        body: {
          content: "",
          parts: [
            {
              type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
              path: outsidePath,
            },
          ],
          agent: "custom-agent",
        },
        projectConfig: config,
      }),
    ).rejects.toThrow("workspace-file-reference path must be workspace-relative")
  })

  test("rejects explicit workspace-file-reference traversal outside workspace", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)
    const outsideFilename = `outside-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
    const outsidePath = path.join(path.dirname(project.path), outsideFilename)
    writeFileSync(outsidePath, "outside workspace file\n")

    try {
      await expect(
        runMessagePromptPipeline({
          context: {
            directory: project.path,
            sessionID: "ses_explicit_traversal",
          },
          body: {
            content: "",
            parts: [
              {
                type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
                path: `../${outsideFilename}`,
              },
            ],
            agent: "custom-agent",
          },
          projectConfig: config,
        }),
      ).rejects.toThrow("workspace-file-reference path must be workspace-relative")
    } finally {
      rmSync(outsidePath, { force: true })
    }
  })
})
