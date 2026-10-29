import { test, expect } from "bun:test"
import { ensureBuddyPluginTools, listBuddyTools } from "../helpers/tools"
import { temporaryDirectory } from "../helpers/temporary-directory"

test("loads the complete Buddy feature catalog", async () => {
  await using root = await temporaryDirectory()
  await using runtime = await ensureBuddyPluginTools(root.path)
  const buddyToolIDs = new Set((await listBuddyTools()).map((tool) => tool.id))
  const tools = (await runtime.listTools()).filter((tool) => buddyToolIDs.has(tool.name))
  expect(tools.some((tool) => tool.name === "imagegen")).toBe(true)
  expect(tools.every((tool) => tool.options?.codemode === false)).toBe(true)
})
