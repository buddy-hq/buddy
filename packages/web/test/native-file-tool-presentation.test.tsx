import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { getCoreToolPresentationDescriptor } from "@buddy/opencode-adapter/core-tool-presentations"
import {
  resolveToolPresentationSnapshot,
  type ToolPresentationPhase,
} from "@buddy/opencode-adapter/tool-presentation"

import {
  activityEntryLabel,
  createActivityEntry,
  resolveActivityHeader,
} from "../src/components/chat/tools/activity-row/entries"
import { resolveToolRenderer } from "../src/components/chat/tools/tool-renderer-resolver"
import type { MessagePart } from "../src/state/chat-types"
import { presentationMetadata } from "./tool-presentation-fixtures"

type NativeFileTool = "edit" | "write" | "apply_patch"

function nativeFilePart(tool: NativeFileTool, phase: ToolPresentationPhase): MessagePart {
  const descriptor = getCoreToolPresentationDescriptor(tool)
  if (!descriptor) throw new Error(`Missing ${tool} presentation descriptor`)

  const input =
    tool === "apply_patch"
      ? {
          patchText:
            "*** Begin Patch\n*** Update File: /workspace/existing.md\n@@\n-before\n+after\n*** End Patch",
        }
      : {
          filePath: "/workspace/existing.md",
          oldString: "before",
          newString: "after",
          content: "after",
        }
  const metadata = {
    files: [{ filePath: "/workspace/existing.md", relativePath: "existing.md", type: "update" }],
  }
  const presentation = resolveToolPresentationSnapshot(descriptor, {
    toolID: tool,
    phase,
    input,
    metadata: phase === "pending" || phase === "error" ? {} : metadata,
  })
  const base = {
    id: `part_${tool}_${phase}`,
    sessionID: "ses_native_file_labels",
    messageID: "msg_native_file_labels",
    type: "tool" as const,
    tool,
    callID: `call_${tool}_${phase}`,
    metadata: presentationMetadata(presentation),
  }

  switch (phase) {
    case "pending":
      return { ...base, state: { status: phase, input, raw: "{}" } }
    case "running":
      return { ...base, state: { status: phase, input, metadata, time: { start: 1 } } }
    case "completed":
      return {
        ...base,
        state: {
          status: phase,
          input,
          metadata,
          output: "ok",
          title: "existing.md",
          time: { start: 1, end: 2 },
        },
      }
    case "error":
      return {
        ...base,
        state: {
          status: phase,
          input,
          error: "File write failed",
          time: { start: 1, end: 2 },
        },
      }
  }
}

describe("native file tool presentation", () => {
  test.each(["edit", "write", "apply_patch"] as const)(
    "%s presents existing-file changes consistently in activity and direct rows",
    (tool) => {
      for (const { phase, action, summary } of [
        { phase: "pending", action: "Creating", summary: "Creating" },
        { phase: "running", action: "Creating", summary: "Creating" },
        { phase: "completed", action: "Created", summary: "Created" },
        { phase: "error", action: "Failed to create", summary: "Failed to create" },
      ] as const) {
        const entry = createActivityEntry(nativeFilePart(tool, phase))
        if (!entry || entry.kind !== "tool") throw new Error("Expected native file activity")
        const presentation = entry.presentation
        if (presentation.archetype !== "activity") throw new Error("Expected activity presentation")

        const targetAvailable =
          tool !== "apply_patch" || phase === "running" || phase === "completed"
        expect(activityEntryLabel(entry)).toBe(targetAvailable ? `${action} existing.md` : action)
        expect(presentation.summary).toEqual({ category: "edit-files", label: summary })

        if (phase !== "error") {
          expect(
            resolveActivityHeader({
              entries: [entry],
              busy: phase !== "completed",
              current: true,
              zeroEntryLabel: "Thinking",
            }).label,
          ).toBe(summary)
        }

        const row = resolveToolRenderer(presentation.renderer).card({
          part: entry.part,
          state: entry.state,
          info: entry.info,
          tool,
        })
        const markup = renderToStaticMarkup(<>{row}</>)
        expect(markup).toContain(action)
        if (targetAvailable) expect(markup).toContain("existing.md")
      }
    },
  )

  test("groups completed native file tools under one Created summary", () => {
    const entries = (["edit", "write", "apply_patch"] as const).flatMap(
      (tool) => createActivityEntry(nativeFilePart(tool, "completed")) ?? [],
    )
    const header = resolveActivityHeader({
      entries,
      busy: false,
      current: false,
      zeroEntryLabel: "Thinking",
    })

    expect(header.label).toBe("Created")
    expect(header.identity).toBe("activity:edit-files")
    expect(header.shimmer).toBe(false)
  })
})
