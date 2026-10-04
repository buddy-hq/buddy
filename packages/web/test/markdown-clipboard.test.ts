import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  BUDDY_MARKDOWN_CLIPBOARD_ATTRIBUTE,
  markdownClipboardHtml,
  readPastedMarkdown,
  writeMarkdownToClipboard,
} from "../src/lib/markdown-clipboard"

function clipboardData(data: Record<string, string>): DataTransfer {
  const transfer = new DataTransfer()
  for (const [type, value] of Object.entries(data)) transfer.setData(type, value)
  return transfer
}

function installClipboard(input: { writeFails: boolean }) {
  const written: ClipboardItem[] = []
  const writtenText: string[] = []
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: (items: ClipboardItem[]) => {
        if (input.writeFails) return Promise.reject(new Error("unsupported"))
        written.push(...items)
        return Promise.resolve()
      },
      writeText: (text: string) => {
        writtenText.push(text)
        return Promise.resolve()
      },
    },
  })
  return { written, writtenText }
}

describe("readPastedMarkdown", () => {
  test("reads plain text without HTML as Markdown", () => {
    expect(readPastedMarkdown(clipboardData({ "text/plain": "- **one**" }))).toBe("- **one**")
  })

  test("normalizes Windows and classic Mac line endings", () => {
    expect(readPastedMarkdown(clipboardData({ "text/plain": "a\r\nb\rc" }))).toBe("a\nb\nc")
  })

  test("reads Buddy's own Markdown copy despite its HTML", () => {
    const markdown = "Euler: $e^{i\\pi}+1=0$"
    const pasted = clipboardData({
      "text/plain": markdown,
      "text/html": markdownClipboardHtml(markdown),
    })

    expect(readPastedMarkdown(pasted)).toBe(markdown)
  })

  test("reads HTML that only repeats the plain text as plain text", () => {
    expect(readPastedMarkdown(clipboardData({ "text/plain": "*x*", "text/html": "*x*" }))).toBe(
      "*x*",
    )
  })

  test("leaves other apps' HTML to the HTML importer", () => {
    const pasted = clipboardData({ "text/plain": "Title", "text/html": "<h1>Title</h1>" })

    expect(readPastedMarkdown(pasted)).toBeUndefined()
  })

  test("ignores a clipboard without text", () => {
    expect(readPastedMarkdown(clipboardData({ "text/html": "<p>x</p>" }))).toBeUndefined()
  })
})

describe("markdownClipboardHtml", () => {
  test("renders Markdown inside Buddy's marker", () => {
    const html = markdownClipboardHtml("**bold**\n\n- item")

    expect(html.startsWith(`<div ${BUDDY_MARKDOWN_CLIPBOARD_ATTRIBUTE}="">`)).toBe(true)
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain("<li>item</li>")
  })
})

describe("writeMarkdownToClipboard", () => {
  let clipboardDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  })

  afterEach(() => {
    if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor)
    else Reflect.deleteProperty(navigator, "clipboard")
  })

  test("copies the Markdown as plain text and its rendering as HTML", async () => {
    const { written, writtenText } = installClipboard({ writeFails: false })

    await writeMarkdownToClipboard("**bold**")

    expect(writtenText).toEqual([])
    expect(written).toHaveLength(1)
    const item = written[0]
    if (!item) throw new Error("Expected a clipboard item")
    expect(await (await item.getType("text/plain")).text()).toBe("**bold**")
    expect(await (await item.getType("text/html")).text()).toBe(markdownClipboardHtml("**bold**"))
  })

  test("falls back to plain text when the clipboard refuses HTML", async () => {
    const { written, writtenText } = installClipboard({ writeFails: true })

    await writeMarkdownToClipboard("**bold**")

    expect(written).toEqual([])
    expect(writtenText).toEqual(["**bold**"])
  })
})
