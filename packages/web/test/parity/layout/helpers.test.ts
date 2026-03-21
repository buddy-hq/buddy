import { describe, expect, test } from "bun:test"
import {
  displayName,
  errorMessage,
  getDraggableId,
  syncWorkspaceOrder,
  workspaceKey,
} from "../../../src/components/layout/sidebar-helpers"

describe("layout helpers parity", () => {
  test("normalizes trailing separators in workspace keys", () => {
    expect(workspaceKey("/tmp/demo///")).toBe("/tmp/demo")
    expect(workspaceKey("C:\\tmp\\demo\\\\")).toBe("C:\\tmp\\demo")
  })

  test("preserves drive and filesystem roots in workspace keys", () => {
    expect(workspaceKey("/")).toBe("/")
    expect(workspaceKey("///")).toBe("/")
    expect(workspaceKey("C:\\")).toBe("C:\\")
    expect(workspaceKey("C:\\\\\\")).toBe("C:\\")
    expect(workspaceKey("C:///")).toBe("C:/")
  })

  test("keeps local workspace first while preserving known order", () => {
    const result = syncWorkspaceOrder("/root", ["/root", "/b", "/c"], ["/root", "/c", "/a", "/b"])
    expect(result).toEqual(["/root", "/c", "/b"])
  })

  test("extracts draggable id safely", () => {
    expect(getDraggableId({ draggable: { id: "item-1" } })).toBe("item-1")
    expect(getDraggableId({ draggable: { id: 42 } })).toBeUndefined()
    expect(getDraggableId(null)).toBeUndefined()
  })

  test("formats fallback project display name", () => {
    expect(displayName({ worktree: "/tmp/app" })).toBe("app")
    expect(displayName({ worktree: "/tmp/app", name: "My App" })).toBe("My App")
  })

  test("extracts api error message and fallback", () => {
    expect(errorMessage({ data: { message: "boom" } }, "fallback")).toBe("boom")
    expect(errorMessage(new Error("broken"), "fallback")).toBe("broken")
    expect(errorMessage("unknown", "fallback")).toBe("fallback")
  })
})
