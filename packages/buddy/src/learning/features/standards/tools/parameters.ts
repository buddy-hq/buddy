import z from "zod"
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
} from "../constants"

const optionalJurisdiction = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe("Optional jurisdiction such as Multi-State, California, or Texas.")

export const searchStandardsParameters = z.object({
  query: z.string().trim().min(1).describe("Keyword, topic, or standard code to search for."),
  subject: z.string().trim().min(1).optional().describe("Optional subject filter."),
  jurisdiction: optionalJurisdiction,
  gradeLevel: z.string().trim().min(1).optional().describe("Optional grade-level filter."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(KNOWLEDGE_GRAPH_MAX_RESULT_LIMIT)
    .default(KNOWLEDGE_GRAPH_DEFAULT_RESULT_LIMIT),
})

export const resolveStandardParameters = z.object({
  code: z.string().trim().min(1).describe("Standard code such as 6.NS.B.4 or HSG-CO.B.6."),
  jurisdiction: optionalJurisdiction,
})

export const learningComponentsParameters = resolveStandardParameters.extend({
  limit: z
    .number()
    .int()
    .min(1)
    .max(KNOWLEDGE_GRAPH_MAX_RESULT_LIMIT)
    .default(KNOWLEDGE_GRAPH_DEFAULT_COMPONENT_LIMIT),
})

export const progressionParameters = resolveStandardParameters.extend({
  depth: z
    .number()
    .int()
    .min(1)
    .max(KNOWLEDGE_GRAPH_MAX_PROGRESS_DEPTH)
    .default(KNOWLEDGE_GRAPH_DEFAULT_PROGRESS_DEPTH),
  limit: z
    .number()
    .int()
    .min(1)
    .max(KNOWLEDGE_GRAPH_MAX_RESULT_LIMIT)
    .default(KNOWLEDGE_GRAPH_DEFAULT_PROGRESS_LIMIT),
})

export const crosswalkParameters = resolveStandardParameters.extend({
  targetJurisdiction: optionalJurisdiction.describe(
    "Optional destination jurisdiction filter for equivalent standards.",
  ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(KNOWLEDGE_GRAPH_MAX_RESULT_LIMIT)
    .default(KNOWLEDGE_GRAPH_DEFAULT_CROSSWALK_LIMIT),
})

export const sqlQueryParameters = z.object({
  sql: z
    .string()
    .trim()
    .min(1)
    .describe(
      "A single SQLite read-only statement. SELECT, WITH, PRAGMA, and EXPLAIN are supported.",
    ),
  rowLimit: z
    .number()
    .int()
    .min(1)
    .max(KNOWLEDGE_GRAPH_MAX_SQL_ROW_LIMIT)
    .default(KNOWLEDGE_GRAPH_DEFAULT_SQL_ROW_LIMIT),
})
