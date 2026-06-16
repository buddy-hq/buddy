import { describe, expect, test } from "bun:test"
import type { PromptResource } from "../../src/learning/prompt/context"
import { renderNotebookResourcesSection } from "../../src/learning/prompt/runtime-context/resource-context/resources-section"

describe("notebook resources context", () => {
  test("marks which resources can be opened in Bench reading mode", () => {
    const resources = [
      {
        id: "resource-pdf",
        name: "Readable Book",
        alias: "readable-book",
        sourceRelpath: "resources/readable-book/readable-book.pdf",
        format: "pdf",
        status: "ready",
        warnings: [],
        benchReaderRelpath: "books/readable-book.pdf",
      },
      {
        id: "resource-text",
        name: "Internal Text",
        alias: "internal-text",
        sourceRelpath: "resources/internal-text/internal.txt",
        format: "text",
        status: "ready",
        warnings: [],
      },
    ] satisfies PromptResource[]

    const output = renderNotebookResourcesSection({ resources })

    expect(output).toContain("alias=readable-book")
    expect(output).toContain("bench_reader=books/readable-book.pdf")
    expect(output).toContain("alias=internal-text")
    expect(output).toContain("bench_reader=none")
    expect(output).toContain("do not call `bench_present` for `bench_reader=none`")
  })
})
