import { Badge } from "@buddy/ui"
import type { ReactNode } from "react"
import { BasicTool } from "../../tools/basic-tool"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { language } from "@/context/language"
import { isRecord, readNonEmptyString, readNonNegativeInt } from "../../tools/types"
import type { ToolPartProps } from "../registry"

const KNOWLEDGE_GRAPH_PREVIEW_LIMIT = 4

const RUNNING_LABELS = {
  search_standards: "Searching standards...",
  get_standard: "Looking up standard...",
  get_learning_components: "Loading learning components...",
  get_prerequisites: "Finding prerequisites...",
  get_next_standards: "Finding next standards...",
  get_crosswalk: "Finding crosswalks...",
  query_standards_sql: "Running standards SQL...",
} as const

const MATCH_STRATEGY_LABELS = {
  exact_code: "Exact code match",
  ranked_code_match: "Ranked code match",
  search_fallback: "Search fallback",
} as const

const ALIGNMENT_DIRECTION_LABELS = {
  outbound: "Maps to",
  inbound: "Mapped from",
} as const

function runningLabel(tool: string): string {
  switch (tool) {
    case "search_standards":
      return RUNNING_LABELS.search_standards
    case "get_standard":
      return RUNNING_LABELS.get_standard
    case "get_learning_components":
      return RUNNING_LABELS.get_learning_components
    case "get_prerequisites":
      return RUNNING_LABELS.get_prerequisites
    case "get_next_standards":
      return RUNNING_LABELS.get_next_standards
    case "get_crosswalk":
      return RUNNING_LABELS.get_crosswalk
    case "query_standards_sql":
      return RUNNING_LABELS.query_standards_sql
    default:
      return "Loading standards..."
  }
}

type KnowledgeGraphStandard = {
  code?: string
  description?: string
  subject?: string
  jurisdiction?: string
  gradeLevels: string[]
  distance?: number
  alignmentDirection?: "outbound" | "inbound"
}

type KnowledgeGraphResolution = {
  matchStrategy?: keyof typeof MATCH_STRATEGY_LABELS
  standard: KnowledgeGraphStandard
  alternatives: KnowledgeGraphStandard[]
  parents: KnowledgeGraphStandard[]
  children: KnowledgeGraphStandard[]
}

type SearchStandardsResult = {
  kind: "search_standards"
  query?: string
  resultCount: number
  results: KnowledgeGraphStandard[]
}

type GetStandardResult = {
  kind: "get_standard"
  resolution: KnowledgeGraphResolution
}

type LearningComponentsResult = {
  kind: "get_learning_components"
  resolution: KnowledgeGraphResolution
  componentCount: number
  components: string[]
}

type ProgressionResult = {
  kind: "get_prerequisites" | "get_next_standards"
  resolution: KnowledgeGraphResolution
  count: number
  standards: KnowledgeGraphStandard[]
}

type CrosswalkResult = {
  kind: "get_crosswalk"
  resolution: KnowledgeGraphResolution
  crosswalkCount: number
  crosswalks: KnowledgeGraphStandard[]
}

type SqlQueryRow = Record<string, string | number | boolean | null>

type SqlQueryResult = {
  kind: "query_standards_sql"
  sql?: string
  rowCount: number
  truncated: boolean
  rows: SqlQueryRow[]
}

type KnowledgeGraphParsedResult =
  | SearchStandardsResult
  | GetStandardResult
  | LearningComponentsResult
  | ProgressionResult
  | CrosswalkResult
  | SqlQueryResult

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

function parseStandard(value: unknown): KnowledgeGraphStandard | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const alignmentDirection =
    value.alignmentDirection === "outbound" || value.alignmentDirection === "inbound"
      ? value.alignmentDirection
      : undefined

  return {
    code: readNonEmptyString(value.code),
    description: readNonEmptyString(value.description),
    subject: readNonEmptyString(value.subject),
    jurisdiction: readNonEmptyString(value.jurisdiction),
    gradeLevels: readStringArray(value.gradeLevels),
    distance: readNonNegativeInt(value.distance),
    alignmentDirection,
  }
}

function parseStandardArray(value: unknown): KnowledgeGraphStandard[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    const standard = parseStandard(entry)
    return standard ? [standard] : []
  })
}

function parseSqlValue(value: unknown): string | number | boolean | null | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  return undefined
}

function parseSqlRows(value: unknown): SqlQueryRow[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return []
    }

    const row: SqlQueryRow = {}
    for (const [key, cellValue] of Object.entries(entry)) {
      const parsedValue = parseSqlValue(cellValue)
      if (parsedValue !== undefined) {
        row[key] = parsedValue
      }
    }

    return [row]
  })
}

function parseResolution(value: unknown): KnowledgeGraphResolution | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const standard = parseStandard(value.standard)
  if (!standard) {
    return undefined
  }

  const matchStrategy =
    value.matchStrategy === "exact_code" ||
    value.matchStrategy === "ranked_code_match" ||
    value.matchStrategy === "search_fallback"
      ? value.matchStrategy
      : undefined

  return {
    matchStrategy,
    standard,
    alternatives: parseStandardArray(value.alternatives),
    parents: parseStandardArray(value.parents),
    children: parseStandardArray(value.children),
  }
}

function knowledgeGraphValue(state: ToolPartProps["state"]): Record<string, unknown> | undefined {
  if (isRecord(state.metadata.value)) {
    return state.metadata.value
  }

  if (typeof state.output !== "string") {
    return undefined
  }

  try {
    const parsed: unknown = JSON.parse(state.output)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function parseKnowledgeGraphResult(
  tool: ToolPartProps["tool"],
  state: ToolPartProps["state"],
): KnowledgeGraphParsedResult | undefined {
  const value = knowledgeGraphValue(state)
  if (!value) {
    return undefined
  }

  switch (tool) {
    case "search_standards":
      return {
        kind: "search_standards",
        query: readNonEmptyString(isRecord(value.query) ? value.query.query : undefined),
        resultCount:
          readNonNegativeInt(value.resultCount) ?? parseStandardArray(value.results).length,
        results: parseStandardArray(value.results),
      }
    case "get_standard": {
      const resolution = parseResolution(value)
      return resolution ? { kind: "get_standard", resolution } : undefined
    }
    case "get_learning_components": {
      const resolution = parseResolution(value.standard)
      if (!resolution) {
        return undefined
      }

      const componentValues = Array.isArray(value.components)
        ? value.components.flatMap((entry) => {
            if (!isRecord(entry)) {
              return []
            }
            const description = readNonEmptyString(entry.description)
            return description ? [description] : []
          })
        : []

      return {
        kind: "get_learning_components",
        resolution,
        componentCount: readNonNegativeInt(value.componentCount) ?? componentValues.length,
        components: componentValues,
      }
    }
    case "get_prerequisites":
    case "get_next_standards": {
      const resolution = parseResolution(value.standard)
      if (!resolution) {
        return undefined
      }

      const standards =
        tool === "get_prerequisites"
          ? parseStandardArray(value.prerequisites)
          : parseStandardArray(value.nextStandards)
      const countKey =
        tool === "get_prerequisites" ? value.prerequisiteCount : value.nextStandardCount

      return {
        kind: tool,
        resolution,
        count: readNonNegativeInt(countKey) ?? standards.length,
        standards,
      }
    }
    case "get_crosswalk": {
      const resolution = parseResolution(value.standard)
      if (!resolution) {
        return undefined
      }

      const crosswalks = parseStandardArray(value.crosswalks)
      return {
        kind: "get_crosswalk",
        resolution,
        crosswalkCount: readNonNegativeInt(value.crosswalkCount) ?? crosswalks.length,
        crosswalks,
      }
    }
    case "query_standards_sql":
      return {
        kind: "query_standards_sql",
        sql: readNonEmptyString(value.sql),
        rowCount: readNonNegativeInt(value.rowCount) ?? 0,
        truncated: value.truncated === true,
        rows: parseSqlRows(value.rows),
      }
    default:
      return undefined
  }
}

function formatGrades(gradeLevels: string[]): string | undefined {
  if (gradeLevels.length === 0) {
    return undefined
  }

  return `Grades ${gradeLevels.join(", ")}`
}

function formatStandardLabel(standard: KnowledgeGraphStandard): string {
  if (standard.code && standard.jurisdiction) {
    return `${standard.code} · ${standard.jurisdiction}`
  }

  return standard.code ?? standard.jurisdiction ?? "Standard"
}

function standardKey(standard: KnowledgeGraphStandard): string {
  return [
    standard.code ?? "uncoded",
    standard.jurisdiction ?? "unknown-jurisdiction",
    standard.description ?? "no-description",
    standard.distance?.toString() ?? "no-distance",
    standard.alignmentDirection ?? "no-direction",
  ].join(":")
}

function renderRemainingCount(total: number) {
  if (total <= KNOWLEDGE_GRAPH_PREVIEW_LIMIT) {
    return null
  }

  return (
    <div className="text-xs text-text-weak/55">
      +{(total - KNOWLEDGE_GRAPH_PREVIEW_LIMIT).toLocaleString()} more
    </div>
  )
}

function KnowledgeGraphSection(props: { title: string; count?: number; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border-base/45 bg-background-base/35 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-weak/55">
          {props.title}
        </div>
        {typeof props.count === "number" ? (
          <Badge variant="outline" className="text-[10px] text-text-weak/60">
            {props.count.toLocaleString()}
          </Badge>
        ) : null}
      </div>
      <div className="mt-2 flex flex-col gap-2">{props.children}</div>
    </div>
  )
}

function StandardCard(props: {
  standard: KnowledgeGraphStandard
  badge?: string
  descriptionOverride?: string
}) {
  const grades = formatGrades(props.standard.gradeLevels)
  const description = props.descriptionOverride ?? props.standard.description

  return (
    <div className="rounded-md border border-border-base/45 bg-background-base/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-medium text-text-weak">
          {formatStandardLabel(props.standard)}
        </div>
        {props.badge ? (
          <Badge variant="outline" className="text-[10px] text-text-weak/60">
            {props.badge}
          </Badge>
        ) : null}
        {props.standard.subject ? (
          <Badge variant="outline" className="text-[10px] text-text-weak/60">
            {props.standard.subject}
          </Badge>
        ) : null}
        {grades ? (
          <Badge variant="outline" className="text-[10px] text-text-weak/60">
            {grades}
          </Badge>
        ) : null}
      </div>
      {description ? (
        <div className="mt-1 text-xs leading-5 text-text-weak/65">{description}</div>
      ) : null}
    </div>
  )
}

function StandardList(props: {
  standards: KnowledgeGraphStandard[]
  badgeForStandard?: (standard: KnowledgeGraphStandard) => string | undefined
}) {
  if (props.standards.length === 0) {
    return <div className="text-xs text-text-weak/55">None</div>
  }

  return (
    <>
      {props.standards.slice(0, KNOWLEDGE_GRAPH_PREVIEW_LIMIT).map((standard) => (
        <StandardCard
          key={standardKey(standard)}
          standard={standard}
          badge={props.badgeForStandard ? props.badgeForStandard(standard) : undefined}
        />
      ))}
      {renderRemainingCount(props.standards.length)}
    </>
  )
}

function KnowledgeGraphBody(props: { parsed: KnowledgeGraphParsedResult }) {
  switch (props.parsed.kind) {
    case "search_standards":
      return (
        <KnowledgeGraphSection title="Matches" count={props.parsed.resultCount}>
          {props.parsed.results.length > 0 ? (
            <StandardList standards={props.parsed.results} />
          ) : (
            <div className="text-xs text-text-weak/55">No standards matched the query.</div>
          )}
        </KnowledgeGraphSection>
      )
    case "get_standard":
      return (
        <div className="flex flex-col gap-3">
          <StandardCard
            standard={props.parsed.resolution.standard}
            badge={
              props.parsed.resolution.matchStrategy
                ? MATCH_STRATEGY_LABELS[props.parsed.resolution.matchStrategy]
                : undefined
            }
          />
          <KnowledgeGraphSection title="Parents" count={props.parsed.resolution.parents.length}>
            <StandardList standards={props.parsed.resolution.parents} />
          </KnowledgeGraphSection>
          <KnowledgeGraphSection title="Children" count={props.parsed.resolution.children.length}>
            <StandardList standards={props.parsed.resolution.children} />
          </KnowledgeGraphSection>
          <KnowledgeGraphSection
            title="Alternative Matches"
            count={props.parsed.resolution.alternatives.length}
          >
            <StandardList standards={props.parsed.resolution.alternatives} />
          </KnowledgeGraphSection>
        </div>
      )
    case "get_learning_components":
      return (
        <div className="flex flex-col gap-3">
          <StandardCard standard={props.parsed.resolution.standard} />
          <KnowledgeGraphSection title="Learning Components" count={props.parsed.componentCount}>
            {props.parsed.components.length > 0 ? (
              <>
                {props.parsed.components
                  .slice(0, KNOWLEDGE_GRAPH_PREVIEW_LIMIT)
                  .map((component) => (
                    <div
                      key={component}
                      className="rounded-md border border-border-base/45 bg-background-base/40 px-3 py-2 text-xs leading-5 text-text-weak/70"
                    >
                      {component}
                    </div>
                  ))}
                {renderRemainingCount(props.parsed.components.length)}
              </>
            ) : (
              <div className="text-xs text-text-weak/55">No learning components found.</div>
            )}
          </KnowledgeGraphSection>
        </div>
      )
    case "get_prerequisites":
    case "get_next_standards":
      return (
        <div className="flex flex-col gap-3">
          <StandardCard standard={props.parsed.resolution.standard} />
          <KnowledgeGraphSection
            title={props.parsed.kind === "get_prerequisites" ? "Prerequisites" : "Next Standards"}
            count={props.parsed.count}
          >
            <StandardList
              standards={props.parsed.standards}
              badgeForStandard={(standard) =>
                typeof standard.distance === "number" ? `Depth ${standard.distance}` : undefined
              }
            />
          </KnowledgeGraphSection>
        </div>
      )
    case "get_crosswalk":
      return (
        <div className="flex flex-col gap-3">
          <StandardCard standard={props.parsed.resolution.standard} />
          <KnowledgeGraphSection title="Crosswalks" count={props.parsed.crosswalkCount}>
            <StandardList
              standards={props.parsed.crosswalks}
              badgeForStandard={(standard) =>
                standard.alignmentDirection
                  ? ALIGNMENT_DIRECTION_LABELS[standard.alignmentDirection]
                  : undefined
              }
            />
          </KnowledgeGraphSection>
        </div>
      )
    case "query_standards_sql": {
      const sqlPreviewKeyPrefix = props.parsed.sql ?? "sql-row"

      return (
        <div className="flex flex-col gap-3">
          {props.parsed.sql ? (
            <KnowledgeGraphSection title="SQL">
              <div className="overflow-x-auto rounded-md border border-border-base/45 bg-background-base/40 px-3 py-2 font-mono text-[11px] leading-5 text-text-weak/70">
                {props.parsed.sql}
              </div>
            </KnowledgeGraphSection>
          ) : null}
          <KnowledgeGraphSection title="Rows" count={props.parsed.rowCount}>
            {props.parsed.rows.length > 0 ? (
              <>
                {props.parsed.rows.slice(0, KNOWLEDGE_GRAPH_PREVIEW_LIMIT).map((row) => (
                  <div
                    key={`${sqlPreviewKeyPrefix}:${JSON.stringify(row)}`}
                    className="overflow-x-auto rounded-md border border-border-base/45 bg-background-base/40 px-3 py-2"
                  >
                    <pre className="text-[11px] leading-5 text-text-weak/70">
                      {JSON.stringify(row, null, 2)}
                    </pre>
                  </div>
                ))}
                {props.parsed.truncated ? (
                  <div className="text-xs text-text-weak/55">
                    Results were truncated to the configured row limit.
                  </div>
                ) : null}
                {renderRemainingCount(props.parsed.rows.length)}
              </>
            ) : (
              <div className="text-xs text-text-weak/55">The query returned no rows.</div>
            )}
          </KnowledgeGraphSection>
        </div>
      )
    }
  }
}

export function renderKnowledgeGraphTool(props: ToolPartProps) {
  const output = props.state.output || (props.state.error ?? "")
  const showOutput = output.trim().length > 0
  const parsed = parseKnowledgeGraphResult(props.tool, props.state)
  const running = props.state.status === "pending" || props.state.status === "running"

  return (
    <BasicTool
      trigger={{ title: props.info.title, subtitle: props.info.subtitle }}
      status={props.state.status}
      defaultOpen={props.defaultOpen ?? props.state.status === "error"}
    >
      {running ? <div className="text-xs text-text-weak/65">{runningLabel(props.tool)}</div> : null}
      {!running && parsed ? <KnowledgeGraphBody parsed={parsed} /> : null}
      {props.state.status === "error" && showOutput ? <ToolErrorPanel error={output} /> : null}
      {!running && !parsed && props.state.status !== "error" && showOutput ? (
        <ToolOutputPanel output={output} copyLabel={language.t("chatTools.copyOutput")} />
      ) : null}
    </BasicTool>
  )
}
