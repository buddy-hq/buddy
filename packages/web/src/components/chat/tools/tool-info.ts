import { basename, dirname } from "../utils/path"
import { language } from "@/context/language"
import { isRecord, readNonEmptyString, readNonNegativeInt } from "./types"
import type { ToolInfo, ToolState } from "./types"

const KNOWLEDGE_GRAPH_TOOL_TITLES = {
  search_standards: "Search Standards",
  get_standard: "Get Standard",
  get_learning_components: "Learning Components",
  get_prerequisites: "Prerequisites",
  get_next_standards: "Next Standards",
  get_crosswalk: "Crosswalk",
  query_standards_sql: "Standards SQL",
} as const

const KNOWLEDGE_GRAPH_TOOL_NAMES = new Set(Object.keys(KNOWLEDGE_GRAPH_TOOL_TITLES))

function countNonEmptyLines(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  return trimmed.split(/\r?\n/u).filter((line) => line.trim().length > 0).length
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function readArrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined
}

function formatCountSummary(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

function knowledgeGraphValue(state: ToolState): Record<string, unknown> | undefined {
  if (isRecord(state.metadata.value)) {
    return state.metadata.value
  }

  if (typeof state.output === "string") {
    return parseJsonRecord(state.output)
  }

  return undefined
}

function formatStandardLabel(code: string | undefined, jurisdiction: string | undefined) {
  if (code && jurisdiction) {
    return `${code} · ${jurisdiction}`
  }

  return code ?? jurisdiction
}

function knowledgeGraphSummary(tool: string, state: ToolState): string | undefined {
  const value = knowledgeGraphValue(state)
  if (!value) {
    return undefined
  }

  switch (tool) {
    case "search_standards": {
      const count = readNonNegativeInt(value.resultCount) ?? readArrayLength(value.results)
      return count !== undefined
        ? `Found ${formatCountSummary(count, "standard", "standards")}`
        : undefined
    }
    case "get_standard": {
      const standard = isRecord(value.standard) ? value.standard : undefined
      return formatStandardLabel(
        readNonEmptyString(standard?.code),
        readNonEmptyString(standard?.jurisdiction),
      )
    }
    case "get_learning_components": {
      const count = readNonNegativeInt(value.componentCount) ?? readArrayLength(value.components)
      return count !== undefined
        ? formatCountSummary(count, "learning component", "learning components")
        : undefined
    }
    case "get_prerequisites": {
      const count =
        readNonNegativeInt(value.prerequisiteCount) ?? readArrayLength(value.prerequisites)
      return count !== undefined
        ? formatCountSummary(count, "prerequisite", "prerequisites")
        : undefined
    }
    case "get_next_standards": {
      const count =
        readNonNegativeInt(value.nextStandardCount) ?? readArrayLength(value.nextStandards)
      return count !== undefined
        ? formatCountSummary(count, "next standard", "next standards")
        : undefined
    }
    case "get_crosswalk": {
      const count = readNonNegativeInt(value.crosswalkCount) ?? readArrayLength(value.crosswalks)
      return count !== undefined ? formatCountSummary(count, "crosswalk", "crosswalks") : undefined
    }
    case "query_standards_sql": {
      const count = readNonNegativeInt(value.rowCount) ?? readArrayLength(value.rows)
      return count !== undefined ? formatCountSummary(count, "row", "rows") : undefined
    }
    default:
      return undefined
  }
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
  const code = typeof input.code === "string" ? input.code : undefined
  const jurisdiction = typeof input.jurisdiction === "string" ? input.jurisdiction : undefined
  const targetJurisdiction =
    typeof input.targetJurisdiction === "string" ? input.targetJurisdiction : undefined
  const sql = typeof input.sql === "string" ? input.sql : undefined

  let summary: string | undefined
  if (KNOWLEDGE_GRAPH_TOOL_NAMES.has(tool)) {
    summary = knowledgeGraphSummary(tool, state)
  } else if (output && typeof output === "string") {
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
    case "render_saved_question_set":
      return {
        title: "Question Set",
        subtitle: typeof input.artifactID === "string" ? input.artifactID : description,
      }
    case "save_question_set":
      return {
        title: "Save Question Set",
        subtitle: description,
      }
    case "search_standards":
      return {
        title: KNOWLEDGE_GRAPH_TOOL_TITLES.search_standards,
        subtitle: query,
        summary,
      }
    case "get_standard":
      return {
        title: KNOWLEDGE_GRAPH_TOOL_TITLES.get_standard,
        subtitle: formatStandardLabel(code, jurisdiction),
        summary,
      }
    case "get_learning_components":
      return {
        title: KNOWLEDGE_GRAPH_TOOL_TITLES.get_learning_components,
        subtitle: formatStandardLabel(code, jurisdiction),
        summary,
      }
    case "get_prerequisites":
      return {
        title: KNOWLEDGE_GRAPH_TOOL_TITLES.get_prerequisites,
        subtitle: formatStandardLabel(code, jurisdiction),
        summary,
      }
    case "get_next_standards":
      return {
        title: KNOWLEDGE_GRAPH_TOOL_TITLES.get_next_standards,
        subtitle: formatStandardLabel(code, jurisdiction),
        summary,
      }
    case "get_crosswalk":
      return {
        title: KNOWLEDGE_GRAPH_TOOL_TITLES.get_crosswalk,
        subtitle:
          code && targetJurisdiction
            ? `${code} → ${targetJurisdiction}`
            : formatStandardLabel(code, jurisdiction),
        summary,
      }
    case "query_standards_sql":
      return {
        title: KNOWLEDGE_GRAPH_TOOL_TITLES.query_standards_sql,
        subtitle: sql,
        summary,
      }
    default:
      return {
        title: tool,
        subtitle: description,
        summary,
      }
  }
}
