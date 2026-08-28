import path from "node:path"

import { isJsonObject, parseStringValue } from "./parse-external"
import {
  defineToolPresentation,
  type ToolPresentationDescriptor,
  type ToolPresentationResolutionContext,
} from "./tool-presentation"

export const CORE_TOOL_PRESENTATION_IDS = [
  "invalid",
  "question",
  "bash",
  "read",
  "glob",
  "grep",
  "edit",
  "write",
  "task",
  "webfetch",
  "todowrite",
  "websearch",
  "skill",
  "apply_patch",
  "execute",
  "lsp",
  "plan_exit",
  "list_mcp_resources",
  "list_mcp_resource_templates",
  "read_mcp_resource",
] as const

const LEGACY_TOOL_PRESENTATION_IDS = ["list", "codesearch", "todoread"] as const

export type CoreToolPresentationID = (typeof CORE_TOOL_PRESENTATION_IDS)[number]
type LegacyToolPresentationID = (typeof LEGACY_TOOL_PRESENTATION_IDS)[number]
type IntegratedToolPresentationID = CoreToolPresentationID | LegacyToolPresentationID

function readString<TValue>(value: TValue): string | undefined {
  const parsed = parseStringValue(value)
  if (parsed === undefined) return undefined
  const normalized = parsed.trim()
  return normalized ? normalized : undefined
}

function inputString(key: string) {
  return (context: ToolPresentationResolutionContext): string | undefined =>
    readString(context.input[key])
}

function inputFileName(key: string) {
  return (context: ToolPresentationResolutionContext): string | undefined => {
    const filePath = readString(context.input[key])
    return filePath ? path.basename(filePath) : undefined
  }
}

function stateTitleOrInput(key: string) {
  return (context: ToolPresentationResolutionContext): string | undefined =>
    readString(context.title) ?? readString(context.input[key])
}

function patchFileDetail(context: ToolPresentationResolutionContext): string | undefined {
  const files = context.metadata.files
  if (!Array.isArray(files) || files.length === 0) return undefined
  if (files.length > 1) return `${files.length.toLocaleString()} files`

  const file = files[0]
  if (!isJsonObject(file)) return undefined
  const relativePath = readString(file.relativePath)
  const filePath = readString(file.filePath)
  const resolvedPath = relativePath ?? filePath
  return resolvedPath ? path.basename(resolvedPath) : undefined
}

const catalog = {
  invalid: defineToolPresentation({
    archetype: "activity",
    icon: "tool",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Checking tool call" },
      running: { action: "Checking tool call" },
      completed: { action: "Found an invalid tool call", detail: inputString("tool") },
      error: { action: "Failed to check tool call", detail: inputString("tool") },
    },
    summary: {
      category: "invalid-tool-call",
      pending: "Checking tool call",
      running: "Checking tool call",
      completed: "Found an invalid tool call",
      error: "Failed to check tool call",
    },
  }),
  question: defineToolPresentation({
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
  bash: defineToolPresentation({
    archetype: "activity",
    icon: "terminal",
    renderer: "bash",
    layoutRole: "activity",
    phases: {
      pending: { action: "Preparing command", detail: stateTitleOrInput("command") },
      running: { action: "Running", detail: stateTitleOrInput("command") },
      completed: { action: "Ran", detail: stateTitleOrInput("command") },
      error: { action: "Failed to run", detail: stateTitleOrInput("command") },
    },
    summary: {
      category: "command",
      pending: "Preparing commands",
      running: "Running commands",
      completed: "Ran commands",
      error: "Failed to run commands",
    },
  }),
  read: defineToolPresentation({
    archetype: "activity",
    icon: "read",
    renderer: "read",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading", detail: inputFileName("filePath") },
      running: { action: "Reading", detail: inputFileName("filePath") },
      completed: { action: "Read", detail: inputFileName("filePath") },
      error: { action: "Failed to read", detail: inputFileName("filePath") },
    },
    summary: {
      category: "read-files",
      pending: "Reading files",
      running: "Reading files",
      completed: "Read files",
      error: "Failed to read files",
    },
  }),
  glob: defineToolPresentation({
    archetype: "activity",
    icon: "search",
    renderer: "search",
    layoutRole: "activity",
    phases: {
      pending: { action: "Searching files", detail: inputString("pattern") },
      running: { action: "Searching files", detail: inputString("pattern") },
      completed: { action: "Searched files", detail: inputString("pattern") },
      error: { action: "Failed to search files", detail: inputString("pattern") },
    },
    summary: {
      category: "search-files",
      pending: "Searching files",
      running: "Searching files",
      completed: "Searched files",
      error: "Failed to search files",
    },
  }),
  grep: defineToolPresentation({
    archetype: "activity",
    icon: "search",
    renderer: "search",
    layoutRole: "activity",
    phases: {
      pending: { action: "Searching code", detail: inputString("pattern") },
      running: { action: "Searching code", detail: inputString("pattern") },
      completed: { action: "Searched code", detail: inputString("pattern") },
      error: { action: "Failed to search code", detail: inputString("pattern") },
    },
    summary: {
      category: "search-code",
      pending: "Searching code",
      running: "Searching code",
      completed: "Searched code",
      error: "Failed to search code",
    },
  }),
  edit: defineToolPresentation({
    archetype: "activity",
    icon: "edit",
    renderer: "edit",
    layoutRole: "activity",
    phases: {
      pending: { action: "Editing", detail: inputFileName("filePath") },
      running: { action: "Editing", detail: inputFileName("filePath") },
      completed: { action: "Edited", detail: inputFileName("filePath") },
      error: { action: "Failed to edit", detail: inputFileName("filePath") },
    },
    summary: {
      category: "edit-files",
      pending: "Editing files",
      running: "Editing files",
      completed: "Edited files",
      error: "Failed to edit files",
    },
  }),
  write: defineToolPresentation({
    archetype: "activity",
    icon: "edit",
    renderer: "edit",
    layoutRole: "activity",
    phases: {
      pending: { action: "Writing", detail: inputFileName("filePath") },
      running: { action: "Writing", detail: inputFileName("filePath") },
      completed: { action: "Wrote", detail: inputFileName("filePath") },
      error: { action: "Failed to write", detail: inputFileName("filePath") },
    },
    summary: {
      category: "edit-files",
      pending: "Editing files",
      running: "Editing files",
      completed: "Edited files",
      error: "Failed to edit files",
    },
  }),
  task: defineToolPresentation({
    archetype: "inline-output",
    icon: "subagent",
    renderer: "task",
    layoutRole: "card-output",
    phases: {
      pending: { action: "Preparing subagent", detail: inputString("description") },
      running: { action: "Running subagent", detail: inputString("description") },
      completed: { action: "Completed subagent task", detail: inputString("description") },
      error: { action: "Failed to run subagent", detail: inputString("description") },
    },
  }),
  webfetch: defineToolPresentation({
    archetype: "activity",
    icon: "web",
    renderer: "web-fetch",
    layoutRole: "activity",
    phases: {
      pending: { action: "Fetching", detail: inputString("url") },
      running: { action: "Fetching", detail: inputString("url") },
      completed: { action: "Fetched", detail: inputString("url") },
      error: { action: "Failed to fetch", detail: inputString("url") },
    },
    summary: {
      category: "fetch-pages",
      pending: "Fetching pages",
      running: "Fetching pages",
      completed: "Fetched pages",
      error: "Failed to fetch pages",
    },
  }),
  todowrite: defineToolPresentation({
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
  websearch: defineToolPresentation({
    archetype: "activity",
    icon: "web",
    renderer: "web-search",
    layoutRole: "activity",
    phases: {
      pending: { action: "Searching the web", detail: inputString("query") },
      running: { action: "Searching the web", detail: inputString("query") },
      completed: { action: "Searched the web", detail: inputString("query") },
      error: { action: "Failed to search the web", detail: inputString("query") },
    },
    summary: {
      category: "search-web",
      pending: "Searching the web",
      running: "Searching the web",
      completed: "Searched the web",
      error: "Failed to search the web",
    },
  }),
  skill: defineToolPresentation({
    archetype: "activity",
    icon: "skill",
    renderer: "skill",
    layoutRole: "activity",
    phases: {
      pending: { action: "Loading skill", detail: inputString("name") },
      running: { action: "Loading skill", detail: inputString("name") },
      completed: { action: "Loaded skill", detail: inputString("name") },
      error: { action: "Failed to load skill", detail: inputString("name") },
    },
    summary: {
      category: "load-skills",
      pending: "Loading skills",
      running: "Loading skills",
      completed: "Loaded skills",
      error: "Failed to load skills",
    },
  }),
  apply_patch: defineToolPresentation({
    archetype: "activity",
    icon: "edit",
    renderer: "apply-patch",
    layoutRole: "activity",
    phases: {
      pending: { action: "Preparing edits", detail: patchFileDetail },
      running: { action: "Applying edits", detail: patchFileDetail },
      completed: { action: "Applied edits", detail: patchFileDetail },
      error: { action: "Failed to apply edits", detail: patchFileDetail },
    },
    summary: {
      category: "edit-files",
      pending: "Editing files",
      running: "Editing files",
      completed: "Edited files",
      error: "Failed to edit files",
    },
  }),
  execute: defineToolPresentation({
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
  lsp: defineToolPresentation({
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
  plan_exit: defineToolPresentation({ archetype: "silent" }),
  list_mcp_resources: defineToolPresentation({
    archetype: "activity",
    icon: "network",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Listing MCP resources", detail: inputString("server") },
      running: { action: "Listing MCP resources", detail: inputString("server") },
      completed: { action: "Listed MCP resources", detail: inputString("server") },
      error: { action: "Failed to list MCP resources", detail: inputString("server") },
    },
    summary: {
      category: "mcp-resources",
      pending: "Listing MCP resources",
      running: "Listing MCP resources",
      completed: "Listed MCP resources",
      error: "Failed to list MCP resources",
    },
  }),
  list_mcp_resource_templates: defineToolPresentation({
    archetype: "activity",
    icon: "network",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Listing MCP resource templates", detail: inputString("server") },
      running: { action: "Listing MCP resource templates", detail: inputString("server") },
      completed: { action: "Listed MCP resource templates", detail: inputString("server") },
      error: {
        action: "Failed to list MCP resource templates",
        detail: inputString("server"),
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
  read_mcp_resource: defineToolPresentation({
    archetype: "activity",
    icon: "read",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading MCP resource", detail: inputString("uri") },
      running: { action: "Reading MCP resource", detail: inputString("uri") },
      completed: { action: "Read MCP resource", detail: inputString("uri") },
      error: { action: "Failed to read MCP resource", detail: inputString("uri") },
    },
    summary: {
      category: "mcp-resource",
      pending: "Reading MCP resources",
      running: "Reading MCP resources",
      completed: "Read MCP resources",
      error: "Failed to read MCP resources",
    },
  }),
  list: defineToolPresentation({
    archetype: "activity",
    icon: "search",
    renderer: "search",
    layoutRole: "activity",
    phases: {
      pending: { action: "Listing files", detail: inputString("path") },
      running: { action: "Listing files", detail: inputString("path") },
      completed: { action: "Listed files", detail: inputString("path") },
      error: { action: "Failed to list files", detail: inputString("path") },
    },
    summary: {
      category: "list-files",
      pending: "Listing files",
      running: "Listing files",
      completed: "Listed files",
      error: "Failed to list files",
    },
  }),
  codesearch: defineToolPresentation({
    archetype: "activity",
    icon: "search",
    renderer: "web-search",
    layoutRole: "activity",
    phases: {
      pending: { action: "Searching code", detail: inputString("query") },
      running: { action: "Searching code", detail: inputString("query") },
      completed: { action: "Searched code", detail: inputString("query") },
      error: { action: "Failed to search code", detail: inputString("query") },
    },
    summary: {
      category: "search-code",
      pending: "Searching code",
      running: "Searching code",
      completed: "Searched code",
      error: "Failed to search code",
    },
  }),
  todoread: defineToolPresentation({ archetype: "silent" }),
} satisfies Record<IntegratedToolPresentationID, ToolPresentationDescriptor>

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

const integratedIDs = new Set<string>([
  ...CORE_TOOL_PRESENTATION_IDS,
  ...LEGACY_TOOL_PRESENTATION_IDS,
])

function isIntegratedToolPresentationID(value: string): value is IntegratedToolPresentationID {
  return integratedIDs.has(value)
}

export function getCoreToolPresentationDescriptor(
  toolID: string,
): ToolPresentationDescriptor | undefined {
  return isIntegratedToolPresentationID(toolID) ? catalog[toolID] : undefined
}

/**
 * Runtime-defined tools such as direct MCP calls cannot be enumerated in the
 * compile-time catalog. They still receive an explicit presentation contract
 * so transport enrichment never makes their lifecycle disappear.
 */
export function getRuntimeToolPresentationDescriptor(): ToolPresentationDescriptor {
  return runtimeToolPresentation
}
