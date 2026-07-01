import { describe, expect, test } from "bun:test"
import {
  inspectReaderSourceBytes,
  readerSourceFormatFromPath,
} from "@buddy/workspace-file-policy"

const encoder = new TextEncoder()

describe("reader source validation", () => {
  test("rejects HTML saved with a PDF extension", () => {
    expect(
      inspectReaderSourceBytes({
        path: "download.pdf",
        bytes: encoder.encode("<!DOCTYPE html><html><body>viewer</body></html>"),
      }),
    ).toEqual({
      format: "pdf",
      sourceValidity: "invalid",
      reason: "The .pdf file contains HTML instead of a PDF document.",
    })
  })

  test("recognizes supported reader signatures", () => {
    expect(
      inspectReaderSourceBytes({
        path: "book.pdf",
        bytes: encoder.encode("%PDF-1.7\n"),
      }).sourceValidity,
    ).toBe("valid")
    expect(
      inspectReaderSourceBytes({
        path: "book.epub",
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      }).sourceValidity,
    ).toBe("valid")
    expect(readerSourceFormatFromPath("notes.txt")).toBeNull()
  })
})
