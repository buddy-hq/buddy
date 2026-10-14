import { describe, expect, test } from "bun:test"
import z from "zod"
import { createBuddyTool } from "../../src/learning/runtime/create-buddy-tool"
import { buddyToolToToolInfo } from "../../src/opencode-runtime/buddy-tool-shim"
import { registerBuddyToolPresentationCatalog, getBuddyToolPresentationDescriptor } from "../../src/opencode-runtime/buddy-tool-presentation-catalog"
import { temporaryDirectory } from "../helpers/temporary-directory"

describe("Buddy tool registration", () => {
  test("advertises normalized input while deferring argument normalization to the authoring API", () => {
    const tool = createBuddyTool({
      id: "normalized_probe", description: "Accept an input alias.", presentation: { archetype: "silent" },
      parameters: z.object({ query: z.string(), count: z.number().nullable() }),
      normalizeInput: () => ({ query: "normalized", count: null }),
      execute: (input) => ({ title: "Normalized", output: input.query, metadata: {} }),
    })
    const info = buddyToolToToolInfo(tool, { directory: "/fixture", getClient: async () => { throw new Error("No execution") } })
    expect(info.options?.codemode).toBe(false)
    expect(info.input).toMatchObject({ "~standard": { version: 1, vendor: "buddy" } })
    expect(tool.jsonSchema.properties).toMatchObject({ query: { type: "string" }, count: { type: ["number", "null"] } })
  })

  test("isolates per-directory descriptors and returns clones", async () => {
    await using root = await temporaryDirectory()
    registerBuddyToolPresentationCatalog(root.path, [{ id: "probe", presentation: { archetype: "silent" } }])
    const other = getBuddyToolPresentationDescriptor(root.path, "read")
    if (!other) throw new Error("Missing core descriptor")
    registerBuddyToolPresentationCatalog(`${root.path}/other`, [{ id: "probe", presentation: other }])
    const descriptor = getBuddyToolPresentationDescriptor(root.path, "probe")
    expect(descriptor).toEqual({ archetype: "silent" })
    expect(descriptor).not.toBe(getBuddyToolPresentationDescriptor(root.path, "probe"))
    expect(getBuddyToolPresentationDescriptor(root.path, "probe")).toEqual({ archetype: "silent" })
    expect(getBuddyToolPresentationDescriptor(`${root.path}/other`, "probe")).toEqual(other)
    const second = getBuddyToolPresentationDescriptor(`${root.path}/other`, "probe")
    if (second?.archetype === "activity") second.icon = "search"
    expect(getBuddyToolPresentationDescriptor(`${root.path}/other`, "probe")).toEqual(other)
    expect(getBuddyToolPresentationDescriptor(root.path, "read")?.archetype).toBe("activity")
  })
})
