import { describe, expect, test } from "bun:test"
import { renderNotebookResourcesSection } from "../../src/learning/prompt/runtime-context/resource-context/resources-section"

describe("resourcesSection", () => {
  test("omits resource usage instructions when no resources are available", () => {
    const output = renderNotebookResourcesSection({
      resources: [],
    })

    expect(output).toContain("No notebook resources are currently available.")
    expect(output).not.toContain("How to use resources")
    expect(output).not.toContain("00-resource.md")
    expect(output).not.toContain("10-toc.md")
  })

  test("includes resource usage instructions when resources are available", () => {
    const output = renderNotebookResourcesSection({
      resources: [
        {
          id: "res_1",
          name: "Sample Book",
          alias: "sample-book",
          sourceRelpath: "resources/sample-book/book.pdf",
          format: "pdf",
          status: "ready",
          warnings: [],
        },
      ],
    })

    expect(output).toContain("How to use resources")
    expect(output).toContain("pedagogy_resource_ingest_full_text")
    expect(output).not.toContain("ingest `ingest_full_text`")
    expect(output).toContain("00-resource.md")
    expect(output).toContain("10-toc.md")
    expect(output).toContain("name=Sample Book")
    expect(output).toContain("alias=sample-book")
  })
})
