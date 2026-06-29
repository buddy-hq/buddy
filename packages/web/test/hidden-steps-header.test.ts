import { describe, expect, test } from "bun:test"
import { isValidElement } from "react"

import { builtInTools } from "../src/components/chat/tools/built-in-tool-renderers"
import {
  createFileToolIcon,
  FOLDER_TOOL_ICON,
  resolveFileToolFileName,
  resolveFileToolIcon,
  resolveSettledFileToolIcon,
} from "../src/components/chat/tools/file-tool-icon"
import {
  ABSTRACTED_WORKING_LABELS,
  createHiddenStepsEntry,
  getHiddenStepsEntryLabel,
  HIDDEN_STEPS_REASONING_ICON,
  resolveHiddenStepsHeader,
} from "../src/components/chat/tools/hidden-steps/entries"
import {
  humanizeSkillDisplayName,
  isSkillReferencePath,
  resolveSkillReferenceInfo,
  resolveSkillReference,
} from "../src/components/chat/tools/skill-reference"
import { SKILL_TOOL_ICON } from "../src/components/chat/tools/tool-icons"
import type { MessagePart } from "../src/state/chat-types"
import type { ToolState } from "../src/components/chat/tools/types"

function readPart(input: {
  id: string
  filePath?: string
  status: ToolState["status"]
  time?: { start: number; end?: number }
}): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    tool: "read",
    callID: `call_${input.id}`,
    state: {
      status: input.status,
      input: input.filePath ? { filePath: input.filePath } : {},
      metadata: {},
      attachments: [],
      time: input.time ?? { start: 1 },
    },
  }
}

function readDirectoryPart(input: {
  id: string
  filePath: string
  status: ToolState["status"]
  time?: { start: number; end?: number }
}): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    tool: "read",
    callID: `call_${input.id}`,
    state: {
      status: input.status,
      input: { filePath: input.filePath },
      metadata: {
        display: {
          type: "directory",
          path: input.filePath,
          entries: [],
          offset: 1,
          totalEntries: 0,
          truncated: false,
        },
      },
      attachments: [],
      time: input.time ?? { start: 1 },
    },
  }
}

function bashPart(status: ToolState["status"]): MessagePart {
  return {
    id: "prt_bash",
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    tool: "bash",
    callID: "call_bash",
    state: {
      status,
      input: { command: "bun test", description: "Run tests" },
      metadata: {},
      attachments: [],
      time: { start: 1 },
    },
  }
}

function directFileMutationPart(input: {
  id: string
  tool: "edit" | "write"
  filePath?: string
  status: ToolState["status"]
}): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    tool: input.tool,
    callID: `call_${input.id}`,
    state: {
      status: input.status,
      input: input.filePath ? { filePath: input.filePath } : {},
      metadata: {},
      attachments: [],
    },
  }
}

function reasoningPart(input: { id: string; durationMs?: number; text?: string }): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "reasoning",
    text: input.text ?? "",
    time:
      input.durationMs === undefined
        ? { start: 1 }
        : {
            start: 1,
            end: 1 + input.durationMs,
          },
  }
}

function grepPart(status: ToolState["status"]): MessagePart {
  return {
    id: "prt_grep",
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    tool: "grep",
    callID: "call_grep",
    state: {
      status,
      input: { pattern: "foo" },
      metadata: {},
      attachments: [],
      time: { start: 1 },
    },
  }
}

function applyPatchPart(input: {
  status: ToolState["status"]
  files?: ToolState["metadata"]["files"]
}): MessagePart {
  return {
    id: "prt_patch",
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    tool: "apply_patch",
    callID: "call_patch",
    state: {
      status: input.status,
      input: {},
      metadata: { files: input.files ?? [] },
      attachments: [],
      time: { start: 1 },
    },
  }
}

function whiteboardPart(input: { status: ToolState["status"] }): MessagePart {
  return {
    id: "prt_whiteboard",
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    tool: "whiteboard_create_view",
    callID: "call_whiteboard",
    state: {
      status: input.status,
      input: {},
      metadata: {},
      attachments: [],
      time: { start: 1, end: input.status === "running" ? undefined : 2 },
      output: input.status === "completed" ? "updated" : undefined,
    },
  }
}

function invalidToolPart(): MessagePart {
  return {
    id: "prt_invalid",
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    tool: "invalid",
    callID: "call_invalid",
    state: {
      status: "completed",
      input: { tool: "html_widget", error: "Invalid tool input" },
      metadata: {},
      attachments: [],
      output: "The arguments provided to the tool are invalid: Invalid tool input",
      title: "Invalid Tool",
      time: { start: 1, end: 2 },
    },
  }
}

function erroredToolPart(): MessagePart {
  return {
    id: "prt_error",
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    tool: "bash",
    callID: "call_error",
    state: {
      status: "error",
      input: { command: "exit 1" },
      metadata: {},
      attachments: [],
      error: "Command failed",
      time: { start: 1, end: 2 },
    },
  }
}

function skillPart(input: { id: string; name: string; status: ToolState["status"] }): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_test",
    messageID: "msg_test",
    type: "tool",
    tool: "skill",
    callID: `call_${input.id}`,
    state: {
      status: input.status,
      input: { name: input.name },
      metadata: { name: input.name },
      attachments: [],
      output: "",
      time: { start: 1, end: 2 },
    },
  }
}

function entriesFromParts(parts: MessagePart[]) {
  return parts.map((part) => createHiddenStepsEntry(part))
}

describe("resolveFileToolFileName", () => {
  test("returns basename from full workspace path", () => {
    const state: ToolState = {
      status: "running",
      input: { filePath: "/workspace/packages/web/src/App.tsx" },
      metadata: {},
      attachments: [],
    }
    expect(resolveFileToolFileName("read", state, { title: "Read" })).toBe("App.tsx")
  })
})

describe("isSkillReferencePath", () => {
  test("detects skill files and references by path segments", () => {
    expect(isSkillReferencePath("/workspace/.agents/skills/react-best-practices/SKILL.md")).toBe(
      true,
    )
    expect(
      isSkillReferencePath(
        "/workspace/packages/buddy/src/learning/features/foo/skills/bar/references/guide.md",
      ),
    ).toBe(true)
    expect(isSkillReferencePath("/workspace/packages/web/src/App.tsx")).toBe(false)
  })

  test("does not classify skill collection directories as individual skills", () => {
    expect(isSkillReferencePath("/home/.buddy/skills/library")).toBe(false)
    expect(isSkillReferencePath("/home/.buddy/skills/.system")).toBe(false)
  })
})

describe("resolveSkillReference", () => {
  test("humanizes names and strips extensions", () => {
    expect(humanizeSkillDisplayName("textbooks-and-board.md")).toBe("Textbooks And Board")
    expect(
      resolveSkillReference(
        "/workspace/.agents/skills/react-best-practices/references/textbooks-and-board.md",
      ),
    ).toMatchObject({
      displayName: "Textbooks And Board",
    })
    expect(
      resolveSkillReference("/workspace/.agents/skills/react-best-practices/SKILL.md"),
    ).toMatchObject({
      displayName: "React Best Practices",
      skillName: "React Best Practices",
    })
    expect(
      resolveSkillReference(
        "/home/.buddy/skills/.system/buddy-pedagogy-explanation/references/guide.md",
      ),
    ).toMatchObject({
      displayName: "Guide",
      skillName: "Buddy Pedagogy Explanation",
    })
  })
})

describe("resolveSkillReferenceInfo", () => {
  test("recovers skill context from classified tool info", () => {
    expect(
      resolveSkillReferenceInfo({
        title: "Referred",
        subtitle: "Guided Practice Gradual Release",
        detail: "Teaching Models",
      }),
    ).toMatchObject({
      displayName: "Guided Practice Gradual Release",
      skillName: "Teaching Models",
    })
  })
})

describe("resolveFileToolIcon", () => {
  test("returns distinct renderers for different extensions", () => {
    const tsState: ToolState = {
      status: "completed",
      input: { filePath: "src/App.tsx" },
      metadata: {},
      attachments: [],
    }
    const mdState: ToolState = {
      status: "completed",
      input: { filePath: "README.md" },
      metadata: {},
      attachments: [],
    }

    const tsIcon = resolveFileToolIcon("read", tsState, { title: "Read", subtitle: "App.tsx" })
    const mdIcon = resolveFileToolIcon("read", mdState, { title: "Read", subtitle: "README.md" })

    expect(tsIcon).toBeDefined()
    expect(mdIcon).toBeDefined()
    expect(tsIcon).not.toBe(mdIcon)

    const tsNode = tsIcon?.("size-3.5")
    const mdNode = mdIcon?.("size-3.5")
    expect(tsNode).toBeDefined()
    expect(mdNode).toBeDefined()
    expect(tsNode).not.toEqual(mdNode)
  })

  test("createFileToolIcon returns a renderer function", () => {
    const icon = createFileToolIcon("App.tsx")
    const node = icon("size-3.5")
    expect(isValidElement(node)).toBe(true)
  })

  test("returns the skill icon for reads inside skill paths", () => {
    const state: ToolState = {
      status: "completed",
      input: {
        filePath: "/workspace/.agents/skills/react-best-practices/references/rendering.md",
      },
      metadata: {},
      attachments: [],
    }

    expect(resolveFileToolIcon("read", state, { title: "Read" })).toBe(SKILL_TOOL_ICON)
    expect(
      resolveSettledFileToolIcon("read", state, { title: "Read" }, builtInTools.read.icon),
    ).toBe(SKILL_TOOL_ICON)
  })

  test("returns the skill icon for classified references even without path metadata", () => {
    const state: ToolState = {
      status: "completed",
      input: {},
      metadata: {},
      attachments: [],
    }

    expect(
      resolveFileToolIcon("read", state, { title: "Referred", subtitle: "Repositories" }),
    ).toBe(SKILL_TOOL_ICON)
  })

  test("returns the folder icon for read directory metadata", () => {
    const state: ToolState = {
      status: "completed",
      input: { filePath: "/workspace/packages/web" },
      metadata: {
        display: {
          type: "directory",
          path: "/workspace/packages/web",
        },
      },
      attachments: [],
    }

    expect(resolveFileToolIcon("read", state, { title: "Read", subtitle: "web" })).toBe(
      FOLDER_TOOL_ICON,
    )
    expect(
      resolveSettledFileToolIcon("read", state, { title: "Read" }, builtInTools.read.icon),
    ).toBe(FOLDER_TOOL_ICON)
  })
})

describe("resolveHiddenStepsHeader", () => {
  test("active read shows Reading basename with throttle flag", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_1",
        filePath: "/workspace/App.tsx",
        status: "running",
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Reading App.tsx")
    expect(header.throttleFileTools).toBe(true)
    expect(header.fileName).toBe("App.tsx")
    expect(header.icon).toBeUndefined()
  })

  test("active read directory uses Exploring label and folder icon", () => {
    const entries = entriesFromParts([
      readDirectoryPart({
        id: "read_dir_1",
        filePath: "/workspace/packages/web",
        status: "running",
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Exploring: web")
    expect(header.throttleFileTools).toBe(true)
    expect(header.fileName).toBe("web")
    expect(header.verb).toBe("Exploring:")
    expect(header.icon).toBe(FOLDER_TOOL_ICON)
    const entry = entries[0]
    expect(entry).toBeDefined()
    if (!entry) throw new Error("Expected read directory entry")
    expect(getHiddenStepsEntryLabel(entry)).toBe("Exploring: web")
  })

  test("busy gap between reads holds basename not count summary", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_1",
        filePath: "/workspace/App.tsx",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      readPart({
        id: "read_2",
        filePath: "/workspace/Card.tsx",
        status: "completed",
        time: { start: 2, end: 3 },
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Reading Card.tsx")
    expect(header.verb).toBe("Reading")
    expect(header.throttleFileTools).toBe(true)
    expect(header.fileName).toBe("Card.tsx")
    expect(header.label).not.toContain("Read 2")
  })

  test("busy gap after edit holds Editing verb with basename", () => {
    const entries = entriesFromParts([
      directFileMutationPart({
        id: "edit_1",
        tool: "edit",
        filePath: "/workspace/App.tsx",
        status: "completed",
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Editing App.tsx")
    expect(header.verb).toBe("Editing")
  })

  test("active read without path does not reuse the previous basename", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_1",
        filePath: "/workspace/App.tsx",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      readPart({
        id: "read_2",
        status: "running",
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Reading")
    expect(header.fileName).toBeUndefined()
  })

  test("active read without path does not reuse the previous skill reference", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_skill_1",
        filePath:
          "/workspace/.agents/skills/react-best-practices/references/textbooks-and-board.md",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      readPart({
        id: "read_2",
        status: "running",
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Reading")
    expect(header.icon).toBeUndefined()
    expect(header.fileName).toBeUndefined()
    expect(header.verb).toBe("Reading")
  })

  test("active write without path does not reuse the previous explored target", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_template",
        filePath: "/workspace/.agents/skills/concept-diagrams/references/template.md",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      directFileMutationPart({
        id: "write_without_path",
        tool: "write",
        status: "running",
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Editing")
    expect(header.fileName).toBeUndefined()
    expect(header.label).not.toContain("Template")
  })

  test("active skill reference uses reference wording and humanized name", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_skill_active",
        filePath:
          "/workspace/.agents/skills/react-best-practices/references/textbooks-and-board.md",
        status: "running",
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Using Reference Textbooks And Board")
    expect(header.icon).toBe(SKILL_TOOL_ICON)
    expect(header.fileName).toBe("Textbooks And Board")
    expect(header.verb).toBe("Using Reference")
    expect(header.throttleFileTools).toBe(true)
  })

  test("active grep after read uses grep header not stale read basename", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_1",
        filePath: "/workspace/App.tsx",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      grepPart("running"),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.throttleFileTools).toBeFalsy()
    expect(header.label).not.toBe("Reading App.tsx")
    expect(header.label).not.toBe("App.tsx")
  })

  test("command titles never include the full command", () => {
    const activeEntry = createHiddenStepsEntry(bashPart("running"))
    const settledEntry = createHiddenStepsEntry(bashPart("completed"))

    expect(getHiddenStepsEntryLabel(activeEntry)).toBe("Running command")
    expect(getHiddenStepsEntryLabel(settledEntry)).toBe("Ran command")
    expect(getHiddenStepsEntryLabel(activeEntry)).not.toContain("bun test")
    expect(getHiddenStepsEntryLabel(settledEntry)).not.toContain("bun test")
  })

  test("gap after bash does not hold read basename", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_1",
        filePath: "/workspace/App.tsx",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      bashPart("completed"),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.throttleFileTools).toBeFalsy()
    expect(ABSTRACTED_WORKING_LABELS.some((label) => label === header.label)).toBe(true)
    expect(header.icon).toBe(HIDDEN_STEPS_REASONING_ICON)
    expect(header.shimmer).toBe(true)
  })

  test("completed entries in an older live-turn group keep their settled summary", () => {
    const entries = entriesFromParts([bashPart("completed")])

    const header = resolveHiddenStepsHeader(entries, true, false)

    expect(header.label).toBe("Ran 1 command")
    expect(header.shimmer).toBeFalsy()
  })

  test("burst boundary read bash read does not hold App.tsx from before bash", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_1",
        filePath: "/workspace/App.tsx",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      bashPart("completed"),
      readPart({
        id: "read_2",
        status: "running",
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Reading")
    expect(header.fileName).toBeUndefined()
  })

  test("completed multi-file patch uses the shared editing label", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_1",
        filePath: "/workspace/App.tsx",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      applyPatchPart({
        status: "completed",
        files: [
          { filePath: "/workspace/a.ts", relativePath: "a.ts" },
          { filePath: "/workspace/b.ts", relativePath: "b.ts" },
        ],
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Editing 2 files")
    expect(header.fileName).toBeUndefined()
  })

  test("active legacy whiteboard tool uses fallback running label", () => {
    const entries = entriesFromParts([whiteboardPart({ status: "running" })])

    const header = resolveHiddenStepsHeader(entries, true)
    expect(header.label).toBe("Updating Whiteboard")
    expect(getHiddenStepsEntryLabel(entries[0])).toBe("Updating Whiteboard")
  })

  test("settled edit, write, and patch tools share one edited summary", () => {
    const entries = entriesFromParts([
      directFileMutationPart({
        id: "edit_1",
        tool: "edit",
        filePath: "/workspace/helper.rb",
        status: "completed",
      }),
      directFileMutationPart({
        id: "write_2",
        tool: "write",
        filePath: "/workspace/other.rb",
        status: "completed",
      }),
      applyPatchPart({
        status: "completed",
        files: [{ filePath: "/workspace/final.rb", relativePath: "final.rb" }],
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, false)
    expect(header.label).toBe("Edited 3 files")
    expect(header.throttleFileTools).toBe(false)
    expect(header.label).not.toBe("Editing helper.rb")
  })

  test("error and invalid entries never contribute to the settled title", () => {
    const entries = entriesFromParts([
      directFileMutationPart({
        id: "edit_before_invalid",
        tool: "edit",
        filePath: "/workspace/helper.rb",
        status: "completed",
      }),
      invalidToolPart(),
      erroredToolPart(),
      reasoningPart({ id: "reasoning_after_invalid", durationMs: 2_000 }),
    ])

    const header = resolveHiddenStepsHeader(entries, false)

    expect(header.label).toBe("Edited 1 file · Thought for 2s")
    expect(header.label).not.toContain("Invalid")
  })

  test("settled legacy whiteboard tool uses fallback settled label", () => {
    const entries = entriesFromParts([whiteboardPart({ status: "completed" })])

    const header = resolveHiddenStepsHeader(entries, false)
    expect(header.label).toBe("Updated Whiteboard")
    expect(getHiddenStepsEntryLabel(entries[0])).toBe("Updated Whiteboard")
    expect(header.label).not.toBe("whiteboard_create_view")
  })

  test("settled reasoning-only group uses panda icon", () => {
    const entries = entriesFromParts([reasoningPart({ id: "reason_1", durationMs: 2_000 })])

    const header = resolveHiddenStepsHeader(entries, false)
    expect(header.label).toBe("Thought for 2s")
    expect(header.icon).toBe(HIDDEN_STEPS_REASONING_ICON)
  })

  test("settled reasoning row prefers duration over extracted heading", () => {
    const settledEntries = entriesFromParts([
      reasoningPart({
        id: "reason_heading_settled",
        durationMs: 34_000,
        text: '# Frame 1: Orientation / "What is Bugeera?"',
      }),
    ])
    const activeEntries = entriesFromParts([
      reasoningPart({
        id: "reason_heading_active",
        text: '# Frame 1: Orientation / "What is Bugeera?"',
      }),
    ])

    expect(getHiddenStepsEntryLabel(settledEntries[0])).toBe("Thought for 34s")
    expect(resolveHiddenStepsHeader(settledEntries, false).label).toBe("Thought for 34s")
    expect(getHiddenStepsEntryLabel(activeEntries[0])).toBe(
      'Frame 1: Orientation / "What is Bugeera?"',
    )
  })

  test("active reasoning titles ignore non-heading markdown", () => {
    const boldEntries = entriesFromParts([
      reasoningPart({
        id: "reason_bold_label",
        text: "**Working through options**\n\n- Check the current state\n- Compare alternatives",
      }),
    ])
    const ruleEntries = entriesFromParts([
      reasoningPart({
        id: "reason_rule_label",
        text: "Working through options\n---\n- Check the current state",
      }),
    ])

    expect(getHiddenStepsEntryLabel(boldEntries[0])).toBe("Thinking")
    expect(resolveHiddenStepsHeader(boldEntries, true).label).toBe("Thinking")
    expect(getHiddenStepsEntryLabel(ruleEntries[0])).toBe("Thinking")
    expect(resolveHiddenStepsHeader(ruleEntries, true).label).toBe("Thinking")
  })

  test("settled read group uses generic read icon not file-type icon", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_1",
        filePath: "/workspace/App.tsx",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      readPart({
        id: "read_2",
        filePath: "/workspace/Card.tsx",
        status: "completed",
        time: { start: 2, end: 3 },
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, false)
    const fileTypeIcon = resolveFileToolIcon(
      "read",
      {
        status: "completed",
        input: { filePath: "/workspace/App.tsx" },
        metadata: {},
        attachments: [],
      },
      { title: "Read", subtitle: "App.tsx" },
    )

    expect(header.label).toBe("Read 2 files")
    expect(header.icon).toBe(builtInTools.read.icon)
    expect(header.icon).not.toBe(fileTypeIcon)
    expect(header.throttleFileTools).toBe(false)
  })

  test("settled read directory group uses Explored label and folder icon", () => {
    const entries = entriesFromParts([
      readDirectoryPart({
        id: "read_dir_1",
        filePath: "/workspace/packages/web",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, false)
    expect(header.label).toBe("Explored: web")
    const entry = entries[0]
    expect(entry).toBeDefined()
    if (!entry) throw new Error("Expected read directory entry")
    expect(getHiddenStepsEntryLabel(entry)).toBe("Explored: web")
    expect(header.icon).toBe(FOLDER_TOOL_ICON)
    expect(header.throttleFileTools).toBe(false)
  })

  test("settled multiple read directories use Explored count summary", () => {
    const entries = entriesFromParts([
      readDirectoryPart({
        id: "read_dir_1",
        filePath: "/workspace/packages/web",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      readDirectoryPart({
        id: "read_dir_2",
        filePath: "/workspace/packages/buddy",
        status: "completed",
        time: { start: 2, end: 3 },
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, false)
    expect(header.label).toBe("Explored 2 folders")
    expect(header.icon).toBe(FOLDER_TOOL_ICON)
  })

  test("settled skill-reference read group uses skill icon", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_skill_1",
        filePath: "/workspace/.agents/skills/react-best-practices/SKILL.md",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      readPart({
        id: "read_skill_2",
        filePath: "/workspace/.agents/skills/react-best-practices/references/rendering.md",
        status: "completed",
        time: { start: 2, end: 3 },
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, false)
    expect(header.label).toBe("Skill Used: React Best Practices")
    expect(header.icon).toBe(SKILL_TOOL_ICON)
  })

  test("settled multiple skills show plural skill count", () => {
    const entries = entriesFromParts([
      skillPart({ id: "skill_1", name: "worked-example", status: "completed" }),
      skillPart({ id: "skill_2", name: "resolve-confusions", status: "completed" }),
      skillPart({ id: "skill_3", name: "teaching-models", status: "completed" }),
    ])

    const header = resolveHiddenStepsHeader(entries, false)
    expect(header.label).toBe("3 Skills Used")
    expect(header.icon).toBe(SKILL_TOOL_ICON)
  })

  test("settled skill and its references collapse to one skill label", () => {
    const entries = entriesFromParts([
      skillPart({
        id: "skill_1",
        name: "find-indian-education-resources",
        status: "completed",
      }),
      readPart({
        id: "read_skill_1",
        filePath:
          "/workspace/packages/buddy/src/learning/features/teaching-guidance/skills/find-indian-education-resources/references/policy-frameworks-guidelines.md",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      readPart({
        id: "read_skill_2",
        filePath:
          "/workspace/packages/buddy/src/learning/features/teaching-guidance/skills/find-indian-education-resources/references/repositories.md",
        status: "completed",
        time: { start: 2, end: 3 },
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, false)
    expect(header.label).toBe("Skill Used: Find Indian Education Resources")
  })

  test("settled multiple skills with references show only skill count", () => {
    const entries = entriesFromParts([
      skillPart({
        id: "skill_1",
        name: "find-indian-education-resources",
        status: "completed",
      }),
      readPart({
        id: "read_skill_1",
        filePath:
          "/workspace/packages/buddy/src/learning/features/teaching-guidance/skills/find-indian-education-resources/references/repositories.md",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      skillPart({
        id: "skill_2",
        name: "align-teaching-topics-to-grade-level-and-age",
        status: "completed",
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, false)
    expect(header.label).toBe("2 Skills Used")
    expect(header.label).not.toContain("Find Indian Education Resources")
  })

  test("settled edit group uses generic edit icon not file-type icon", () => {
    const entries = entriesFromParts([
      directFileMutationPart({
        id: "edit_1",
        tool: "edit",
        filePath: "/workspace/App.tsx",
        status: "completed",
      }),
    ])

    const header = resolveHiddenStepsHeader(entries, false)
    expect(header.icon).toBe(builtInTools.edit.icon)
  })

  test("settled mixed group uses icon from most-used tool type", () => {
    const entries = entriesFromParts([
      readPart({
        id: "read_1",
        filePath: "/workspace/App.tsx",
        status: "completed",
        time: { start: 1, end: 2 },
      }),
      readPart({
        id: "read_2",
        filePath: "/workspace/Card.tsx",
        status: "completed",
        time: { start: 2, end: 3 },
      }),
      readPart({
        id: "read_3",
        filePath: "/workspace/Form.tsx",
        status: "completed",
        time: { start: 3, end: 4 },
      }),
      grepPart("completed"),
    ])

    const header = resolveHiddenStepsHeader(entries, false)
    const grepHeavyHeader = resolveHiddenStepsHeader(
      entriesFromParts([grepPart("completed"), grepPart("completed"), grepPart("completed")]),
      false,
    )

    expect(header.icon).toBeDefined()
    expect(grepHeavyHeader.icon).toBeDefined()
    expect(header.icon?.("size-3.5")).toEqual(
      resolveHiddenStepsHeader(
        entriesFromParts([
          readPart({
            id: "read_only",
            filePath: "/workspace/App.tsx",
            status: "completed",
            time: { start: 1, end: 2 },
          }),
        ]),
        false,
      ).icon?.("size-3.5"),
    )
    expect(header.icon?.("size-3.5")).not.toEqual(grepHeavyHeader.icon?.("size-3.5"))
  })
})
