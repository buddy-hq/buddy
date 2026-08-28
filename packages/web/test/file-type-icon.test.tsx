import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { FileTypeIcon } from "../src/components/files/file-type-icon"

describe("FileTypeIcon", () => {
  test("renders markdown icons as theme-colored inline SVGs", () => {
    const html = renderToStaticMarkup(
      <FileTypeIcon fileName="notes.md" className="size-4 object-contain" />,
    )

    expect(html).toContain("<svg")
    expect(html).not.toContain("<img")
    expect(html).toContain("text-icon-info-base")
    expect(html).toContain('fill="currentColor"')
  })

  test("keeps non-markdown icons as image assets", () => {
    const html = renderToStaticMarkup(
      <FileTypeIcon fileName="app.tsx" className="size-4 object-contain" />,
    )

    expect(html).toContain("<img")
    expect(html).not.toContain("<svg")
  })
})
