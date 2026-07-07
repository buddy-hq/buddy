import { describe, expect, test } from "bun:test"
import {
  resolveResourceObjectViewerPath,
  resolveResourceObjectViewerPathWithFallback,
} from "../src/lib/resource-object-viewer-path"

describe("resource object viewer path resolution", () => {
  test("uses authoritative object data when the resource inventory is stale", () => {
    expect(
      resolveResourceObjectViewerPathWithFallback({
        record: undefined,
        authoritativeReaderPath: "JEE-Main-2022-25-Jul-Shift-1.pdf",
      }),
    ).toEqual({
      path: "JEE-Main-2022-25-Jul-Shift-1.pdf",
      viewer: "reading",
    })
  })

  test("does not let generated markdown reader paths override original PDFs", () => {
    expect(
      resolveResourceObjectViewerPath({
        readerPath: ".buddy/resources/home/full-text.md",
        sourceOriginRelpath: "home.pdf",
        sourceRelpath: ".buddy/resources/home/source.pdf",
      }),
    ).toEqual({
      path: "home.pdf",
      viewer: "reading",
    })
  })

  test("routes markdown-only resources to the Markdown Bench", () => {
    expect(
      resolveResourceObjectViewerPath({
        readerPath: "notes/home.md",
        sourceRelpath: "notes/home.md",
      }),
    ).toEqual({
      path: "notes/home.md",
      viewer: "markdown",
    })
  })

  test("routes MDX resources to the Markdown Bench", () => {
    expect(
      resolveResourceObjectViewerPath({
        sourceOriginRelpath: "notes/lesson.mdx",
      }),
    ).toEqual({
      path: "notes/lesson.mdx",
      viewer: "markdown",
    })
  })

  test("keeps unsupported resource paths out of Foliate", () => {
    expect(
      resolveResourceObjectViewerPath({
        readerPath: "notes/home.txt",
        sourceRelpath: "notes/home.txt",
      }),
    ).toBeUndefined()
  })
})
