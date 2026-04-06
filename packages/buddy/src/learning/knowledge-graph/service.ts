import { Database } from "bun:sqlite"
import {
  KNOWLEDGE_GRAPH_DEFAULT_COMPONENT_LIMIT,
  KNOWLEDGE_GRAPH_DEFAULT_CROSSWALK_LIMIT,
  KNOWLEDGE_GRAPH_DEFAULT_PROGRESS_DEPTH,
  KNOWLEDGE_GRAPH_DEFAULT_PROGRESS_LIMIT,
  KNOWLEDGE_GRAPH_DEFAULT_RESULT_LIMIT,
  KNOWLEDGE_GRAPH_DEFAULT_SQL_ROW_LIMIT,
  KNOWLEDGE_GRAPH_MAX_PROGRESS_DEPTH,
  KNOWLEDGE_GRAPH_MAX_RESULT_LIMIT,
  KNOWLEDGE_GRAPH_MAX_SQL_ROW_LIMIT,
  KNOWLEDGE_GRAPH_RELATIONSHIP_BUILDS_TOWARDS,
  KNOWLEDGE_GRAPH_RELATIONSHIP_HAS_CHILD,
  KNOWLEDGE_GRAPH_RELATIONSHIP_HAS_STANDARD_ALIGNMENT,
  KNOWLEDGE_GRAPH_RELATIONSHIP_SUPPORTS,
} from "./constants"
import { requireKnowledgeGraphDatabasePath } from "./path"
import type {
  KnowledgeGraphComponentsInput,
  KnowledgeGraphCrosswalk,
  KnowledgeGraphCrosswalkInput,
  KnowledgeGraphLearningComponent,
  KnowledgeGraphLearningComponentRecord,
  KnowledgeGraphProgressionInput,
  KnowledgeGraphProgressionNode,
  KnowledgeGraphResolveInput,
  KnowledgeGraphSearchInput,
  KnowledgeGraphSqlQueryInput,
  KnowledgeGraphSqlQueryResult,
  KnowledgeGraphSqlRow,
  KnowledgeGraphSqlValue,
  KnowledgeGraphStandard,
  KnowledgeGraphStandardRecord,
  KnowledgeGraphStandardResolution,
} from "./types"

type KnowledgeGraphServiceConfig = {
  databasePath?: string
}

type SearchRankedStandard = KnowledgeGraphStandard & {
  score: number
}

type ProgressionRow = KnowledgeGraphStandardRecord & {
  distance: number
}

type CrosswalkRow = KnowledgeGraphStandardRecord & {
  alignmentDirection: "outbound" | "inbound"
}

type SearchFilters = {
  subject?: string
  jurisdiction?: string
  gradeLevel?: string
}

const EXACT_CODE_SCORE = 1_000
const NORMALIZED_CODE_SCORE = 950
const PREFIX_CODE_SCORE = 700
const CONTAINS_CODE_SCORE = 500
const DESCRIPTION_TOKEN_SCORE = 120
const JURISDICTION_EXACT_SCORE = 80
const MULTI_STATE_BONUS_SCORE = 25

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function normalizeLimit(value: number | undefined, fallback: number) {
  if (value === undefined) {
    return fallback
  }

  return Math.max(1, Math.min(value, KNOWLEDGE_GRAPH_MAX_RESULT_LIMIT))
}

function normalizeDepth(value: number | undefined) {
  if (value === undefined) {
    return KNOWLEDGE_GRAPH_DEFAULT_PROGRESS_DEPTH
  }

  return Math.max(1, Math.min(value, KNOWLEDGE_GRAPH_MAX_PROGRESS_DEPTH))
}

function normalizeSqlRowLimit(value: number | undefined) {
  if (value === undefined) {
    return KNOWLEDGE_GRAPH_DEFAULT_SQL_ROW_LIMIT
  }

  return Math.max(1, Math.min(value, KNOWLEDGE_GRAPH_MAX_SQL_ROW_LIMIT))
}

const SQLITE_READ_ONLY_KEYWORDS = new Set(["select", "with", "pragma", "explain"])

const SQLITE_WRITE_KEYWORDS = new Set([
  "insert",
  "update",
  "delete",
  "replace",
  "create",
  "alter",
  "drop",
  "attach",
  "detach",
  "vacuum",
  "reindex",
  "analyze",
  "begin",
  "commit",
  "rollback",
  "savepoint",
  "release",
])

function normalizeSqlStatement(sql: string) {
  const trimmed = sql.trim()
  if (trimmed.length === 0) {
    throw new Error("Knowledge Graph SQL query requires a non-empty statement.")
  }

  const withoutTrailingSemicolons = trimmed.replace(/[;\s]+$/u, "")
  if (withoutTrailingSemicolons.length === 0) {
    throw new Error("Knowledge Graph SQL query requires a non-empty statement.")
  }

  if (withoutTrailingSemicolons.includes(";")) {
    throw new Error("Knowledge Graph SQL query must contain exactly one statement.")
  }

  const firstToken = withoutTrailingSemicolons.match(/^[A-Za-z]+/u)?.[0]?.toLowerCase()
  if (!firstToken) {
    throw new Error("Knowledge Graph SQL query must begin with a SQLite statement keyword.")
  }

  if (SQLITE_WRITE_KEYWORDS.has(firstToken)) {
    throw new Error(`Knowledge Graph SQL query must be read-only. "${firstToken}" is not allowed.`)
  }

  if (!SQLITE_READ_ONLY_KEYWORDS.has(firstToken)) {
    throw new Error(
      `Knowledge Graph SQL query must be read-only. "${firstToken}" is not a supported statement.`,
    )
  }

  return withoutTrailingSemicolons
}

function normalizeSqlValue(value: unknown): KnowledgeGraphSqlValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (value instanceof Uint8Array) {
    return `[blob ${value.byteLength} bytes]`
  }

  return String(value)
}

function normalizeSqlRow(row: Record<string, unknown>): KnowledgeGraphSqlRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeSqlValue(value)]),
  )
}

function parseGradeLevels(value: string | null) {
  if (!value) {
    return []
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string")
    }
  } catch {
    // Fall back to treating the value as a single scalar.
  }

  return [trimmed]
}

function toStandard(record: KnowledgeGraphStandardRecord): KnowledgeGraphStandard {
  return {
    id: record.id,
    code: record.code ?? "",
    description: record.description ?? "",
    subject: record.subject,
    jurisdiction: record.jurisdiction,
    gradeLevels: parseGradeLevels(record.grade_level),
    caseIdentifierUUID: record.case_uuid,
  }
}

function toLearningComponent(
  record: KnowledgeGraphLearningComponentRecord,
): KnowledgeGraphLearningComponent {
  return {
    id: record.id,
    description: record.description ?? "",
    subject: record.subject,
  }
}

function toProgressionNode(row: ProgressionRow): KnowledgeGraphProgressionNode {
  return {
    ...toStandard(row),
    distance: row.distance,
  }
}

function toCrosswalk(row: CrosswalkRow): KnowledgeGraphCrosswalk {
  return {
    ...toStandard(row),
    alignmentDirection: row.alignmentDirection,
  }
}

function gradeLevelMatches(record: KnowledgeGraphStandardRecord, gradeLevel: string | undefined) {
  if (!gradeLevel) {
    return true
  }

  const normalizedGradeLevel = normalizeWhitespace(gradeLevel).toLowerCase()
  return parseGradeLevels(record.grade_level).some(
    (entry) => normalizeWhitespace(entry).toLowerCase() === normalizedGradeLevel,
  )
}

function standardMatchesFilters(record: KnowledgeGraphStandardRecord, filters: SearchFilters) {
  if (
    filters.subject &&
    normalizeWhitespace(record.subject ?? "").toLowerCase() !==
      normalizeWhitespace(filters.subject).toLowerCase()
  ) {
    return false
  }

  if (
    filters.jurisdiction &&
    normalizeWhitespace(record.jurisdiction ?? "").toLowerCase() !==
      normalizeWhitespace(filters.jurisdiction).toLowerCase()
  ) {
    return false
  }

  return gradeLevelMatches(record, filters.gradeLevel)
}

function isCodeLikeQuery(query: string) {
  const trimmed = normalizeWhitespace(query)
  if (!/^[A-Za-z0-9._\- ]+$/.test(trimmed)) {
    return false
  }

  return /\d/.test(trimmed) || /[._-]/.test(trimmed)
}

function searchTokens(query: string) {
  return normalizeWhitespace(query)
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 1)
}

function scoreStandardMatch(input: {
  record: KnowledgeGraphStandardRecord
  query: string
  jurisdiction?: string
}) {
  const query = normalizeWhitespace(input.query)
  const code = normalizeWhitespace(input.record.code ?? "")
  const description = normalizeWhitespace(input.record.description ?? "")
  const normalizedQueryCode = normalizeCode(query)
  const normalizedCode = normalizeCode(code)

  let score = 0

  if (code.localeCompare(query, undefined, { sensitivity: "accent" }) === 0) {
    score += EXACT_CODE_SCORE
  }

  if (normalizedQueryCode.length > 0 && normalizedCode === normalizedQueryCode) {
    score += NORMALIZED_CODE_SCORE
  }

  if (normalizedQueryCode.length > 0 && normalizedCode.startsWith(normalizedQueryCode)) {
    score += PREFIX_CODE_SCORE
  }

  if (normalizedQueryCode.length > 0 && normalizedCode.includes(normalizedQueryCode)) {
    score += CONTAINS_CODE_SCORE
  }

  const normalizedDescription = description.toLowerCase()
  for (const token of searchTokens(query)) {
    if (normalizedDescription.includes(token) || code.toLowerCase().includes(token)) {
      score += DESCRIPTION_TOKEN_SCORE
    }
  }

  if (
    input.jurisdiction &&
    normalizeWhitespace(input.record.jurisdiction ?? "").toLowerCase() ===
      normalizeWhitespace(input.jurisdiction).toLowerCase()
  ) {
    score += JURISDICTION_EXACT_SCORE
  }

  if (input.record.jurisdiction === "Multi-State") {
    score += MULTI_STATE_BONUS_SCORE
  }

  return score
}

function sortRankedStandards(left: SearchRankedStandard, right: SearchRankedStandard) {
  if (left.score !== right.score) {
    return right.score - left.score
  }

  const jurisdictionCompare = (left.jurisdiction ?? "").localeCompare(right.jurisdiction ?? "")
  if (jurisdictionCompare !== 0) {
    return jurisdictionCompare
  }

  const codeCompare = left.code.localeCompare(right.code)
  if (codeCompare !== 0) {
    return codeCompare
  }

  return left.id.localeCompare(right.id)
}

function dedupeById<T extends { id: string }>(values: readonly T[]) {
  const seen = new Set<string>()
  const deduped: T[] = []

  for (const value of values) {
    if (seen.has(value.id)) {
      continue
    }
    seen.add(value.id)
    deduped.push(value)
  }

  return deduped
}

export class KnowledgeGraphService {
  private readonly configuredDatabasePath: string | undefined

  private database: Database | undefined

  constructor(config: KnowledgeGraphServiceConfig = {}) {
    this.configuredDatabasePath = config.databasePath
  }

  private databasePath() {
    return this.configuredDatabasePath ?? requireKnowledgeGraphDatabasePath()
  }

  private connection() {
    if (!this.database) {
      this.database = new Database(this.databasePath(), {
        readonly: true,
        create: false,
      })
    }

    return this.database
  }

  private queryStandards(sql: string, ...params: (string | number)[]) {
    return this.connection()
      .query<KnowledgeGraphStandardRecord, (string | number)[]>(sql)
      .all(...params)
  }

  private queryLearningComponents(sql: string, ...params: (string | number)[]) {
    return this.connection()
      .query<KnowledgeGraphLearningComponentRecord, (string | number)[]>(sql)
      .all(...params)
  }

  runSqlQuery(input: KnowledgeGraphSqlQueryInput): KnowledgeGraphSqlQueryResult {
    const sql = normalizeSqlStatement(input.sql)
    const rowLimit = normalizeSqlRowLimit(input.rowLimit)
    const rawRows = this.connection().query<Record<string, unknown>, []>(sql).all()
    const rows = rawRows.slice(0, rowLimit).map(normalizeSqlRow)

    return {
      sql,
      rowCount: rows.length,
      truncated: rawRows.length > rowLimit,
      rows,
    }
  }

  searchStandards(input: KnowledgeGraphSearchInput): KnowledgeGraphStandard[] {
    const query = normalizeWhitespace(input.query)
    if (query.length === 0) {
      throw new Error("Knowledge Graph search requires a non-empty query.")
    }

    const limit = normalizeLimit(input.limit, KNOWLEDGE_GRAPH_DEFAULT_RESULT_LIMIT)
    const candidates: KnowledgeGraphStandardRecord[] = []

    const addCandidates = (records: KnowledgeGraphStandardRecord[]) => {
      for (const record of records) {
        if (!standardMatchesFilters(record, input)) {
          continue
        }
        candidates.push(record)
      }
    }

    if (isCodeLikeQuery(query)) {
      addCandidates(
        this.queryStandards(
          `
            select id, code, description, subject, jurisdiction, grade_level, case_uuid
            from standards
            where code is not null
              and (
                replace(replace(replace(replace(upper(code), '.', ''), '-', ''), ' ', ''), '_', '') = ?
                or upper(code) like ?
              )
            limit 200
          `,
          normalizeCode(query),
          `${query.toUpperCase()}%`,
        ),
      )
    }

    addCandidates(
      this.queryStandards(
        `
          select id, code, description, subject, jurisdiction, grade_level, case_uuid
          from standards
          where description is not null and lower(description) like ?
          limit 200
        `,
        `%${query.toLowerCase()}%`,
      ),
    )

    const ranked = dedupeById(candidates)
      .map((record) => {
        const standard = toStandard(record)
        return {
          id: standard.id,
          code: standard.code,
          description: standard.description,
          subject: standard.subject,
          jurisdiction: standard.jurisdiction,
          gradeLevels: standard.gradeLevels,
          caseIdentifierUUID: standard.caseIdentifierUUID,
          score: scoreStandardMatch({
            record,
            query,
            jurisdiction: input.jurisdiction,
          }),
        }
      })
      .filter((record) => record.score > 0)
      .toSorted(sortRankedStandards)

    return ranked.slice(0, limit).map(({ score: _score, ...record }) => record)
  }

  private directParents(standardID: string) {
    return this.queryStandards(
      `
        select s.id, s.code, s.description, s.subject, s.jurisdiction, s.grade_level, s.case_uuid
        from relationships r
        join standards s on s.id = r.source_id
        where r.label = ? and r.target_id = ?
        order by s.code, s.jurisdiction
        limit 25
      `,
      KNOWLEDGE_GRAPH_RELATIONSHIP_HAS_CHILD,
      standardID,
    ).map(toStandard)
  }

  private directChildren(standardID: string) {
    return this.queryStandards(
      `
        select s.id, s.code, s.description, s.subject, s.jurisdiction, s.grade_level, s.case_uuid
        from relationships r
        join standards s on s.id = r.target_id
        where r.label = ? and r.source_id = ?
        order by s.code, s.jurisdiction
        limit 25
      `,
      KNOWLEDGE_GRAPH_RELATIONSHIP_HAS_CHILD,
      standardID,
    ).map(toStandard)
  }

  private exactCodeCandidates(input: KnowledgeGraphResolveInput) {
    const records = this.queryStandards(
      `
        select id, code, description, subject, jurisdiction, grade_level, case_uuid
        from standards
        where code is not null
          and replace(replace(replace(replace(upper(code), '.', ''), '-', ''), ' ', ''), '_', '') = ?
      `,
      normalizeCode(input.code),
    )

    return records
      .filter((record) => standardMatchesFilters(record, { jurisdiction: input.jurisdiction }))
      .map((record) => {
        const standard = toStandard(record)
        return {
          id: standard.id,
          code: standard.code,
          description: standard.description,
          subject: standard.subject,
          jurisdiction: standard.jurisdiction,
          gradeLevels: standard.gradeLevels,
          caseIdentifierUUID: standard.caseIdentifierUUID,
          score: scoreStandardMatch({
            record,
            query: input.code,
            jurisdiction: input.jurisdiction,
          }),
        }
      })
      .toSorted(sortRankedStandards)
  }

  getStandard(input: KnowledgeGraphResolveInput): KnowledgeGraphStandardResolution {
    const exactMatches = this.exactCodeCandidates(input)

    if (exactMatches.length > 0) {
      const [selected, ...alternatives] = exactMatches
      return {
        query: {
          code: input.code,
          ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
        },
        matchStrategy:
          alternatives.length === 0 || input.jurisdiction ? "exact_code" : "ranked_code_match",
        standard: selected,
        alternatives: alternatives.map(({ score: _score, ...record }) => record).slice(0, 10),
        parents: this.directParents(selected.id),
        children: this.directChildren(selected.id),
      }
    }

    const searchFallback = this.searchStandards({
      query: input.code,
      jurisdiction: input.jurisdiction,
      limit: KNOWLEDGE_GRAPH_DEFAULT_RESULT_LIMIT,
    })

    const [selected, ...alternatives] = searchFallback
    if (!selected) {
      throw new Error(`No Knowledge Graph standard found for "${input.code}".`)
    }

    return {
      query: {
        code: input.code,
        ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
      },
      matchStrategy: "search_fallback",
      standard: selected,
      alternatives,
      parents: this.directParents(selected.id),
      children: this.directChildren(selected.id),
    }
  }

  getLearningComponents(input: KnowledgeGraphComponentsInput): KnowledgeGraphLearningComponent[] {
    const resolved = this.getStandard(input)
    const limit = normalizeLimit(input.limit, KNOWLEDGE_GRAPH_DEFAULT_COMPONENT_LIMIT)

    return this.queryLearningComponents(
      `
        select lc.id, lc.description, lc.subject
        from relationships r
        join learning_components lc on lc.id = r.source_id
        where r.label = ? and r.target_id = ?
        order by lc.description, lc.id
        limit ?
      `,
      KNOWLEDGE_GRAPH_RELATIONSHIP_SUPPORTS,
      resolved.standard.id,
      limit,
    ).map(toLearningComponent)
  }

  getPrerequisites(input: KnowledgeGraphProgressionInput): KnowledgeGraphProgressionNode[] {
    const resolved = this.getStandard(input)
    const depth = normalizeDepth(input.depth)
    const limit = normalizeLimit(input.limit, KNOWLEDGE_GRAPH_DEFAULT_PROGRESS_LIMIT)

    return this.connection()
      .query<ProgressionRow, (string | number)[]>(
        `
          with recursive prerequisite_chain(id, distance) as (
            select r.source_id, 1
            from relationships r
            where r.label = ? and r.target_id = ?
            union all
            select r.source_id, prerequisite_chain.distance + 1
            from prerequisite_chain
            join relationships r on r.target_id = prerequisite_chain.id
            where r.label = ? and prerequisite_chain.distance < ?
          )
          select
            s.id,
            s.code,
            s.description,
            s.subject,
            s.jurisdiction,
            s.grade_level,
            s.case_uuid,
            min(prerequisite_chain.distance) as distance
          from prerequisite_chain
          join standards s on s.id = prerequisite_chain.id
          group by s.id, s.code, s.description, s.subject, s.jurisdiction, s.grade_level, s.case_uuid
          order by distance, s.code, s.jurisdiction
          limit ?
        `,
      )
      .all(
        KNOWLEDGE_GRAPH_RELATIONSHIP_BUILDS_TOWARDS,
        resolved.standard.id,
        KNOWLEDGE_GRAPH_RELATIONSHIP_BUILDS_TOWARDS,
        depth,
        limit,
      )
      .map(toProgressionNode)
  }

  getNextStandards(input: KnowledgeGraphProgressionInput): KnowledgeGraphProgressionNode[] {
    const resolved = this.getStandard(input)
    const depth = normalizeDepth(input.depth)
    const limit = normalizeLimit(input.limit, KNOWLEDGE_GRAPH_DEFAULT_PROGRESS_LIMIT)

    return this.connection()
      .query<ProgressionRow, (string | number)[]>(
        `
          with recursive next_chain(id, distance) as (
            select r.target_id, 1
            from relationships r
            where r.label = ? and r.source_id = ?
            union all
            select r.target_id, next_chain.distance + 1
            from next_chain
            join relationships r on r.source_id = next_chain.id
            where r.label = ? and next_chain.distance < ?
          )
          select
            s.id,
            s.code,
            s.description,
            s.subject,
            s.jurisdiction,
            s.grade_level,
            s.case_uuid,
            min(next_chain.distance) as distance
          from next_chain
          join standards s on s.id = next_chain.id
          group by s.id, s.code, s.description, s.subject, s.jurisdiction, s.grade_level, s.case_uuid
          order by distance, s.code, s.jurisdiction
          limit ?
        `,
      )
      .all(
        KNOWLEDGE_GRAPH_RELATIONSHIP_BUILDS_TOWARDS,
        resolved.standard.id,
        KNOWLEDGE_GRAPH_RELATIONSHIP_BUILDS_TOWARDS,
        depth,
        limit,
      )
      .map(toProgressionNode)
  }

  getCrosswalk(input: KnowledgeGraphCrosswalkInput): KnowledgeGraphCrosswalk[] {
    const resolved = this.getStandard(input)
    const limit = normalizeLimit(input.limit, KNOWLEDGE_GRAPH_DEFAULT_CROSSWALK_LIMIT)

    return this.connection()
      .query<CrosswalkRow, (string | number)[]>(
        `
          with crosswalks as (
            select
              s.id,
              s.code,
              s.description,
              s.subject,
              s.jurisdiction,
              s.grade_level,
              s.case_uuid,
              'outbound' as alignmentDirection
            from relationships r
            join standards s on s.id = r.target_id
            where r.label = ? and r.source_id = ?
            union all
            select
              s.id,
              s.code,
              s.description,
              s.subject,
              s.jurisdiction,
              s.grade_level,
              s.case_uuid,
              'inbound' as alignmentDirection
            from relationships r
            join standards s on s.id = r.source_id
            where r.label = ? and r.target_id = ?
          )
          select distinct
            id,
            code,
            description,
            subject,
            jurisdiction,
            grade_level,
            case_uuid,
            alignmentDirection
          from crosswalks
          where id != ?
            and (? = '' or lower(jurisdiction) = lower(?))
          order by jurisdiction, code, id
          limit ?
        `,
      )
      .all(
        KNOWLEDGE_GRAPH_RELATIONSHIP_HAS_STANDARD_ALIGNMENT,
        resolved.standard.id,
        KNOWLEDGE_GRAPH_RELATIONSHIP_HAS_STANDARD_ALIGNMENT,
        resolved.standard.id,
        resolved.standard.id,
        input.targetJurisdiction ?? "",
        input.targetJurisdiction ?? "",
        limit,
      )
      .map(toCrosswalk)
  }
}

let defaultKnowledgeGraphService: KnowledgeGraphService | undefined

export function getKnowledgeGraphService() {
  defaultKnowledgeGraphService ??= new KnowledgeGraphService()
  return defaultKnowledgeGraphService
}
