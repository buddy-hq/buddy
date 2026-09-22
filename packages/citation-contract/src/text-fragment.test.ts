import { describe, expect, test } from "bun:test"
import { citationTextFragmentUrl } from "./text-fragment"

describe("citation text fragment", () => {
  test("links a short quote with whole-word context around it", () => {
    expect(
      citationTextFragmentUrl({
        url: "https://example.com/biology#stages",
        excerpt: "to make sugar",
        selector: {
          version: 1,
          start: 32,
          end: 45,
          prefix: "sm uses light in photosynthesis ",
          suffix: " from carbon dioxide and water. ",
        },
      }),
    ).toBe(
      "https://example.com/biology#stages:~:text=light%20in%20photosynthesis-,to%20make%20sugar,-from%20carbon%20dioxide",
    )
  })

  test("links a long quote by its first and last words and replaces an old directive", () => {
    expect(
      citationTextFragmentUrl({
        url: "https://example.com/a#:~:text=old",
        excerpt: "Light-dependent reactions happen first, then the Calvin cycle builds sugar",
        selector: { version: 1, start: 0, end: 74, prefix: "", suffix: "." },
      }),
    ).toBe(
      "https://example.com/a#:~:text=Light%2Ddependent%20reactions%20happen%20first%2C,Calvin%20cycle%20builds%20sugar,-.",
    )
  })

  test("adds the fragment to a URL without one and escapes directive characters", () => {
    expect(
      citationTextFragmentUrl({
        url: "https://example.com/recipe?id=4",
        excerpt: "salt & pepper",
        selector: { version: 1, start: 0, end: 13, prefix: "", suffix: "" },
      }),
    ).toBe("https://example.com/recipe?id=4#:~:text=salt%20%26%20pepper")
  })
})
