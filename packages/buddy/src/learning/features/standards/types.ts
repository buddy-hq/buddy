export type KnowledgeGraphStandardRecord = {
  id: string
  code: string | null
  description: string | null
  subject: string | null
  jurisdiction: string | null
  grade_level: string | null
  case_uuid: string | null
}

export type KnowledgeGraphLearningComponentRecord = {
  id: string
  description: string | null
  subject: string | null
}

export type KnowledgeGraphStandard = {
  id: string
  code: string
  description: string
  subject: string | null
  jurisdiction: string | null
  gradeLevels: string[]
  caseIdentifierUUID: string | null
}

export type KnowledgeGraphLearningComponent = {
  id: string
  description: string
  subject: string | null
}

export type KnowledgeGraphProgressionNode = KnowledgeGraphStandard & {
  distance: number
}

export type KnowledgeGraphCrosswalk = KnowledgeGraphStandard & {
  alignmentDirection: "outbound" | "inbound"
}

export type KnowledgeGraphStandardResolution = {
  query: {
    code: string
    jurisdiction?: string
  }
  matchStrategy: "exact_code" | "ranked_code_match" | "search_fallback"
  standard: KnowledgeGraphStandard
  alternatives: KnowledgeGraphStandard[]
  parents: KnowledgeGraphStandard[]
  children: KnowledgeGraphStandard[]
}

export type KnowledgeGraphSearchInput = {
  query: string
  subject?: string
  jurisdiction?: string
  gradeLevel?: string
  limit?: number
}

export type KnowledgeGraphResolveInput = {
  code: string
  jurisdiction?: string
}

export type KnowledgeGraphComponentsInput = KnowledgeGraphResolveInput & {
  limit?: number
}

export type KnowledgeGraphProgressionInput = KnowledgeGraphResolveInput & {
  depth?: number
  limit?: number
}

export type KnowledgeGraphCrosswalkInput = KnowledgeGraphResolveInput & {
  targetJurisdiction?: string
  limit?: number
}

export type KnowledgeGraphSqlValue = string | number | boolean | null

export type KnowledgeGraphSqlRow = Record<string, KnowledgeGraphSqlValue>

export type KnowledgeGraphSqlQueryInput = {
  sql: string
  rowLimit?: number
}

export type KnowledgeGraphSqlQueryResult = {
  sql: string
  rowCount: number
  truncated: boolean
  rows: KnowledgeGraphSqlRow[]
}
