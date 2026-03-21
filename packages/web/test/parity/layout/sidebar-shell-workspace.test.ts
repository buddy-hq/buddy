import { describe, expect, test } from "bun:test"
import { sidebarExpanded } from "../../../src/components/layout/sidebar-shell-helpers"
import { workspaceOpenState } from "../../../src/components/layout/sidebar-workspace-helpers"

describe("sidebarExpanded", () => {
  test("expands on mobile regardless of desktop open state", () => {
    expect(sidebarExpanded(true, false)).toBe(true)
  })

  test("follows desktop open state when not mobile", () => {
    expect(sidebarExpanded(false, true)).toBe(true)
    expect(sidebarExpanded(false, false)).toBe(false)
  })
})

describe("workspaceOpenState", () => {
  test("defaults to local workspace open", () => {
    expect(workspaceOpenState({}, "/tmp/root", true)).toBe(true)
  })

  test("uses persisted expansion state when present", () => {
    expect(workspaceOpenState({ "/tmp/root": false }, "/tmp/root", true)).toBe(false)
    expect(workspaceOpenState({ "/tmp/branch": true }, "/tmp/branch", false)).toBe(true)
  })
})
