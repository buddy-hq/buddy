import { basename, dirname } from "../shared/utils"
import { language } from "@/context/language"
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
      summary = language.t(
        matchCount === 1 ? "chatTools.info.resultCount.one" : "chatTools.info.resultCount.other",
        { count: matchCount },
      )
    } else if (tool === "bash") {
      summary = language.t("chatTools.commandExecuted")
    }
  }

  switch (tool) {
    case "read": {
      const args: string[] = []
      if (typeof input.offset === "number") args.push(`offset=${input.offset}`)
      if (typeof input.limit === "number") args.push(`limit=${input.limit}`)
      return {
        title: language.t("chatTools.info.read"),
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
        summary,
        args,
      }
    }
    case "list":
      return {
        title: language.t("chatTools.info.list"),
        subtitle: path ? dirname(path) : "/",
        summary,
      }
    case "glob":
      return {
        title: language.t("chatTools.info.glob"),
        subtitle: path ? dirname(path) : "/",
        summary,
        args: pattern ? [`pattern=${pattern}`] : [],
      }
    case "grep": {
      const args: string[] = []
      if (pattern) args.push(`pattern=${pattern}`)
      if (include) args.push(`include=${include}`)
      return {
        title: language.t("chatTools.info.grep"),
        subtitle: path ? dirname(path) : "/",
        summary,
        args,
      }
    }
    case "webfetch":
      return {
        title: language.t("chatTools.info.webfetch"),
        subtitle: url,
        summary,
      }
    case "websearch":
      return {
        title: language.t("chatTools.info.websearch"),
        subtitle: query,
        summary,
      }
    case "codesearch":
      return {
        title: language.t("chatTools.info.codesearch"),
        subtitle: query,
        summary,
      }
    case "task":
      return {
        title: subagent
          ? language.t("chatTools.info.agent", { subagent: subagent })
          : language.t("chatTools.info.agentTask"),
        subtitle: description,
      }
    case "write":
      return {
        title: language.t("chatTools.info.write"),
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
      }
    case "edit":
      return {
        title: language.t("chatTools.info.edit"),
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
      }
    case "apply_patch":
      return {
        title: language.t("chatTools.info.patch"),
        subtitle: description,
      }
    case "bash":
      return {
        title: language.t("chatTools.info.shell"),
        subtitle: description,
        summary,
      }
    case "question":
      return {
        title: language.t("chatTools.info.questions"),
        subtitle: description,
      }
    case "python_calculator":
      return {
        title: language.t("chatTools.info.pythonCalculator"),
        subtitle: description,
        summary: output ? language.t("chatTools.info.result", { value: output.trim() }) : undefined,
      }
    case "pedagogy_resource_ingest_full_text": {
      const resource =
        typeof state.metadata.resource === "string" ? state.metadata.resource : undefined
      const fullTextEstTokens =
        typeof state.metadata.fullTextEstTokens === "number"
          ? state.metadata.fullTextEstTokens
          : undefined
      return {
        title: language.t("chatTools.info.fullText"),
        subtitle: resource,
        summary:
          fullTextEstTokens !== undefined
            ? language.t("chatTools.info.tokensLoaded", {
                count: fullTextEstTokens.toLocaleString(),
              })
            : summary,
      }
    }
    case "skill":
      return {
        title: language.t("chatTools.info.skill"),
        subtitle: typeof input.name === "string" ? input.name : description,
      }
    case "render_figure":
    case "render_freeform_figure":
      return {
        title: language.t("chatTools.info.figure"),
        subtitle: alt,
      }
    case "render_mermaid":
      return {
        title: language.t("chatTools.info.mermaid"),
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
