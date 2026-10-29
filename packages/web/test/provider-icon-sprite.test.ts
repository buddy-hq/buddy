import { expect, test } from "bun:test"
import { iconNames } from "@buddy/ui/provider-icons"

test("every declared provider icon has a sprite symbol", async () => {
  const sprite = await Bun.file(
    new URL("../../ui/src/provider-icons/opencode/sprite.svg", import.meta.url),
  ).text()
  const document = new DOMParser().parseFromString(sprite, "image/svg+xml")
  const symbolIDs = new Set(Array.from(document.querySelectorAll("symbol"), (symbol) => symbol.id))

  expect(iconNames.filter((id) => !symbolIDs.has(id))).toEqual([])
})
