import { describe, expect, test } from "bun:test"

import { getCoreToolPresentationDescriptor } from "../src/core-tool-presentations"
import {
  decodeToolPresentationSnapshot,
  defineToolPresentation,
  interruptToolPresentationSnapshot,
  resolveToolPresentationSnapshot,
  TOOL_PRESENTATION_PHASES,
} from "../src/tool-presentation"

function context(phase: "pending" | "running" | "completed" | "error") {
  return Object.assign(
    {
      toolID: "read",
      phase,
      input: {},
      detail: "App.tsx",
      metadata: {},
    },
    phase === "error" ? { error: "boom" } : undefined,
  )
}

describe("tool presentation contract", () => {
  test("resolves and runtime-validates every lifecycle phase", () => {
    const descriptor = getCoreToolPresentationDescriptor("read-file")
    expect(descriptor).toBeDefined()
    if (!descriptor) throw new Error("Missing read presentation descriptor")

    for (const phase of TOOL_PRESENTATION_PHASES) {
      const snapshot = resolveToolPresentationSnapshot(descriptor, context(phase))
      expect(decodeToolPresentationSnapshot(snapshot)).toEqual(snapshot)
      expect(snapshot.phase).toBe(phase)
      expect(snapshot.archetype).toBe("activity")
      if (snapshot.archetype !== "activity") throw new Error("Expected activity snapshot")
      expect(snapshot.icon).toBe("read")
      expect(snapshot.detail).toBe("App.tsx")
    }
  })

  test("keeps action identity stable when a target arrives late", () => {
    const descriptor = getCoreToolPresentationDescriptor("edit-file")
    expect(descriptor).toBeDefined()
    if (!descriptor) throw new Error("Missing edit presentation descriptor")

    const pending = resolveToolPresentationSnapshot(descriptor, {
      toolID: "edit",
      phase: "pending",
      input: {},
      metadata: {},
    })
    const running = resolveToolPresentationSnapshot(descriptor, {
      toolID: "edit",
      phase: "running",
      input: {},
      detail: "App.tsx",
      metadata: {},
    })

    expect(pending.archetype === "activity" ? pending.icon : undefined).toBe("edit")
    expect(running.archetype === "activity" ? running.icon : undefined).toBe("edit")
    expect("detail" in pending ? pending.detail : undefined).toBeUndefined()
    expect("detail" in running ? running.detail : undefined).toBe("App.tsx")
  })

  test("presents todo updates as transcript activity", () => {
    const descriptor = getCoreToolPresentationDescriptor("update-plan")
    expect(descriptor).toBeDefined()
    if (!descriptor) throw new Error("Missing todowrite presentation descriptor")

    const snapshot = resolveToolPresentationSnapshot(descriptor, {
      toolID: "todowrite",
      phase: "completed",
      input: { todos: [{ content: "Ship the dock", status: "completed" }] },
      metadata: {},
    })

    expect(snapshot.archetype).toBe("activity")
    if (snapshot.archetype !== "activity") throw new Error("Expected activity snapshot")
    expect(snapshot.layoutRole).toBe("activity")
    expect(snapshot.renderer).toBe("todo")
    expect(snapshot.archetype === "activity" ? snapshot.summary.label : undefined).toBe(
      "Updated tasks",
    )
  })

  test("preserves normalized file targets in patch presentations", () => {
    const descriptor = getCoreToolPresentationDescriptor("change-files")
    expect(descriptor).toBeDefined()
    if (!descriptor) throw new Error("Missing apply-patch presentation descriptor")

    const oneFile = resolveToolPresentationSnapshot(descriptor, {
      toolID: "apply_patch",
      phase: "completed",
      input: {},
      metadata: {},
      detail: "notes.md",
    })
    const twoFiles = resolveToolPresentationSnapshot(descriptor, {
      toolID: "apply_patch",
      phase: "completed",
      input: {},
      metadata: {},
      detail: "2 files",
    })

    expect("detail" in oneFile ? oneFile.detail : undefined).toBe("notes.md")
    expect("detail" in twoFiles ? twoFiles.detail : undefined).toBe("2 files")
  })

  test("authors resource presentation labels from normalized details", () => {
    const list = getCoreToolPresentationDescriptor("list-resources")
    const read = getCoreToolPresentationDescriptor("read-resource")
    expect(list).toBeDefined()
    expect(read).toBeDefined()
    if (!list || !read) throw new Error("Missing MCP resource presentation descriptors")

    expect(
      resolveToolPresentationSnapshot(list, {
        toolID: "list_mcp_resources",
        phase: "completed",
        input: {},
        detail: "docs",
        metadata: {},
      }),
    ).toMatchObject({
      archetype: "activity",
      action: "Listed MCP resources",
      detail: "docs",
      icon: "network",
    })
    expect(
      resolveToolPresentationSnapshot(read, {
        toolID: "read_mcp_resource",
        phase: "completed",
        input: {},
        detail: "docs://readme",
        metadata: {},
      }),
    ).toMatchObject({
      archetype: "activity",
      action: "Read MCP resource",
      detail: "docs://readme",
      icon: "read",
    })
  })

  test("turns permission denial, cancellation, and interruption into neutral outcomes", () => {
    const descriptor = getCoreToolPresentationDescriptor("read-file")
    expect(descriptor).toBeDefined()
    if (!descriptor) throw new Error("Missing read presentation descriptor")

    const denied = resolveToolPresentationSnapshot(descriptor, {
      toolID: "read",
      phase: "error",
      input: {},
      metadata: {},
      outcome: { type: "rejected" },
    })
    const interrupted = resolveToolPresentationSnapshot(descriptor, {
      toolID: "read",
      phase: "error",
      input: {},
      metadata: {},
      outcome: { type: "interrupted" },
    })

    const dismissed = resolveToolPresentationSnapshot(descriptor, {
      ...context("error"), outcome: { type: "dismissed" },
    })
    expect(dismissed.outcome).toEqual({ type: "neutral", reason: "cancelled" })
    expect(denied.archetype === "activity" ? denied.action : undefined).toBe("Permission denied")
    expect(denied.outcome).toEqual({ type: "neutral", reason: "permission-denied" })
    expect(interrupted.outcome).toEqual({ type: "neutral", reason: "interrupted" })
  })

  test("atomically interrupts an already-resolved active snapshot", () => {
    const descriptor = getCoreToolPresentationDescriptor("read-file")
    expect(descriptor).toBeDefined()
    if (!descriptor) throw new Error("Missing read presentation descriptor")

    const running = resolveToolPresentationSnapshot(descriptor, context("running"))
    const interrupted = interruptToolPresentationSnapshot(running)

    expect(decodeToolPresentationSnapshot(interrupted)).toEqual(interrupted)
    expect(interrupted).toMatchObject({
      archetype: "activity",
      phase: "error",
      action: "Interrupted",
      outcome: { type: "neutral", reason: "interrupted" },
      summary: { category: "read-files", label: "Interrupted" },
    })
    expect(interrupted).not.toHaveProperty("detail")
  })

  test("allows only named descriptor-declared silent outcomes", () => {
    const descriptor = defineToolPresentation({
      archetype: "inline-output",
      icon: "book",
      renderer: "full-text",
      layoutRole: "card-output",
      phases: {
        pending: { action: "Ingesting" },
        running: { action: "Ingesting" },
        completed: { action: "Ingested" },
        error: { action: "Failed to ingest" },
      },
      resolveSilentOutcome: () => "scoped-reading-fallback",
    })
    const snapshot = resolveToolPresentationSnapshot(descriptor, {
      toolID: "ingest_full_text",
      phase: "completed",
      input: {},
      metadata: {},
    })
    expect(snapshot.outcome).toEqual({
      type: "silent",
      reason: "scoped-reading-fallback",
    })
  })

  test("can keep active inline output in activity until completion", () => {
    const descriptor = defineToolPresentation({
      archetype: "inline-output",
      icon: "presentation",
      renderer: "bench-present",
      layoutRole: "compact-output",
      activeDisplay: "activity",
      phases: {
        pending: { action: "Preparing to present" },
        running: { action: "Presenting" },
        completed: { action: "Presented" },
        error: { action: "Failed to present" },
      },
    })
    const snapshot = resolveToolPresentationSnapshot(descriptor, {
      toolID: "bench_present",
      phase: "running",
      input: {},
      metadata: {},
    })

    expect(snapshot).toMatchObject({
      archetype: "inline-output",
      phase: "running",
      outcome: { type: "active" },
      activeDisplay: "activity",
    })
    expect(decodeToolPresentationSnapshot(snapshot)).toEqual(snapshot)
  })
})
