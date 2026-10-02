import { describe, expect, test } from "bun:test"
import { keepUntouchedMarkdownBlocks } from "../src/components/bench/markdown/untouched-blocks"

const SOURCE = [
  "---",
  "title: Kept",
  "---",
  "# Notes ##",
  "",
  "TODO:fix this, see http://x.com and snake_case for $5.",
  "",
  "",
  "| a | b |",
  "|---|:-:|",
  "| 1 | 2 |",
  "",
  "* first",
  "* second",
  "",
  "Last &amp; final.",
  "",
].join("\n")

const BASELINE = [
  "---",
  "title: Kept",
  "---",
  "# Notes",
  "",
  "TODO\\:fix this, see <http://x.com> and snake\\_case for \\$5.",
  "",
  "| a | b |",
  "| - | :-: |",
  "| 1 | 2 |",
  "",
  "- first",
  "- second",
  "",
  "Last & final.",
].join("\n")

function editedBaseline(from: string, to: string) {
  if (!BASELINE.includes(from)) throw new Error(`Expected baseline to contain ${from}`)
  return BASELINE.replace(from, to)
}

describe("keepUntouchedMarkdownBlocks", () => {
  test("returns the file as it was when nothing was edited", () => {
    expect(
      keepUntouchedMarkdownBlocks({ source: SOURCE, baseline: BASELINE, next: BASELINE }),
    ).toBe(SOURCE)
  })

  test("re-serializes only the edited block and keeps every other block byte for byte", () => {
    const next = editedBaseline("- second", "- second\n- third")

    expect(keepUntouchedMarkdownBlocks({ source: SOURCE, baseline: BASELINE, next })).toBe(
      SOURCE.replace("* first\n* second", "- first\n- second\n- third"),
    )
  })

  test("keeps the source gaps around a block edited in place", () => {
    const next = editedBaseline("Last & final.", "Last & final, edited.")

    expect(keepUntouchedMarkdownBlocks({ source: SOURCE, baseline: BASELINE, next })).toBe(
      SOURCE.replace("Last &amp; final.", "Last & final, edited."),
    )
  })

  test("places an inserted block between untouched blocks", () => {
    const next = editedBaseline("# Notes\n\n", "# Notes\n\nA new paragraph.\n\n")

    expect(keepUntouchedMarkdownBlocks({ source: SOURCE, baseline: BASELINE, next })).toBe(
      SOURCE.replace("# Notes ##\n\n", "# Notes ##\n\nA new paragraph.\n\n"),
    )
  })

  test("drops a deleted block and keeps the source gap of its untouched neighbours", () => {
    const next = editedBaseline("- first\n- second\n\n", "")

    expect(keepUntouchedMarkdownBlocks({ source: SOURCE, baseline: BASELINE, next })).toBe(
      SOURCE.replace("* first\n* second\n\n", ""),
    )
  })

  test("keeps a reference link and its definition after an unrelated edit", () => {
    const source = "Intro.\n\nSee [docs][d] here.\n\n[d]: https://x.com\n\nOutro"
    const baseline = "Intro.\n\nSee [docs](https://x.com) here.\n\n[d]: https://x.com\n\nOutro"
    const next = "Intro, edited.\n\nSee [docs](https://x.com) here.\n\n[d]: https://x.com\n\nOutro"

    expect(keepUntouchedMarkdownBlocks({ source, baseline, next })).toBe(
      "Intro, edited.\n\nSee [docs][d] here.\n\n[d]: https://x.com\n\nOutro",
    )
  })

  test("keeps a block whose formatting the editor would only respell", () => {
    const source = "**bold $x$ after** and a  \nbreak\n\nOther"
    const baseline = "**bold** $x$ **after** and a\\\nbreak\n\nOther"
    const next = "**bold** $x$ **after** and a\\\nbreak\n\nOther, edited"

    expect(keepUntouchedMarkdownBlocks({ source, baseline, next })).toBe(
      "**bold $x$ after** and a  \nbreak\n\nOther, edited",
    )
  })

  test("uses the edited block when only its formatting changed", () => {
    const source = "Plain words\n\nOther"
    const baseline = "Plain words\n\nOther"
    const next = "Plain **words**\n\nOther"

    expect(keepUntouchedMarkdownBlocks({ source, baseline, next })).toBe("Plain **words**\n\nOther")
  })

  test("falls back to the new text when kept blocks would merge with edited ones", () => {
    const source = "- a\n\n+ b"
    const baseline = "- a\n\n* b"
    const next = "- a\n\n* c"

    expect(keepUntouchedMarkdownBlocks({ source, baseline, next })).toBe("- a\n\n* c")
  })

  test("keeps repeated identical blocks in order", () => {
    const source = "Same\\_a\n\nSame\\_a\n\nEnd"
    const baseline = "Same\\_a\n\nSame\\_a\n\nEnd"
    const next = "Same\\_a\n\nMiddle\n\nSame\\_a\n\nEnd"

    expect(keepUntouchedMarkdownBlocks({ source, baseline, next })).toBe(
      "Same\\_a\n\nMiddle\n\nSame\\_a\n\nEnd",
    )
  })

  test("keeps a callout and an indented code block the user did not touch", () => {
    const source = "> [!note] T\n> body\nlazy\n\n    code\n\nEdit me"
    const baseline = "> [!note] T\n> body\n> lazy\n\n```\ncode\n```\n\nEdit me"
    const next = "> [!note] T\n> body\n> lazy\n\n```\ncode\n```\n\nEdited"

    expect(keepUntouchedMarkdownBlocks({ source, baseline, next })).toBe(
      "> [!note] T\n> body\nlazy\n\n    code\n\nEdited",
    )
  })
})
