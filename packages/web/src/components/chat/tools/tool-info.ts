import { basename, dirname } from "../shared/utils"
import type { ToolInfo, ToolState } from "./types"

function countNonEmptyLines(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  return trimmed.split(/\r?\n/u).filter((line) => line.trim().length > 0).length
}

export function getToolInfo(tool: string, state: ToolState): ToolInfo {
  const { input, output } = state
  const filePath = typeof input.filePath === "string" ? input.filePath : undefined
  const path = typeof input.path === "string" ? input.path : undefined
  const pattern = typeof input.pattern === "string" ? input.pattern : undefined
  const include = typeof input.include === "string" ? input.include : undefined
  const url = typeof input.url === "string" ? input.url : undefined
  const query = typeof input.query === "string" ? input.query : undefined
  const description = typeof input.description === "string" ? input.description : undefined
  const subagent = typeof input.subagent_type === "string" ? input.subagent_type : undefined
  const alt = typeof input.alt === "string" ? input.alt : undefined

  let summary: string | undefined
  if (output && typeof output === "string") {
    if (tool === "read") {
      summary = `${output.length.toLocaleString()} chars`
    } else if (
      tool === "grep" ||
      tool === "glob" ||
      tool === "list" ||
      tool === "codesearch" ||
      tool === "websearch"
    ) {
      const matchCount = countNonEmptyLines(output)
      summary = `${matchCount} ${matchCount === 1 ? "result" : "results"}`
    } else if (tool === "bash") {
      summary = "Command executed"
    }
  }

  switch (tool) {
    case "read": {
      const args: string[] = []
      if (typeof input.offset === "number") args.push(`offset=${input.offset}`)
      if (typeof input.limit === "number") args.push(`limit=${input.limit}`)
      return {
        title: "Read",
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
        summary,
        args,
      }
    }
    case "list":
      return {
        title: "List",
        subtitle: path ? dirname(path) : "/",
        summary,
      }
    case "glob":
      return {
        title: "Glob",
        subtitle: path ? dirname(path) : "/",
        summary,
        args: pattern ? [`pattern=${pattern}`] : [],
      }
    case "grep": {
      const args: string[] = []
      if (pattern) args.push(`pattern=${pattern}`)
      if (include) args.push(`include=${include}`)
      return {
        title: "Grep",
        subtitle: path ? dirname(path) : "/",
        summary,
        args,
      }
    }
    case "webfetch":
      return {
        title: "Webfetch",
        subtitle: url,
        summary,
      }
    case "websearch":
      return {
        title: "Websearch",
        subtitle: query,
        summary,
      }
    case "codesearch":
      return {
        title: "Codesearch",
        subtitle: query,
        summary,
      }
    case "task":
      return {
        title: subagent ? `Agent (${subagent})` : "Agent task",
        subtitle: description,
      }
    case "write":
      return {
        title: "Write",
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
      }
    case "edit":
      return {
        title: "Edit",
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
      }
    case "apply_patch":
      return {
        title: "Patch",
        subtitle: description,
      }
    case "bash":
      return {
        title: "Shell",
        subtitle: description,
        summary,
      }
    case "question":
      return {
        title: "Questions",
        subtitle: description,
      }
    case "python_calculator":
      return {
        title: "Python calculator",
        subtitle: description,
        summary: output ? `Result: ${output.trim()}` : undefined,
      }
    case "pedagogy_resource_ingest_full_text": {
      const resource =
        typeof state.metadata.resource === "string" ? state.metadata.resource : undefined
      const fullTextEstTokens =
        typeof state.metadata.fullTextEstTokens === "number"
          ? state.metadata.fullTextEstTokens
          : undefined
      return {
        title: "Full text",
        subtitle: resource,
        summary:
          fullTextEstTokens !== undefined
            ? `${fullTextEstTokens.toLocaleString()} tokens loaded`
            : summary,
      }
    }
    case "skill":
      return {
        title: "Skill",
        subtitle: typeof input.name === "string" ? input.name : description,
      }
    case "render_figure":
    case "render_freeform_figure":
      return {
        title: "Figure",
        subtitle: alt,
      }
    case "render_mermaid":
      return {
        title: "Mermaid",
        subtitle: alt,
      }
    default:
      return {
        title: tool,
        subtitle: description,
        summary,
      }
  }
}
