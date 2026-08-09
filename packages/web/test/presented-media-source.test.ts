import { describe, expect, test } from "bun:test"
import {
  canRenderPresentedMediaAsSource,
  readPresentedMediaSourceBlob,
} from "../src/lib/presented-media-source"
import { monacoLanguageForWorkspacePath } from "../src/lib/workspace-file-content"

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
})
