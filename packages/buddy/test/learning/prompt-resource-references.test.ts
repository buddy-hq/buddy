import { describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { WORKSPACE_FILE_REFERENCE_PART_TYPE } from "../../src/learning/prompt/workspace-file-references"
import type {
  ResourcePackResolution,
  ResourcePackService,
} from "../../src/resources/resource-pack-service"
import { tmpdir } from "../helpers/tmpdir"

describe("message prompt resource references", () => {
  test("rewrites raw file references and workspace-file-reference parts", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const notesPath = path.join(project.path, "notes.md")
    const codePath = path.join(project.path, "helper.ts")
    const sourcePath = path.join(project.path, "book chapter 1.pdf")
    const packRootPath = path.join(project.path, ".buddy", "resources", "fake-pack")
    const entrypointPath = path.join(packRootPath, "RESOURCE.md")
    const tocPath = path.join(packRootPath, "toc.md")

    mkdirSync(packRootPath, { recursive: true })
    writeFileSync(notesPath, "# Notes\n\nPlain text reference.\n")
    writeFileSync(codePath, "export const helper = 1\n")
    writeFileSync(sourcePath, "%PDF-1.4\n% fake resource for testing\n")
    writeFileSync(entrypointPath, "# Resource\n")
    writeFileSync(tocPath, "# Table of Contents\n")

    const calls: Array<{ directory: string; sourcePath: string }> = []
    const resourcePackService: ResourcePackService = {
      ensureResourcePack: async (input): Promise<ResourcePackResolution> => {
        calls.push({ directory: input.directory, sourcePath: input.sourcePath })
        return {
          sourcePath: input.sourcePath,
          sourceRelpath: path.relative(input.directory, input.sourcePath),
          packKey: "fake-pack",
          packRootPath,
          metadataPath: entrypointPath,
          entrypointPath,
          fullPath: path.join(packRootPath, "full.md"),
          tocPath,
          status: "ready",
          confidence: "medium",
          format: "pdf",
          warnings: [],
        }
      },
    }

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
      resources: {
        resourcePackService,
      },
    })

    expect(calls).toEqual([
      {
        directory: project.path,
        sourcePath,
      },
    ])

    const parts = result.transformed.parts as Array<Record<string, unknown>>
    expect(parts).toHaveLength(4)
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
      filename: path.relative(project.path, entrypointPath),
      url: pathToFileURL(entrypointPath).href,
    })
    expect(parts[3]).toMatchObject({
      type: "file",
      mime: "text/plain",
      filename: path.relative(project.path, tocPath),
      url: pathToFileURL(tocPath).href,
    })
  })

  test("keeps direct code references on the existing text-file path", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const codePath = path.join(project.path, "helper.ts")
    writeFileSync(codePath, "export const helper = 1\n")

    let resourcePackCalls = 0
    const resourcePackService: ResourcePackService = {
      ensureResourcePack: async () => {
        resourcePackCalls += 1
        throw new Error("should not be called for direct code files")
      },
    }

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_direct_code",
      },
      body: {
        content: "Open @helper.ts",
        agent: "custom-agent",
      },
      projectConfig: config,
      resources: {
        resourcePackService,
      },
    })

    expect(resourcePackCalls).toBe(0)
    const parts = result.transformed.parts as Array<Record<string, unknown>>
    expect(parts).toEqual([
      {
        type: "text",
        text: "Open ",
      },
      {
        type: "file",
        mime: "text/plain",
        filename: "helper.ts",
        url: pathToFileURL(codePath).href,
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
