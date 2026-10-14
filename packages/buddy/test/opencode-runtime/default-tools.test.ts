import { test, expect } from "bun:test"
import { allBuddyPluginTools } from "../../src/opencode-runtime/buddy-tool-shim"
import { temporaryDirectory } from "../helpers/temporary-directory"

test("loads the complete Buddy feature catalog", async () => {
  await using root = await temporaryDirectory()
  const tools = await allBuddyPluginTools({ directory: root.path, getClient: async () => { throw new Error("No execution") } })
  expect(tools.some((tool) => tool.name === "imagegen")).toBe(true)
  expect(tools.every((tool) => tool.options?.codemode === false)).toBe(true)
})
