import { describe, expect, test } from "bun:test"
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { extractResourcePack } from "../../src/resource-packs/extractors"
import { RESOURCE_PACK_STATUS_READY } from "../../src/resource-packs/contracts"

const EPUB_ENTITY_EXPANSION_COUNT = 1_205
const EPUB_MIME_TYPE = "application/epub+zip"
const EPUB_ENTITY_NAME = "buddyToken"

describe("resource pack extractors", () => {
  test("extracts EPUB when OPF entity expansions exceed the default parser threshold", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-extractor-"))
    const sourcePath = path.join(directory, "entity-heavy.epub")

    try {
      await writeEntityHeavyEpubFixture(sourcePath)

      const extraction = await extractResourcePack(sourcePath, {
        kind: "pack",
        format: "epub",
        mime: EPUB_MIME_TYPE,
      })

      expect(extraction.status).toBe(RESOURCE_PACK_STATUS_READY)
      expect(extraction.fullText).toContain("Opening chapter.")
      expect(extraction.fullText).toContain("Closing chapter.")
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})

async function writeEntityHeavyEpubFixture(filepath: string) {
  const zipFileWriter = new BlobWriter()
  const zipWriter = new ZipWriter(zipFileWriter)

  const expandedTitle = Array.from(
    {
      length: EPUB_ENTITY_EXPANSION_COUNT,
    },
    () => `&${EPUB_ENTITY_NAME};`,
  ).join(" ")

  await zipWriter.add("mimetype", new TextReader(EPUB_MIME_TYPE), {
    level: 0,
  })
  await zipWriter.add(
    "META-INF/container.xml",
    new TextReader(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
        "<rootfiles>",
        '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>',
        "</rootfiles>",
        "</container>",
      ].join(""),
    ),
  )
  await zipWriter.add(
    "OEBPS/content.opf",
    new TextReader(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<!DOCTYPE package [<!ENTITY ${EPUB_ENTITY_NAME} "Buddy">]>`,
        '<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">',
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
        `<dc:title>${expandedTitle}</dc:title>`,
        "<dc:creator>Buddy Author</dc:creator>",
        "</metadata>",
        "<manifest>",
        '<item id="chapter-one" href="chapter-one.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="chapter-two" href="chapter-two.xhtml" media-type="application/xhtml+xml"/>',
        "</manifest>",
        "<spine>",
        '<itemref idref="chapter-one"/>',
        '<itemref idref="chapter-two"/>',
        "</spine>",
        "</package>",
      ].join(""),
    ),
  )
  await zipWriter.add(
    "OEBPS/chapter-one.xhtml",
    new TextReader(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<html xmlns="http://www.w3.org/1999/xhtml">',
        "<body>",
        "<h1>Chapter One</h1>",
        "<p>Opening chapter.</p>",
        "</body>",
        "</html>",
      ].join(""),
    ),
  )
  await zipWriter.add(
    "OEBPS/chapter-two.xhtml",
    new TextReader(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<html xmlns="http://www.w3.org/1999/xhtml">',
        "<body>",
        "<h1>Chapter Two</h1>",
        "<p>Closing chapter.</p>",
        "</body>",
        "</html>",
      ].join(""),
    ),
  )

  await Bun.write(filepath, await zipWriter.close())
}
