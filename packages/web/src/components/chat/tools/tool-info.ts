import { basename, dirname } from "../utils/path"
import { language } from "@/context/language"
import { readIngestFullTextMetadata } from "./full-text-metadata"
import { isRecord, readNonEmptyString, readNonNegativeInt } from "./types"
import { parseToolUiMetadata } from "./parse-tool-ui-metadata"
import type { ToolInfo, ToolState } from "./types"

const IMAGE_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]

function isImageFilePath(filePath: string | undefined): boolean {
  if (!filePath) return false
  const lower = filePath.toLowerCase()
  return IMAGE_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function hasImageAttachments(state: ToolState): boolean {
  return state.attachments?.some((a) => a.mime.startsWith("image/")) ?? false
}

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

function patchFileSummary(state: ToolState): string | undefined {
  const files = Array.isArray(state.metadata.files) ? state.metadata.files.filter(isRecord) : []
  if (files.length === 1) {
    const path = readNonEmptyString(files[0].relativePath) ?? readNonEmptyString(files[0].filePath)
    return path ? basename(path) : undefined
  }

  return files.length > 1
    ? language.t("chatTools.fileCount.other", { count: files.length })
    : undefined
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

function withMetadataTitle(info: ToolInfo, metadataTitle: string | undefined): ToolInfo {
  if (!metadataTitle) return info
  return {
    ...info,
    title: metadataTitle,
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
  const caption = typeof input.caption === "string" ? input.caption : undefined
  const code = typeof input.code === "string" ? input.code : undefined
  const jurisdiction = typeof input.jurisdiction === "string" ? input.jurisdiction : undefined
  const targetJurisdiction =
    typeof input.targetJurisdiction === "string" ? input.targetJurisdiction : undefined
  const sql = typeof input.sql === "string" ? input.sql : undefined

  const active = state.status === "pending" || state.status === "running"
  const toolUi = parseToolUiMetadata(state.metadata)
  const metadataTitle = active
    ? (toolUi?.labels?.running ?? toolUi?.labels?.idle)
    : toolUi?.labels?.idle

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
      const isImage = isImageFilePath(filePath) || hasImageAttachments(state)
      const title = active
        ? language.t(isImage ? "chatTools.info.read.image.running" : "chatTools.info.read.running")
        : language.t(isImage ? "chatTools.info.read.image" : "chatTools.info.read")
      return withMetadataTitle(
        {
          title,
          subtitle: filePath ? basename(filePath) : undefined,
          detail: filePath ? dirname(filePath) : undefined,
          summary,
          args,
        },
        metadataTitle,
      )
    }
    case "list":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.list.running" : "chatTools.info.list"),
          subtitle: path ? dirname(path) : "/",
          summary,
        },
        metadataTitle,
      )
    case "glob":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.glob.running" : "chatTools.info.glob"),
          subtitle: pattern ?? path,
          detail: pattern && path ? path : undefined,
          summary,
          args: pattern && path ? [`path=${path}`] : [],
        },
        metadataTitle,
      )
    case "grep": {
      const args: string[] = []
      if (include) args.push(`include=${include}`)
      if (path) args.push(`path=${path}`)
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.grep.running" : "chatTools.info.grep"),
          subtitle: pattern ?? include ?? path,
          detail: path,
          summary,
          args,
        },
        metadataTitle,
      )
    }
    case "webfetch":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.webfetch.running" : "chatTools.info.webfetch"),
          subtitle: url,
          summary,
        },
        metadataTitle,
      )
    case "websearch":
      return withMetadataTitle(
        {
          title: language.t(
            active ? "chatTools.info.websearch.running" : "chatTools.info.websearch",
          ),
          subtitle: query,
          summary,
        },
        metadataTitle,
      )
    case "codesearch":
      return withMetadataTitle(
        {
          title: language.t(
            active ? "chatTools.info.codesearch.running" : "chatTools.info.codesearch",
          ),
          subtitle: query,
          summary,
        },
        metadataTitle,
      )
    case "learning_tool_search": {
      const matchedToolIds = Array.isArray(state.metadata.matchedToolIds)
        ? (state.metadata.matchedToolIds as unknown[]).filter(
            (id): id is string => typeof id === "string",
          )
        : []
      const MAX_VISIBLE_TOOLS = 4
      const matchedNames =
        matchedToolIds.length > 0
          ? matchedToolIds.slice(0, MAX_VISIBLE_TOOLS).join(", ") +
            (matchedToolIds.length > MAX_VISIBLE_TOOLS
              ? ` +${matchedToolIds.length - MAX_VISIBLE_TOOLS} more`
              : "")
          : undefined
      const matchCount = matchedToolIds.length > 0 ? matchedToolIds.length : undefined
      return withMetadataTitle(
        {
          title: "Search Tools",
          subtitle: matchedNames ?? query,
          summary: matchCount !== undefined ? `${matchCount} matched` : undefined,
        },
        metadataTitle,
      )
    }
    case "learning_tool_load": {
      const registeredToolCount = Array.isArray(state.metadata.registeredToolIds)
        ? state.metadata.registeredToolIds.length
        : undefined
      return withMetadataTitle(
        {
          title: "Load Tools",
          subtitle: Array.isArray(input.toolIds)
            ? `${input.toolIds.length.toLocaleString()} requested`
            : undefined,
          summary:
            typeof registeredToolCount === "number" ? `${registeredToolCount} loaded` : undefined,
        },
        metadataTitle,
      )
    }
    case "task":
      return withMetadataTitle(
        {
          title: subagent
            ? language.t("chatTools.info.agent", { subagent: subagent })
            : language.t(active ? "chatTools.info.agentTask.running" : "chatTools.info.agentTask"),
          subtitle: description,
        },
        metadataTitle,
      )
    case "write":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.write.running" : "chatTools.info.write"),
          subtitle: filePath ? basename(filePath) : undefined,
          detail: filePath ? dirname(filePath) : undefined,
        },
        metadataTitle,
      )
    case "edit":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.edit.running" : "chatTools.info.edit"),
          subtitle: filePath ? basename(filePath) : undefined,
          detail: filePath ? dirname(filePath) : undefined,
        },
        metadataTitle,
      )
    case "apply_patch":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.patch.running" : "chatTools.info.patch"),
          subtitle: patchFileSummary(state) ?? description,
        },
        metadataTitle,
      )
    case "bash":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.shell.running" : "chatTools.info.shell"),
          subtitle: description,
          summary,
        },
        metadataTitle,
      )
    case "question":
      return withMetadataTitle(
        {
          title: language.t(
            active ? "chatTools.info.questions.running" : "chatTools.info.questions",
          ),
          subtitle: description,
        },
        metadataTitle,
      )
    case "todowrite":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.todos.running" : "chatTools.todos"),
        },
        metadataTitle,
      )
    case "python_calculator":
      return withMetadataTitle(
        {
          title: language.t(
            active ? "chatTools.info.pythonCalculator.running" : "chatTools.info.pythonCalculator",
          ),
          subtitle: description,
          summary: output
            ? language.t("chatTools.info.result", { value: output.trim() })
            : undefined,
        },
        metadataTitle,
      )
    case "ingest_full_text": {
      const { resource, fullTextEstTokens, truncated } = readIngestFullTextMetadata(state)
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.fullText.running" : "chatTools.info.fullText"),
          subtitle: resource,
          summary:
            fullTextEstTokens !== undefined
              ? language.t(
                  truncated
                    ? "chatTools.info.tokensLoadedTruncated"
                    : "chatTools.info.tokensLoaded",
                  {
                    count: fullTextEstTokens.toLocaleString(),
                  },
                )
              : truncated
                ? language.t("chatTools.info.outputTruncated")
                : summary,
        },
        metadataTitle,
      )
    }
    case "prepare_resource":
      return withMetadataTitle(
        {
          title: active ? "Preparing Resource" : "Prepare Resource",
          subtitle:
            typeof state.metadata.resource === "string" ? state.metadata.resource : description,
        },
        metadataTitle,
      )
    case "reflection":
      return withMetadataTitle(
        {
          title: active ? "Pedagogy Reflection" : "Pedagogy Reflection",
        },
        metadataTitle,
      )
    case "skill": {
      const skillName = readNonEmptyString(input.name) ?? readNonEmptyString(state.metadata.name)
      return withMetadataTitle(
        {
          title: skillName
            ? active
              ? `Using ${skillName}`
              : `Used ${skillName}`
            : active
              ? "Using Skill"
              : "Used Skill",
        },
        metadataTitle,
      )
    }
    case "learner_memory_search":
      return withMetadataTitle(
        {
          title: active ? "Searching Memory" : "Search Memory",
          subtitle: typeof state.metadata.query === "string" ? state.metadata.query : undefined,
        },
        metadataTitle,
      )
    case "learner_memory_update":
      return withMetadataTitle(
        {
          title: active ? "Updating Memory" : "Update Memory",
        },
        metadataTitle,
      )
    case "render_figure":
    case "render_freeform_figure":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.figure.running" : "chatTools.info.figure"),
          subtitle: caption ?? alt,
        },
        metadataTitle,
      )
    case "render_mermaid":
      return withMetadataTitle(
        {
          title: language.t(active ? "chatTools.info.mermaid.running" : "chatTools.info.mermaid"),
          subtitle: alt,
        },
        metadataTitle,
      )
    case "save_question_set":
      return withMetadataTitle(
        {
          title: "Save Question Set",
          subtitle: description,
        },
        metadataTitle,
      )
    case "search_standards":
      return withMetadataTitle(
        {
          title: KNOWLEDGE_GRAPH_TOOL_TITLES.search_standards,
          subtitle: query,
          summary,
        },
        metadataTitle,
      )
    case "get_standard":
      return withMetadataTitle(
        {
          title: KNOWLEDGE_GRAPH_TOOL_TITLES.get_standard,
          subtitle: formatStandardLabel(code, jurisdiction),
          summary,
        },
        metadataTitle,
      )
    case "get_learning_components":
      return withMetadataTitle(
        {
          title: KNOWLEDGE_GRAPH_TOOL_TITLES.get_learning_components,
          subtitle: formatStandardLabel(code, jurisdiction),
          summary,
        },
        metadataTitle,
      )
    case "get_prerequisites":
      return withMetadataTitle(
        {
          title: KNOWLEDGE_GRAPH_TOOL_TITLES.get_prerequisites,
          subtitle: formatStandardLabel(code, jurisdiction),
          summary,
        },
        metadataTitle,
      )
    case "get_next_standards":
      return withMetadataTitle(
        {
          title: KNOWLEDGE_GRAPH_TOOL_TITLES.get_next_standards,
          subtitle: formatStandardLabel(code, jurisdiction),
          summary,
        },
        metadataTitle,
      )
    case "get_crosswalk":
      return withMetadataTitle(
        {
          title: KNOWLEDGE_GRAPH_TOOL_TITLES.get_crosswalk,
          subtitle:
            code && targetJurisdiction
              ? `${code} → ${targetJurisdiction}`
              : formatStandardLabel(code, jurisdiction),
          summary,
        },
        metadataTitle,
      )
    case "query_standards_sql":
      return withMetadataTitle(
        {
          title: KNOWLEDGE_GRAPH_TOOL_TITLES.query_standards_sql,
          subtitle: sql,
          summary,
        },
        metadataTitle,
      )
    default:
      return {
        title: metadataTitle ?? tool,
        subtitle: description,
        summary,
      }
  }
}
