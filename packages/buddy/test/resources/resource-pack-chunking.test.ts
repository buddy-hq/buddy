import { describe, expect, test } from "bun:test"
import { buildResourceChunkFiles } from "../../src/resource-packs/chunking"
import { RESOURCE_PACK_NON_CHAPTER_MAX_CHARS } from "../../src/resource-packs/chunking-config"
import { RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW as PAGE_WINDOW_KIND } from "../../src/resource-packs/contracts"

describe("resource pack chunking", () => {
  test("keeps split page-window chunk filenames unique", async () => {
    const repeatedText = "a".repeat(RESOURCE_PACK_NON_CHAPTER_MAX_CHARS * 2)

    const chunkFiles = await buildResourceChunkFiles({
      resourceAlias: "guide",
      sourceRelpath: "guide.pdf",
      format: "pdf",
      fullText: repeatedText,
      chunkUnits: [
        {
          unitKind: PAGE_WINDOW_KIND,
          unitTitle: "Page 1",
          unitIndex: 1,
          pageStart: 1,
          pageEnd: 1,
          text: repeatedText,
        },
      ],
    })

    expect(chunkFiles).toHaveLength(2)
    expect(new Set(chunkFiles.map((file) => file.filename)).size).toBe(chunkFiles.length)
    expect(chunkFiles[0]?.filename).toContain("-part-001-of-002-")
    expect(chunkFiles[1]?.filename).toContain("-part-002-of-002-")
  })
})
