import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { FileTypeIcon, resolveFileTypeIconUrl } from "../src/components/files/file-type-icon"

describe("FileTypeIcon", () => {
  test("renders markdown icons as theme-colored inline SVGs", () => {
    const html = renderToStaticMarkup(
      <FileTypeIcon fileName="notes.md" className="size-4 object-contain" />,
    )

    expect(html).toContain("<svg")
    expect(html).not.toContain("<img")
    expect(html).toContain("text-icon-info-base")
    expect(html).toContain("fill=\"currentColor\"")
    expect(html).not.toContain(resolveFileTypeIconUrl({ fileName: "notes.md" }))
  })

  test("keeps non-markdown icons as image assets", () => {
    const html = renderToStaticMarkup(
      <FileTypeIcon fileName="app.tsx" className="size-4 object-contain" />,
    )

    expect(html).toContain("<img")
    expect(html).not.toContain("<svg")
    expect(html).toContain(resolveFileTypeIconUrl({ fileName: "app.tsx" }))
  })
})
