import { afterEach, describe, expect, test } from "bun:test"
import {
  canRenderPresentedMediaAsSource,
  readPresentedMediaSourceBlob,
} from "../src/lib/presented-media-source"
import { monacoLanguageForWorkspacePath } from "../src/lib/workspace-file-content"
import {
  resolvePresentedMediaMarkdownImageSrc,
  resolvePresentedMediaMarkdownLink,
} from "../src/lib/presented-media-markdown"
import { loadPresentedMediaSource } from "../src/state/presented-media-source-query"
import { installTestFetch, restoreTestFetch } from "./test-utils"

const originalFetch = globalThis.fetch

afterEach(() => {
  restoreTestFetch(originalFetch)
})

describe("presented media source files", () => {
  test("routes openable external code and text files to the source viewer", () => {
    expect(
      canRenderPresentedMediaAsSource({
        path: "ChatView.tsx",
        mimeType: "text/plain",
        sizeBytes: 1024,
        renderMode: "file",
      }),
    ).toBe(true)
    expect(
      canRenderPresentedMediaAsSource({
        path: "README.md",
        mimeType: "text/markdown",
        sizeBytes: 1024,
        renderMode: "file",
      }),
    ).toBe(true)
    expect(monacoLanguageForWorkspacePath("ChatView.tsx")).toBe("typescript")
    expect(monacoLanguageForWorkspacePath("ChatView.jsx")).toBe("javascript")
  })

  test("leaves media and unsupported document formats with their existing renderers", () => {
    expect(
      canRenderPresentedMediaAsSource({
        path: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        renderMode: "image",
      }),
    ).toBe(false)
    expect(
      canRenderPresentedMediaAsSource({
        path: "report.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 1024,
        renderMode: "file",
      }),
    ).toBe(false)
  })

  test("decodes readable UTF-8 source and rejects binary content", async () => {
    await expect(
      readPresentedMediaSourceBlob(new Blob(["export const answer = 42\n"])),
    ).resolves.toBe("export const answer = 42\n")
    await expect(
      readPresentedMediaSourceBlob(new Blob([new Uint8Array([0, 1, 2])])),
    ).rejects.toThrow("not readable UTF-8 text")
  })

  test("preserves text-like raw responses before decoding them as source", async () => {
    const responses = [
      {
        contentType: "text/markdown; charset=utf-8",
        source: "# Exact markdown source\n\n- one\n",
      },
      {
        contentType: "application/json",
        source: '{\n  "answer": 42,\n  "nested": { "value": true }\n}\n',
      },
    ] as const
    let responseIndex = 0
    installTestFetch(async () => {
      const response = responses[responseIndex]
      if (!response) throw new Error("Unexpected presented-media source request")
      responseIndex += 1
      return new Response(response.source, {
        headers: { "content-type": response.contentType },
      })
    })

    for (const [index, response] of responses.entries()) {
      await expect(
        loadPresentedMediaSource({
          directory: "/repo",
          objectID: "object_1",
          itemID: `item_${index + 1}`,
          fileName: `source_${index + 1}`,
          modifiedAt: null,
        }),
      ).resolves.toBe(response.source)
    }

    expect(responseIndex).toBe(responses.length)
  })

  test("keeps raw endpoint errors out of the source viewer", async () => {
    installTestFetch(async () => Response.json({ error: "File not found" }, { status: 404 }))

    await expect(
      loadPresentedMediaSource({
        directory: "/repo",
        objectID: "object_1",
        itemID: "missing_item",
        fileName: "missing.md",
        modifiedAt: null,
      }),
    ).rejects.toThrow("File not found")
  })

  test("keeps external Markdown assets and links anchored to the presented file", () => {
    expect(
      resolvePresentedMediaMarkdownImageSrc({
        rawUrl:
          "http://localhost/api/objects/media-presentation/object_1/raw/item_1?directory=%2Frepo",
        src: "./images/cat.png",
      }),
    ).toBe(
      "http://localhost/api/objects/media-presentation/object_1/raw/item_1?directory=%2Frepo&relativePath=images%2Fcat.png",
    )
    expect(resolvePresentedMediaMarkdownLink("/tmp/notes.md", "./guide.md#usage")).toEqual({
      type: "local-path",
      path: "/tmp/guide.md",
    })
    expect(resolvePresentedMediaMarkdownLink("C:\\Users\\buddy\\notes.md", ".\\guide.md")).toEqual({
      type: "local-path",
      path: "C:\\Users\\buddy\\guide.md",
    })
  })
})
