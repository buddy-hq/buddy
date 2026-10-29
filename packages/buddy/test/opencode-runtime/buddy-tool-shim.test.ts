import { describe, expect, test } from "bun:test"
import { registerBuddyToolPresentationCatalog, getBuddyToolPresentationDescriptor } from "../../src/runtime/buddy-tool-presentation-catalog"
import { getCoreToolPresentationDescriptor } from "@buddy/transcript-contract/core-tool-presentations"
import { temporaryDirectory } from "../helpers/temporary-directory"

describe("Buddy tool registration", () => {
  test("isolates per-directory descriptors and returns clones", async () => {
    await using root = await temporaryDirectory()
    registerBuddyToolPresentationCatalog(root.path, [{ id: "probe", presentation: { archetype: "silent" } }])
    const other = getCoreToolPresentationDescriptor("read-file")
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
    expect(getBuddyToolPresentationDescriptor(root.path, "read")).toBeUndefined()
  })
})
