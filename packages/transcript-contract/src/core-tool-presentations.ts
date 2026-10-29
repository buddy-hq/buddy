import {
  defineToolPresentation,
  type ToolPresentationDescriptor,
  type ToolPresentationResolutionContext,
} from "./tool-presentation"

export const CORE_TOOL_PRESENTATION_KINDS = [
  "invalid-tool-call", "ask-questions", "run-command", "read-file", "find-files",
  "search-files", "edit-file", "write-file", "delegate", "fetch-url", "update-plan",
  "search-web", "use-skill", "change-files", "run-connected-tools", "inspect-code",
  "finish-plan", "list-resources", "list-resource-templates", "read-resource",
  "list-files", "search-code", "read-plan",
] as const

export type CoreToolPresentationKind = (typeof CORE_TOOL_PRESENTATION_KINDS)[number]

function detail(context: ToolPresentationResolutionContext): string | undefined {
  return context.detail
}

const catalog = {
  "invalid-tool-call": defineToolPresentation({
    archetype: "activity",
    icon: "tool",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Checking tool call" },
      running: { action: "Checking tool call" },
      completed: { action: "Found an invalid tool call", detail },
      error: { action: "Failed to check tool call", detail },
    },
    summary: {
      category: "invalid-tool-call",
      pending: "Checking tool call",
      running: "Checking tool call",
      completed: "Found an invalid tool call",
      error: "Failed to check tool call",
    },
  }),
  "ask-questions": defineToolPresentation({
    archetype: "interaction",
    icon: "question",
    renderer: "question",
    layoutRole: "compact-output",
    phases: {
      pending: { action: "Asking questions" },
      running: { action: "Waiting for your answer" },
      completed: { action: "Answered questions" },
      error: { action: "Failed to ask questions" },
    },
  }),
  "run-command": defineToolPresentation({
    archetype: "activity",
    icon: "terminal",
    renderer: "bash",
    layoutRole: "activity",
    phases: {
      pending: { action: "Preparing command", detail },
      running: { action: "Running", detail },
      completed: { action: "Ran", detail },
      error: { action: "Failed to run", detail },
    },
    summary: {
      category: "command",
      pending: "Preparing commands",
      running: "Running commands",
      completed: "Ran commands",
      error: "Failed to run commands",
    },
  }),
  "read-file": defineToolPresentation({
    archetype: "activity",
    icon: "read",
    renderer: "read",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading", detail },
      running: { action: "Reading", detail },
      completed: { action: "Read", detail },
      error: { action: "Failed to read", detail },
    },
    summary: {
      category: "read-files",
      pending: "Reading files",
      running: "Reading files",
      completed: "Read files",
      error: "Failed to read files",
    },
  }),
  "find-files": defineToolPresentation({
    archetype: "activity",
    icon: "search",
    renderer: "search",
    layoutRole: "activity",
    phases: {
      pending: { action: "Finding files", detail },
      running: { action: "Finding files", detail },
      completed: { action: "Found files", detail },
      error: { action: "Failed to find files", detail },
    },
    summary: {
      category: "search-files",
      pending: "Finding files",
      running: "Finding files",
      completed: "Found files",
      error: "Failed to find files",
    },
  }),
  "search-files": defineToolPresentation({
    archetype: "activity",
    icon: "search",
    renderer: "search",
    layoutRole: "activity",
    phases: {
      pending: { action: "Searching", detail },
      running: { action: "Searching", detail },
      completed: { action: "Searched", detail },
      error: { action: "Failed to search", detail },
    },
    summary: {
      category: "search-code",
      pending: "Searching",
      running: "Searching",
      completed: "Searched",
      error: "Failed to search",
    },
  }),
  "edit-file": defineToolPresentation({
    archetype: "activity",
    icon: "edit",
    renderer: "edit",
    layoutRole: "activity",
    phases: {
      pending: { action: "Creating", detail },
      running: { action: "Creating", detail },
      completed: { action: "Created", detail },
      error: { action: "Failed to create", detail },
    },
    summary: {
      category: "edit-files",
      pending: "Creating",
      running: "Creating",
      completed: "Created",
      error: "Failed to create",
    },
  }),
  "write-file": defineToolPresentation({
    archetype: "activity",
    icon: "edit",
    renderer: "edit",
    layoutRole: "activity",
    phases: {
      pending: { action: "Creating", detail },
      running: { action: "Creating", detail },
      completed: { action: "Created", detail },
      error: { action: "Failed to create", detail },
    },
    summary: {
      category: "edit-files",
      pending: "Creating",
      running: "Creating",
      completed: "Created",
      error: "Failed to create",
    },
  }),
  "delegate": defineToolPresentation({
    archetype: "inline-output",
    icon: "subagent",
    renderer: "task",
    layoutRole: "card-output",
    phases: {
      pending: { action: "Preparing subagent", detail },
      running: { action: "Running subagent", detail },
      completed: { action: "Delegated work", detail },
      error: { action: "Failed to run subagent", detail },
    },
  }),
  "fetch-url": defineToolPresentation({
    archetype: "activity",
    icon: "web",
    renderer: "web-fetch",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading web page", detail },
      running: { action: "Reading web page", detail },
      completed: { action: "Read web page", detail },
      error: { action: "Failed to read web page", detail },
    },
    summary: {
      category: "fetch-pages",
      pending: "Reading web page",
      running: "Reading web page",
      completed: "Read web page",
      error: "Failed to read web page",
    },
  }),
  "update-plan": defineToolPresentation({
    archetype: "activity",
    icon: "todo",
    renderer: "todo",
    layoutRole: "activity",
    phases: {
      pending: { action: "Updating tasks" },
      running: { action: "Updating tasks" },
      completed: { action: "Updated tasks" },
      error: { action: "Failed to update tasks" },
    },
    summary: {
      category: "update-tasks",
      pending: "Updating tasks",
      running: "Updating tasks",
      completed: "Updated tasks",
      error: "Failed to update tasks",
    },
  }),
  "search-web": defineToolPresentation({
    archetype: "activity",
    icon: "web",
    renderer: "web-search",
    layoutRole: "activity",
    phases: {
      pending: { action: "Searching the web", detail },
      running: { action: "Searching the web", detail },
      completed: { action: "Searched the web", detail },
      error: { action: "Failed to search the web", detail },
    },
    summary: {
      category: "search-web",
      pending: "Searching the web",
      running: "Searching the web",
      completed: "Searched the web",
      error: "Failed to search the web",
    },
  }),
  "use-skill": defineToolPresentation({
    archetype: "activity",
    icon: "skill",
    renderer: "skill",
    layoutRole: "activity",
    phases: {
      pending: { action: "Using skill", detail },
      running: { action: "Using skill", detail },
      completed: { action: "Used skill", detail },
      error: { action: "Failed to use skill", detail },
    },
    summary: {
      category: "load-skills",
      pending: "Using skills",
      running: "Using skills",
      completed: "Used skills",
      error: "Failed to use skills",
    },
  }),
  "change-files": defineToolPresentation({
    archetype: "activity",
    icon: "edit",
    renderer: "apply-patch",
    layoutRole: "activity",
    phases: {
      pending: { action: "Creating", detail },
      running: { action: "Creating", detail },
      completed: { action: "Created", detail },
      error: { action: "Failed to create", detail },
    },
    summary: {
      category: "edit-files",
      pending: "Creating",
      running: "Creating",
      completed: "Created",
      error: "Failed to create",
    },
  }),
  "run-connected-tools": defineToolPresentation({
    archetype: "activity",
    icon: "tool",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Preparing connected tools" },
      running: { action: "Running connected tools" },
      completed: { action: "Ran connected tools" },
      error: { action: "Failed to run connected tools" },
    },
    summary: {
      category: "connected-tools",
      pending: "Preparing connected tools",
      running: "Running connected tools",
      completed: "Ran connected tools",
      error: "Failed to run connected tools",
    },
  }),
  "inspect-code": defineToolPresentation({
    archetype: "activity",
    icon: "search",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Inspecting code" },
      running: { action: "Inspecting code" },
      completed: { action: "Inspected code" },
      error: { action: "Failed to inspect code" },
    },
    summary: {
      category: "inspect-code",
      pending: "Inspecting code",
      running: "Inspecting code",
      completed: "Inspected code",
      error: "Failed to inspect code",
    },
  }),
  "finish-plan": defineToolPresentation({ archetype: "silent" }),
  "list-resources": defineToolPresentation({
    archetype: "activity",
    icon: "network",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Listing MCP resources", detail },
      running: { action: "Listing MCP resources", detail },
      completed: { action: "Listed MCP resources", detail },
      error: { action: "Failed to list MCP resources", detail },
    },
    summary: {
      category: "mcp-resources",
      pending: "Listing MCP resources",
      running: "Listing MCP resources",
      completed: "Listed MCP resources",
      error: "Failed to list MCP resources",
    },
  }),
  "list-resource-templates": defineToolPresentation({
    archetype: "activity",
    icon: "network",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Listing MCP resource templates", detail },
      running: { action: "Listing MCP resource templates", detail },
      completed: { action: "Listed MCP resource templates", detail },
      error: {
        action: "Failed to list MCP resource templates",
        detail,
      },
    },
    summary: {
      category: "mcp-resource-templates",
      pending: "Listing MCP resource templates",
      running: "Listing MCP resource templates",
      completed: "Listed MCP resource templates",
      error: "Failed to list MCP resource templates",
    },
  }),
  "read-resource": defineToolPresentation({
    archetype: "activity",
    icon: "read",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading MCP resource", detail },
      running: { action: "Reading MCP resource", detail },
      completed: { action: "Read MCP resource", detail },
      error: { action: "Failed to read MCP resource", detail },
    },
    summary: {
      category: "mcp-resource",
      pending: "Reading MCP resources",
      running: "Reading MCP resources",
      completed: "Read MCP resources",
      error: "Failed to read MCP resources",
    },
  }),
  "list-files": defineToolPresentation({
    archetype: "activity",
    icon: "search",
    renderer: "search",
    layoutRole: "activity",
    phases: {
      pending: { action: "Listing files", detail },
      running: { action: "Listing files", detail },
      completed: { action: "Listed files", detail },
      error: { action: "Failed to list files", detail },
    },
    summary: {
      category: "list-files",
      pending: "Listing files",
      running: "Listing files",
      completed: "Listed files",
      error: "Failed to list files",
    },
  }),
  "search-code": defineToolPresentation({
    archetype: "activity",
    icon: "search",
    renderer: "web-search",
    layoutRole: "activity",
    phases: {
      pending: { action: "Searching code", detail },
      running: { action: "Searching code", detail },
      completed: { action: "Searched code", detail },
      error: { action: "Failed to search code", detail },
    },
    summary: {
      category: "search-code",
      pending: "Searching code",
      running: "Searching code",
      completed: "Searched code",
      error: "Failed to search code",
    },
  }),
  "read-plan": defineToolPresentation({ archetype: "silent" }),
} satisfies Record<CoreToolPresentationKind, ToolPresentationDescriptor>

const runtimeToolPresentation = defineToolPresentation({
  archetype: "activity",
  icon: "tool",
  renderer: "generic",
  layoutRole: "activity",
  phases: {
    pending: { action: "Preparing connected tool" },
    running: { action: "Running connected tool" },
    completed: { action: "Ran connected tool" },
    error: { action: "Failed to run connected tool" },
  },
  summary: {
    category: "connected-tools",
    pending: "Preparing connected tools",
    running: "Running connected tools",
    completed: "Ran connected tools",
    error: "Failed to run connected tools",
  },
})

const kinds = new Set<string>(CORE_TOOL_PRESENTATION_KINDS)

function isCoreToolPresentationKind(value: string): value is CoreToolPresentationKind {
  return kinds.has(value)
}

export function getCoreToolPresentationDescriptor(
  kind: string,
): ToolPresentationDescriptor | undefined {
  return isCoreToolPresentationKind(kind) ? catalog[kind] : undefined
}

/**
 * Runtime-defined tools such as direct MCP calls cannot be enumerated in the
 * compile-time catalog. They still receive an explicit presentation contract
 * so transport enrichment never makes their lifecycle disappear.
 */
export function getRuntimeToolPresentationDescriptor(): ToolPresentationDescriptor {
  return runtimeToolPresentation
}
