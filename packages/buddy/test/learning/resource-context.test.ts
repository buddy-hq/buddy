import path from "node:path"
import { describe, expect, test } from "bun:test"
import type { PromptResource } from "../../src/learning/prompt/context"
import { renderNotebookResourcesSection } from "../../src/learning/prompt/runtime-context/resource-context/resources-section"

describe("notebook resources context", () => {
  test("marks which resources can be opened in Bench reading mode", () => {
    const directory = path.resolve("test-workspace")
    const resources = [
      {
        objectID: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        name: "Readable Book",
        alias: "readable-book",
        managedSource:
          ".buddy/objects/v1/resource/01ARZ3NDEKTSV4RRFFQ69G5FAV/source/readable-book.pdf",
        format: "pdf",
        status: "ready",
        warnings: [],
        benchReaderRelpath: "books/readable-book.pdf",
        packPath: ".buddy/objects/v1/resource/01ARZ3NDEKTSV4RRFFQ69G5FAV/derived/pack",
      },
      {
        objectID: "01BRZ3NDEKTSV4RRFFQ69G5FBW",
        name: "Internal Text",
        alias: "internal-text",
        managedSource: ".buddy/objects/v1/resource/01BRZ3NDEKTSV4RRFFQ69G5FBW/source/internal.txt",
        format: "text",
        status: "ready",
        warnings: [],
        packPath: ".buddy/objects/v1/resource/01BRZ3NDEKTSV4RRFFQ69G5FBW/derived/pack",
      },
    ] satisfies PromptResource[]

    const output = renderNotebookResourcesSection({ directory, resources })

    expect(output).toContain("alias=readable-book")
    expect(output).toContain("object_id=01ARZ3NDEKTSV4RRFFQ69G5FAV")
    expect(output).toContain(`bench_reader=${path.join(directory, "books/readable-book.pdf")}`)
    expect(output).toContain(
      `pack=${path.join(
        directory,
        ".buddy/objects/v1/resource/01ARZ3NDEKTSV4RRFFQ69G5FAV/derived/pack",
      )}`,
    )
    expect(output).toContain("alias=internal-text")
    expect(output).toContain("bench_reader=none")
    expect(output).toContain("do not rewrite them to `~/.buddy`")
    expect(output).toContain("do not call `bench_present` for `bench_reader=none`")
  })
})
