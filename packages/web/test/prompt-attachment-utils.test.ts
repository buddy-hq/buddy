import { describe, expect, test } from "bun:test"
import {
  fileToPromptComposerAttachment,
  resolvePromptAttachmentMime,
} from "../src/components/prompt/attachment-utils"

describe("prompt attachment policy", () => {
  test("keeps supported images and PDFs", async () => {
    const image = new File([Uint8Array.of(137, 80, 78, 71)], "image.png", { type: "image/png" })
    const pdf = new File(["%PDF-1.7"], "guide.pdf", { type: "application/pdf" })

    expect(await resolvePromptAttachmentMime(image)).toBe("image/png")
    expect(await resolvePromptAttachmentMime(pdf)).toBe("application/pdf")
  })

  test("normalizes text-like files to text/plain", async () => {
    const json = new File(['{"ok":true}\n'], "data.json", { type: "application/json" })
    const source = new File(["export const value = 1\n"], "main.ts", { type: "video/mp2t" })

    expect(await resolvePromptAttachmentMime(json)).toBe("text/plain")
    expect(await resolvePromptAttachmentMime(source)).toBe("text/plain")
  })

  test("uses the extension when browsers omit a supported MIME type", async () => {
    const image = new File([Uint8Array.of(137, 80, 78, 71)], "image.png")
    const pdf = new File(["%PDF-1.7"], "guide.pdf", { type: "application/octet-stream" })

    expect(await resolvePromptAttachmentMime(image)).toBe("image/png")
    expect(await resolvePromptAttachmentMime(pdf)).toBe("application/pdf")
    expect((await fileToPromptComposerAttachment(image))?.dataUrl).toStartWith(
      "data:image/png;base64,",
    )
  })

  test("rejects a binary disk image before creating an attachment", async () => {
    const diskImage = new File([Uint8Array.of(0, 255, 1, 2, 3, 4)], "Installer.dmg", {
      type: "application/x-apple-diskimage",
    })

    expect(await resolvePromptAttachmentMime(diskImage)).toBeUndefined()
    expect(await fileToPromptComposerAttachment(diskImage)).toBeUndefined()
  })
})
