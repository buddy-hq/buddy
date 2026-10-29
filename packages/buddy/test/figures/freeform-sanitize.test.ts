import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import * as FreeformFigure from "../../src/learning/features/figure-rendering/freeform/service/render"
import { sanitizeSvg } from "../../src/learning/features/figure-rendering/freeform/service/sanitize"
import { tmpdir } from "../helpers/tmpdir"

const ordinaryFigure =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20" /></svg>'
const entityFigure =
  '<!DOCTYPE svg [<!ENTITY payload "&#60;script&#62;alert(1)&#60;/script&#62;">]><svg xmlns="http://www.w3.org/2000/svg">&payload;</svg>'

describe("freeform figure SVG sanitization", () => {
  test.each([
    '<s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script>',
    "<svg:script>alert(1)</svg:script>",
    "<x:script/>",
    "<S:SCRIPT>alert(1)</S:SCRIPT>",
    "<script>alert(1)</script>",
  ])("removes executable markup %s", (executable) => {
    expect(sanitizeSvg(`<svg>${executable}<rect /></svg>`)).toBe("<svg><rect /></svg>")
  })

  test.each(["foreignObject", "iframe", "object", "embed", "audio", "video"])(
    "removes prefixed %s elements and their contents",
    (name) => {
      expect(sanitizeSvg(`<svg><x:${name}><text>unsafe</text></x:${name}><rect /></svg>`)).toBe(
        "<svg><rect /></svg>",
      )
      expect(sanitizeSvg(`<svg><x:${name}/><rect /></svg>`)).toBe("<svg><rect /></svg>")
    },
  )

  test.each(["script", "foreignObject", "iframe", "object", "embed", "audio", "video"])(
    "rejects a surviving prefixed %s element by its local name",
    (name) => {
      const source = `<svg xmlns="http://www.w3.org/2000/svg"><g><s:${name} xmlns:s="urn:untrusted" /></g></svg>`
      expect(() => FreeformFigure.assertSanitizedSvg(source)).toThrow(
        FreeformFigure.FreeformFigureRenderError,
      )
      expect(() => FreeformFigure.assertSanitizedSvg(source)).toThrow(/executable/iu)
    },
  )

  test("rejects a surviving mixed-case element in the SVG namespace", () => {
    expect(() =>
      FreeformFigure.assertSanitizedSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><S:SCRIPT xmlns:S="http://www.w3.org/2000/svg">alert(1)</S:SCRIPT></svg>',
      ),
    ).toThrow(FreeformFigure.FreeformFigureRenderError)
  })

  test("rejects invalid XML with the parser's reason", () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>'
    expect(() => FreeformFigure.assertSanitizedSvg(source)).toThrow(
      FreeformFigure.FreeformFigureRenderError,
    )
    expect(() => FreeformFigure.assertSanitizedSvg(source)).toThrow(
      /figure SVG isn't valid XML: .+/u,
    )
  })

  test.each([
    { source: `<!DOCTYPE svg>${ordinaryFigure}`, rejected: "DOCTYPE declaration" },
    { source: entityFigure, rejected: "DOCTYPE declaration" },
    {
      source: '<!DOCTYPE svg [<!ATTLIST svg onload CDATA "alert(1)">]><svg />',
      rejected: "DOCTYPE declaration",
    },
    { source: `<!ENTITY payload "unsafe">${ordinaryFigure}`, rejected: "ENTITY declaration" },
    {
      source: `<?xml-stylesheet href="figure.xsl" type="text/xsl"?>${ordinaryFigure}`,
      rejected: "processing instruction",
    },
    { source: '<svg><?unsafe run="yes"?></svg>', rejected: "processing instruction" },
    {
      source: `<?xml version="1.0"?><?xml version="1.0"?>${ordinaryFigure}`,
      rejected: "processing instruction",
    },
  ])("rejects $rejected in $source", ({ source, rejected }) => {
    expect(() => FreeformFigure.assertSanitizedSvg(source)).toThrow(
      FreeformFigure.FreeformFigureRenderError,
    )
    expect(() => FreeformFigure.assertSanitizedSvg(source)).toThrow(rejected)
  })

  test.each([
    { attributes: 'onload="alert(1)"', rejected: "onload" },
    { attributes: 'data-marker=">" onload="alert(1)"', rejected: "onload" },
    { attributes: 'q:ONLOAD="alert(1)"', rejected: "q:ONLOAD" },
    { attributes: 'href="javascript:alert(1)"', rejected: "href" },
    { attributes: 'xlink:href="java&#x73;cript:alert(1)"', rejected: "xlink:href" },
    { attributes: 'q:href="java&#115;cript:alert(1)"', rejected: "q:href" },
    {
      attributes: 'q:href=" &#x09;JaVa&#x0a;ScRi&#x0d;Pt&#127;&#x85;:alert(1) "',
      rejected: "q:href",
    },
    { attributes: 'href="data:text/html;base64,PHNjcmlwdD4="', rejected: "href" },
    { attributes: 'xlink:href="data:application/xml;base64,PHN2Zy8+"', rejected: "xlink:href" },
    { attributes: 'q:href="data:image/svg+xml;base64,PHN2Zy8+"', rejected: "q:href" },
    { attributes: 'href="data:image/not-a-raster;base64,AA=="', rejected: "href" },
    { attributes: 'href="data:image/png+xml;base64,AA=="', rejected: "href" },
    { attributes: 'href="data:image/png.evil;base64,AA=="', rejected: "href" },
    { attributes: 'q:href=" D&#x61;Ta&#x09;:text/html,unsafe "', rejected: "q:href" },
  ])("rejects unsafe attribute $attributes", ({ attributes, rejected }) => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:q="http://www.w3.org/1999/xlink" xmlns:xlink="http://www.w3.org/1999/xlink"><g><a ${attributes}><text>click</text></a></g></svg>`
    expect(() => FreeformFigure.assertSanitizedSvg(source)).toThrow(
      FreeformFigure.FreeformFigureRenderError,
    )
    expect(() => FreeformFigure.assertSanitizedSvg(source)).toThrow(rejected)
  })

  test.each([
    '<svg data-marker=">" onload="alert(1)"><rect /></svg>',
    '<svg xmlns:q="http://www.w3.org/1999/xlink"><a q:href="java&#x73;cript:alert(1)"><text>click</text></a></svg>',
    '<svg><image href="data:image/svg+xml;base64,PHN2Zy8+" /></svg>',
  ])("rejects unsafe attributes surviving sanitization in %s", (source) => {
    expect(() => FreeformFigure.assertSanitizedSvg(sanitizeSvg(source))).toThrow(
      FreeformFigure.FreeformFigureRenderError,
    )
  })

  test("rejects entity-expanded scripts before storing a figure", async () => {
    await using project = await tmpdir()
    await expect(
      FreeformFigure.renderFreeformFigure(project.path, { source: entityFigure }),
    ).rejects.toThrow("DOCTYPE declaration")
    expect(await fs.readdir(project.path)).toEqual([])
  })

  test.each(["png", "jpeg", "gif", "webp", "avif", "bmp", "tiff", "x-icon"])(
    "accepts an embedded %s raster image",
    (type) => {
      expect(() =>
        FreeformFigure.assertSanitizedSvg(
          `<svg><image href="data:image/${type};base64,AA==" /></svg>`,
        ),
      ).not.toThrow()
    },
  )

  test("accepts an XML declaration, fragment links, comments and CDATA", () => {
    const source =
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><!-- <!DOCTYPE svg> <?example?> --><text><![CDATA[<!ENTITY example> <?example?>]]></text><a href="#detail"><text>detail</text></a><g id="detail" /></svg>'
    expect(() => FreeformFigure.assertSanitizedSvg(source)).not.toThrow()
  })

  test("accepts an ordinary figure", () => {
    expect(() => FreeformFigure.assertSanitizedSvg(ordinaryFigure)).not.toThrow()
  })
})
