import { describe, expect, test } from "bun:test"

import {
  CORE_TOOL_PRESENTATION_IDS,
  coreToolPresentationCatalog,
  getCoreToolPresentationDescriptor,
} from "../src/core-tool-presentations"
import type { MessageV2 } from "../src/message"
import { withToolPresentationOnPart } from "../src/session-tool-presentation"
import {
  decodeToolPresentationSnapshot,
  defineToolPresentation,
  interruptToolPresentationSnapshot,
  resolveToolPresentationSnapshot,
  TOOL_PRESENTATION_PHASES,
} from "../src/tool-presentation"

function context(phase: "pending" | "running" | "completed" | "error") {
  return {
    toolID: "read",
    phase,
    input: { filePath: "/workspace/App.tsx" },
    metadata: {},
    ...(phase === "error" ? { error: "boom" } : {}),
  }
}

describe("tool presentation contract", () => {
  test("catalog covers every supported core tool ID", () => {
    expect(Object.keys(coreToolPresentationCatalog()).toSorted()).toEqual(
      [...CORE_TOOL_PRESENTATION_IDS, "codesearch", "list", "todoread"].toSorted(),
    )
    for (const toolID of CORE_TOOL_PRESENTATION_IDS) {
      expect(getCoreToolPresentationDescriptor(toolID)).toBeDefined()
    }
  })

  test("resolves and runtime-validates every lifecycle phase", () => {
    const descriptor = getCoreToolPresentationDescriptor("read")
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
    const descriptor = getCoreToolPresentationDescriptor("edit")
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
      input: { filePath: "/workspace/App.tsx" },
      metadata: {},
    })

    expect(pending.archetype === "activity" ? pending.icon : undefined).toBe("edit")
    expect(running.archetype === "activity" ? running.icon : undefined).toBe("edit")
    expect("detail" in pending ? pending.detail : undefined).toBeUndefined()
    expect("detail" in running ? running.detail : undefined).toBe("App.tsx")
  })

  test("resolves apply-patch targets from authoritative tool metadata", () => {
    const descriptor = getCoreToolPresentationDescriptor("apply_patch")
    expect(descriptor).toBeDefined()
    if (!descriptor) throw new Error("Missing apply-patch presentation descriptor")

    const oneFile = resolveToolPresentationSnapshot(descriptor, {
      toolID: "apply_patch",
      phase: "completed",
      input: {},
      metadata: {
        files: [{ filePath: "/workspace/notes.md", relativePath: "notes.md" }],
      },
    })
    const twoFiles = resolveToolPresentationSnapshot(descriptor, {
      toolID: "apply_patch",
      phase: "completed",
      input: {},
      metadata: {
        files: [
          { filePath: "/workspace/notes.md", relativePath: "notes.md" },
          { filePath: "/workspace/tasks.md", relativePath: "tasks.md" },
        ],
      },
    })

    expect("detail" in oneFile ? oneFile.detail : undefined).toBe("notes.md")
    expect("detail" in twoFiles ? twoFiles.detail : undefined).toBe("2 files")
  })

  test("authors presentations for vendor MCP resource tools", () => {
    const list = getCoreToolPresentationDescriptor("list_mcp_resources")
    const read = getCoreToolPresentationDescriptor("read_mcp_resource")
    expect(list).toBeDefined()
    expect(read).toBeDefined()
    if (!list || !read) throw new Error("Missing MCP resource presentation descriptors")

    expect(
      resolveToolPresentationSnapshot(list, {
        toolID: "list_mcp_resources",
        phase: "completed",
        input: { server: "docs" },
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
        input: { server: "docs", uri: "docs://readme" },
        metadata: {},
      }),
    ).toMatchObject({
      archetype: "activity",
      action: "Read MCP resource",
      detail: "docs://readme",
      icon: "read",
    })
  })

  test("keeps runtime-defined MCP tool calls visible without exposing their raw IDs", () => {
    const toolID = "runtime-server_private_snake_case_tool"
    const pending: MessageV2.ToolPart = {
      id: "part_mcp_pending",
      sessionID: "session_mcp",
      messageID: "message_mcp",
      type: "tool",
      callID: "call_mcp_pending",
      tool: toolID,
      state: {
        status: "pending",
        input: { query: "Buddy" },
        raw: "{}",
      },
    }
    const failed: MessageV2.ToolPart = {
      ...pending,
      id: "part_mcp_failed",
      callID: "call_mcp_failed",
      state: {
        status: "error",
        input: { query: "Buddy" },
        error: "MCP tool returned an error",
        time: { start: 1, end: 2 },
      },
    }

    const enrichedPending = withToolPresentationOnPart(pending, "/tmp/runtime-mcp")
    const enrichedFailed = withToolPresentationOnPart(failed, "/tmp/runtime-mcp")

    expect(enrichedPending.metadata).toMatchObject({
      buddy: {
        presentation: {
          archetype: "activity",
          phase: "pending",
          action: "Preparing connected tool",
          outcome: { type: "active" },
        },
      },
    })
    expect(enrichedFailed.metadata).toMatchObject({
      buddy: {
        presentation: {
          archetype: "activity",
          phase: "error",
          action: "Failed to run connected tool",
          outcome: { type: "failure" },
        },
      },
    })
    expect(JSON.stringify(enrichedPending.metadata)).not.toContain(toolID)
    expect(JSON.stringify(enrichedFailed.metadata)).not.toContain(toolID)
  })

  test("turns permission denial, cancellation, and interruption into neutral outcomes", () => {
    const descriptor = getCoreToolPresentationDescriptor("read")
    expect(descriptor).toBeDefined()
    if (!descriptor) throw new Error("Missing read presentation descriptor")

    const denied = resolveToolPresentationSnapshot(descriptor, {
      toolID: "read",
      phase: "error",
      input: {},
      metadata: {},
      error: "The user rejected permission to use this specific tool call: read",
    })
    const interrupted = resolveToolPresentationSnapshot(descriptor, {
      toolID: "read",
      phase: "error",
      input: {},
      metadata: { interrupted: true },
      error: "stopped",
    })

    expect(denied.archetype === "activity" ? denied.action : undefined).toBe("Permission denied")
    expect(denied.outcome).toEqual({ type: "neutral", reason: "permission-denied" })
    expect(interrupted.outcome).toEqual({ type: "neutral", reason: "interrupted" })
  })

  test("atomically interrupts an already-resolved active snapshot", () => {
    const descriptor = getCoreToolPresentationDescriptor("read")
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
})
