import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { sanitizeFoliateChapter, sanitizeFoliateSvg, sanitizeFoliateSvgPage } from "../src/components/readers/foliate-chapter-sanitize"
import { foliateResourceType } from "../src/components/readers/foliate-resource-type"

import { installFoliateDomRuntime } from "./fixtures/foliate-dom-runtime"

const restoreDomRuntime = installFoliateDomRuntime()
const browserAPI = Object.getOwnPropertyDescriptor(globalThis, "happyDOM")
if (!browserAPI) throw new Error("This sanitizer test requires the happy-dom preload")
const { settings }: { settings: { disableCSSFileLoading: boolean; handleDisabledFileLoadingAsSuccess: boolean } } = browserAPI.value
const previousSettings = { ...settings }
beforeAll(() => {
  settings.disableCSSFileLoading = true
  settings.handleDisabledFileLoadingAsSuccess = true
})
afterAll(() => {
  restoreDomRuntime()
  Object.assign(settings, previousSettings)
})

const XHTML = "http://www.w3.org/1999/xhtml"
const SVG = "http://www.w3.org/2000/svg"
const MATHML = "http://www.w3.org/1998/Math/MathML"
const XLINK = "http://www.w3.org/1999/xlink"
const CHAPTER_TYPES = ["application/xhtml+xml", "text/html"]

function elementsNamed(root: Document | Element | undefined, namespace: string, localName: string) {
  return Array.from(root?.getElementsByTagNameNS(namespace, "*") ?? []).filter((element) => element.localName === localName)
}
const CSP = "script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"

function clean(source: string, type = "application/xhtml+xml") {
  return new DOMParser().parseFromString(
    sanitizeFoliateChapter(source, type),
    type === "text/html" ? "text/html" : "application/xhtml+xml",
  )
}

describe("DOMPurify book chapters", () => {
  test.each([
    ["application/xhtml+xml", "xhtml"],
    ["text/html; charset=utf-8", "html"],
    ["image/svg+xml", "svg"],
    ["application/xml", "document"],
    ["text/xml", "document"],
    ["text/xsl", "document"],
    ["application/example+xml", "document"],
    ["text/css", "inert"],
    ["text/vtt", "inert"],
    ["image/png", "inert"],
    ["image/jpg", "inert"],
    ["font/woff2", "inert"],
    ["font/opentype", "inert"],
    ["application/font-woff2", "inert"],
    ["application/x-font-woff", "inert"],
    ["application/x-font-otf", "inert"],
    ["application/vnd.ms-opentype", "inert"],
    ["audio/mpeg", "inert"],
    ["video/mp4", "inert"],
    ["application/octet-stream", "unknown"],
    ["text/javascript", "unknown"],
    ["image/x-unknown", "unknown"],
    ["text/plain", "unknown"],
    ["", "unknown"],
  ] as const)("classifies %s explicitly as %s", (type, category) => {
    expect(foliateResourceType(type).category).toBe(category)
  })
  test.each([
    ["Image/JPG; q=1", "image/jpg"],
    ["text/css\u00a0", "text/css"],
    [" TEXT/HTML ; charset=utf-8", "text/html"],
  ])("decides %j with the same type the resource is created with", (declared, type) => {
    expect(foliateResourceType(declared).type).toBe(type)
  })
  test.each(["text/html", "application/xhtml+xml"])("cleans the whole %s document and puts CSP first in head", (type) => {
    const doc = clean(`<html xmlns="${XHTML}"><head><title>Book</title><script>bad()</script><base href="https://example.com/"/><meta http-equiv="refresh" content="0"/></head><body onload="bad()"><script>bad()</script><iframe srcdoc="bad"></iframe><object></object><embed/><a href="javascript:bad()">Link</a><p>Text</p></body></html>`, type)
    expect(doc.querySelectorAll("script, iframe, frame, object, embed, base").length).toBe(0)
    expect(doc.querySelector("body")?.hasAttribute("onload")).toBe(false)
    expect(doc.querySelector("a")?.hasAttribute("href")).toBe(false)
    expect(doc.querySelector('[http-equiv="refresh"]')).toBeNull()
    const first = doc.querySelector("head")?.firstChild
    expect(first instanceof Element).toBe(true)
    if (!(first instanceof Element)) throw new Error("Missing first-node CSP")
    expect(first.getAttribute("http-equiv")).toBe("Content-Security-Policy")
    expect(first.getAttribute("content")).toBe(CSP)
    expect(doc.querySelector("title")?.textContent).toBe("Book")
    expect(doc.querySelector("p")?.textContent).toBe("Text")
  })

  test("removes namespace tricks, XSL construction, animation and foreign content", () => {
    const doc = clean(`<?xml-stylesheet type="text/xsl" href="book.xsl"?><html xmlns="${XHTML}" xmlns:p="urn:book" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><head/><body p:onload="bad()"><p:script>bad()</p:script><p onclick="bad()" p:href="javascript:bad()">Text</p><xsl:element name="script">bad()</xsl:element><svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" values="#safe;javascript:bad()"/><set attributeName="href" to="javascript:bad()"/><foreignObject><p xmlns="${XHTML}" onload="bad()">bad</p></foreignObject><use href="bad.svg"/></svg><math xmlns="http://www.w3.org/1998/Math/MathML"><annotation-xml encoding="text/html"><p xmlns="${XHTML}">bad</p></annotation-xml><mi>x</mi></math></body></html>`)
    const result = new XMLSerializer().serializeToString(doc)
    expect(result).not.toContain("xml-stylesheet")
    expect(doc.querySelectorAll("animate, set, foreignObject, use, annotation-xml").length).toBe(0)
    expect(result).not.toContain("p:script")
    expect(result).not.toContain("xsl:element")
    expect(result).not.toContain("javascript:")
    expect(doc.querySelector("body")?.hasAttribute("p:onload")).toBe(false)
    expect(doc.querySelector("mi")?.textContent).toBe("x")
  })

  test.each(["data:application/xhtml+xml,evil", "data:application/xml,evil", "data:text/xml,evil", "data:image/svg+xml,evil", "java&#x09;script:bad()"])("rejects %s as a link destination", (url) => {
    const doc = clean(`<html xmlns="${XHTML}"><head/><body><a href="${url}">Link</a></body></html>`)
    expect(doc.querySelector("a")?.hasAttribute("href")).toBe(false)
    expect(doc.querySelector("a")?.textContent).toBe("Link")
  })

  test("keeps publisher styles, book attributes and SVG data images in image contexts", () => {
    const doc = clean(`<html xmlns="${XHTML}" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en"><head><link rel="stylesheet" href="book.css"/><link rel="preload" href="bad.js"/><link rel="stylesheet" href="https://example.com/external.css"/><style>p { color: navy }</style></head><body><p id="paragraph" class="prose">Text &amp; words.</p><img src="blob:book/image"/><img src="data:image/png;base64,abc"/><img src="data:image/svg+xml;base64,abc"/><a href="#footnote" epub:type="noteref">1</a><aside id="footnote" epub:type="footnote">Note</aside></body></html>`)
    expect(doc.querySelectorAll("link").length).toBe(1)
    expect(doc.querySelector("link")?.getAttribute("href")).toBe("book.css")
    expect(doc.querySelector("style")?.textContent).toBe("p { color: navy }")
    expect(doc.querySelector("#paragraph.prose")?.textContent).toBe("Text & words.")
    expect(Array.from(doc.querySelectorAll("img"), (image) => image.getAttribute("src"))).toEqual(["blob:book/image", "data:image/png;base64,abc", "data:image/svg+xml;base64,abc"])
    expect(doc.querySelector("a")?.getAttribute("epub:type")).toBe("noteref")
    expect(doc.querySelector("#footnote")?.getAttribute("epub:type")).toBe("footnote")
  })

  test.each(["<html><body><broken></html>", '<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script></svg>', `<html xmlns="${XHTML}"><head xmlns="urn:wrong"><meta http-equiv="Content-Security-Policy"/></head><body><p>Safe</p></body></html>`])("fails closed on malformed XHTML or non-HTML roots and ensures a genuine head", (source) => {
    const doc = clean(source)
    expect(doc.querySelector("parsererror")).toBeNull()
    expect(doc.documentElement.namespaceURI).toBe(XHTML)
    expect(doc.documentElement.localName).toBe("html")
    const head = doc.querySelector("head")
    expect(head?.namespaceURI).toBe(XHTML)
    expect(head?.firstElementChild?.getAttribute("content")).toBe(CSP)
    expect(doc.querySelectorAll("script").length).toBe(0)
  })

  test.each(CHAPTER_TYPES)("keeps cross-file, numbered and sub-folder link targets in %s chapters", (type) => {
    const doc = clean(`<html xmlns="${XHTML}"><head/><body><a href="chapter01.xhtml#fn1">1</a><a href="Text/notes.xhtml#n1">2</a><a href="../Text/part0005.html#x">3</a><a href="#fn1">4</a></body></html>`, type)
    expect(Array.from(doc.querySelectorAll("a"), (link) => link.getAttribute("href"))).toEqual([
      "chapter01.xhtml#fn1",
      "Text/notes.xhtml#n1",
      "../Text/part0005.html#x",
      "#fn1",
    ])
  })

  test.each(CHAPTER_TYPES)("keeps inline SVG viewBox, gradients, clipping, filters, paths and language in %s chapters", (type) => {
    const doc = clean(`<html xmlns="${XHTML}"><head/><body><p xml:lang="fr">Bonjour</p><svg xmlns="${SVG}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" width="100%" height="100%"><defs><linearGradient id="fade" gradientTransform="rotate(90)"><stop offset="0" stop-color="navy"/></linearGradient><radialGradient id="glow"><stop offset="1" stop-color="gold"/></radialGradient><clipPath id="frame" clipPathUnits="userSpaceOnUse"><rect width="10" height="10"/></clipPath><filter id="soft"><feGaussianBlur stdDeviation="2"/></filter></defs><path d="M10 10 L20 20 m 5,5 h 10" fill="url(#fade)" clip-path="url(#frame)" filter="url(#soft)"/><foreignObject><p xmlns="${XHTML}">Foreign</p></foreignObject></svg></body></html>`, type)
    expect(doc.querySelector("p")?.getAttribute("xml:lang")).toBe("fr")
    expect(doc.documentElement.textContent).not.toContain("Foreign")
    const svg = elementsNamed(doc, SVG, "svg")[0]
    expect(svg?.getAttribute("viewBox")).toBe("0 0 100 100")
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet")
    const drawing = Array.from(svg?.getElementsByTagNameNS(SVG, "*") ?? [])
    expect(drawing.map((element) => element.localName)).toEqual([
      "defs", "linearGradient", "stop", "radialGradient", "stop", "clipPath", "rect", "filter", "feGaussianBlur", "path",
    ])
    const named = (name: string) => drawing.find((element) => element.localName === name)
    expect(named("linearGradient")?.getAttribute("gradientTransform")).toBe("rotate(90)")
    expect(named("clipPath")?.getAttribute("clipPathUnits")).toBe("userSpaceOnUse")
    expect(named("feGaussianBlur")?.getAttribute("stdDeviation")).toBe("2")
    expect(named("path")?.getAttribute("d")).toBe("M10 10 L20 20 m 5,5 h 10")
    expect(named("path")?.getAttribute("fill")).toBe("url(#fade)")
  })

  test.each(CHAPTER_TYPES)("keeps transform and motion animation but never an animated link target in %s chapters", (type) => {
    const doc = clean(`<html xmlns="${XHTML}"><head/><body><svg xmlns="${SVG}"><rect width="1" height="1"><animateTransform attributeName="transform" type="rotate" values="0;90" dur="1s"/></rect><a href="#x"><animateTransform attributeName="href" type="rotate" values="0;90" dur="1s"/><animateMotion dur="1s"/><text>Link</text></a></svg></body></html>`, type)
    const animations = Array.from(doc.getElementsByTagNameNS(SVG, "animateTransform"))
    expect(animations.map((animation) => animation.getAttribute("attributeName"))).toEqual(["transform", null])
    expect(doc.getElementsByTagNameNS(SVG, "animateMotion").length).toBe(1)
  })

  test("keeps a TeX annotation hidden inside its MathML semantics, as text only", () => {
    const doc = clean(`<html xmlns="${XHTML}"><head/><body><p>Area <math xmlns="${MATHML}"><semantics><mrow><msup><mi>r</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">r^{2}<mi>extra</mi></annotation><annotation-xml encoding="text/html"><p xmlns="${XHTML}">Hidden markup</p></annotation-xml></semantics></math></p></body></html>`)
    const math = elementsNamed(doc, MATHML, "math")[0]
    const semantics = math?.firstElementChild
    expect(semantics?.localName).toBe("semantics")
    expect(Array.from(semantics?.children ?? [], (child) => child.localName)).toEqual(["mrow", "annotation"])
    const annotation = semantics?.lastElementChild
    expect(annotation?.getAttribute("encoding")).toBe("application/x-tex")
    expect(annotation?.children.length).toBe(0)
    expect(annotation?.textContent).toBe("r^{2}extra")
    const shown = math?.cloneNode(true)
    if (!(shown instanceof Element)) throw new Error("Missing formula")
    for (const hidden of Array.from(shown.getElementsByTagNameNS(MATHML, "annotation"))) hidden.remove()
    expect(shown.textContent).toBe("r2")
    expect(doc.getElementsByTagNameNS(MATHML, "annotation-xml").length).toBe(0)
    expect(doc.documentElement.textContent).not.toContain("Hidden markup")
  })

  test("an HTML chapter keeps its HTML doctype and an XHTML chapter stays plain XML", () => {
    const html = sanitizeFoliateChapter("<!DOCTYPE html><html><head><title>Book</title></head><body><p>Text</p></body></html>", "text/html")
    expect(html).toStartWith("<!DOCTYPE html>")
    const doc = new DOMParser().parseFromString(html, "text/html")
    expect(doc.doctype?.name).toBe("html")
    expect(doc.querySelector("p")?.textContent).toBe("Text")
    expect(sanitizeFoliateChapter(`<html xmlns="${XHTML}"><head/><body/></html>`, "application/xhtml+xml")).toStartWith("<html")
  })

  test("an SVG image keeps its drawing and loses scripts and animated links", () => {
    const result = sanitizeFoliateSvg(`<svg xmlns="${SVG}" xmlns:xlink="${XLINK}" viewBox="0 0 10 10" onload="bad()"><script>bad()</script><linearGradient id="fade" gradientTransform="rotate(90)"/><path d="M1 1 L9 9" fill="url(#fade)"/><image xlink:href="blob:book/photo" width="10" height="10"/><set attributeName="href" to="javascript:bad()"/></svg>`)
    const svg = new DOMParser().parseFromString(result, "image/svg+xml").documentElement
    expect(svg.getAttribute("viewBox")).toBe("0 0 10 10")
    expect(svg.hasAttribute("onload")).toBe(false)
    const drawing = Array.from(svg.getElementsByTagNameNS(SVG, "*"))
    expect(drawing.map((element) => element.localName)).toEqual(["linearGradient", "path", "image"])
    expect(drawing[0]?.getAttribute("gradientTransform")).toBe("rotate(90)")
    expect(drawing[1]?.getAttribute("d")).toBe("M1 1 L9 9")
    expect(drawing[2]?.getAttributeNS(XLINK, "href")).toBe("blob:book/photo")
    expect(result).not.toContain("javascript:")
  })

  test.each([
    ['width="1200" height="1600" viewBox="0 0 600 800"', 1200, 1600, "0 0 600 800"],
    ['width="600" height="800"', 600, 800, null],
    ['width="210mm" height="297mm"', 794, 1123, null],
    ['width="600px" height="800px"', 600, 800, null],
    ['width="2in" height="3in"', 192, 288, null],
    ['width="2.54cm" height="5.08cm"', 96, 192, null],
    ['width="101.6Q" height="203.2Q"', 96, 192, null],
    ['width="72pt" height="144pt"', 96, 192, null],
    ['width="6pc" height="12pc"', 96, 192, null],
    ['width="100%" height="100%" viewBox="0 0 600 800"', 600, 800, "0 0 600 800"],
    ['width="10em" height="800" viewBox="0 0 600 800"', 600, 800, "0 0 600 800"],
    ['width="0" height="800" viewBox="0 0 600 800"', 600, 800, "0 0 600 800"],
    ['width="600" viewBox="0 0 600 800"', 600, 800, "0 0 600 800"],
  ] as const)("an SVG page uses matching viewport and pixel dimensions for %s", (attributes, width, height, viewBox) => {
    const source = `<svg xmlns="${SVG}" ${attributes} preserveAspectRatio="xMidYMid meet"><rect width="600" height="800"/></svg>`
    const doc = new DOMParser().parseFromString(sanitizeFoliateSvgPage(source), "application/xhtml+xml")
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(`width=${width},height=${height}`)
    const svg = doc.querySelector("svg")
    expect(svg?.getAttribute("width")).toBe(`${width}px`)
    expect(svg?.getAttribute("height")).toBe(`${height}px`)
    expect(svg?.getAttribute("viewBox")).toBe(viewBox)
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet")
  })

  test("an SVG page without positive dimensions or a viewBox has no viewport", () => {
    const doc = new DOMParser().parseFromString(sanitizeFoliateSvgPage(`<svg xmlns="${SVG}" width="100%" height="10em"/>`), "application/xhtml+xml")
    expect(doc.querySelector('meta[name="viewport"]')).toBeNull()
    expect(doc.querySelector("svg")?.getAttribute("width")).toBe("100%")
    expect(doc.querySelector("svg")?.getAttribute("height")).toBe("10em")
  })
})
