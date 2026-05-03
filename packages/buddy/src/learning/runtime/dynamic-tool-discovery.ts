import z from "zod"
import type { Config } from "@buddy/backend/config"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { createBuddyTool } from "./create-buddy-tool"
import {
  DynamicLearningToolSearchResultSchema,
  type DynamicLearningToolSearchResultMetadata,
} from "./dynamic-tool-catalog"
import {
  dynamicLearningToolSearchCandidateIDsForSession,
  grantDynamicLearningToolsForSession,
  recordDynamicLearningToolSearchCandidates,
} from "./dynamic-tool-grants"
import {
  MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER,
  searchDynamicLearningTools,
  selectDynamicLearningToolsByID,
  type DynamicLearningToolFilteredEntry,
  type DynamicLearningToolSearchMatch,
} from "./dynamic-tool-search"
import { getBuddyPersona } from "../personas/wiring/persona-profiles"
import { isPersona, type Persona } from "../shared/teaching-vocabulary"
import { readTeachingSessionState } from "../agent-execution/state/session-state"
import type { PersonaDefinition } from "../shared/runtime-types"

const LEARNING_TOOL_SEARCH_TOOL_ID = "learning_tool_search"
const LEARNING_TOOL_LOAD_TOOL_ID = "learning_tool_load"
const DEFAULT_PERSONA_ID = "buddy" as const satisfies Persona
const NO_RESULTS_OUTPUT = "No dynamic learning tools matched the query."
const NO_EXPOSED_TOOLS_OUTPUT =
  "No dynamic learning tools were exposed. Call `learning_tool_search` first, then pass exact returned tool IDs to `learning_tool_load`."
const DYNAMIC_LEARNING_TOOL_SOURCE_DESCRIPTION =
  "- Dynamic tools: Buddy learning tools provided by the current session."
const HIDDEN_SUMMARY_PRESENTATION = "hidden-summary" as const

const DynamicLearningToolSearchParameters = z.object({
  query: z.string().trim().min(1).describe("Search query for deferred tools."),
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER)
    .optional()
    .describe(
      `Maximum number of dynamic tool candidates to return. Defaults to ${MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER}.`,
    ),
})

const DynamicLearningToolLoadParameters = z.object({
  toolIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER)
    .describe("Exact dynamic tool IDs returned by the latest learning_tool_search call."),
})

type DynamicLearningToolContext = {
  projectConfig: Config.Info
  persona: PersonaDefinition
}

function resolveSearchPersona(input: {
  agent: string
  statePersona?: string
  configDefaultPersona?: Persona
}): Persona {
  if (input.statePersona && isPersona(input.statePersona)) return input.statePersona
  if (isPersona(input.agent)) return input.agent
  return input.configDefaultPersona ?? DEFAULT_PERSONA_ID
}

async function resolveDynamicLearningToolContext(input: {
  directory: string
  sessionID: string
  agent: string
}): Promise<DynamicLearningToolContext> {
  const [projectConfig, teachingState] = await Promise.all([
    readProjectConfig(input.directory),
    Promise.resolve(readTeachingSessionState(input.directory, input.sessionID)),
  ])
  const personaID = resolveSearchPersona({
    agent: input.agent,
    statePersona: teachingState?.persona,
    configDefaultPersona: projectConfig.default_persona,
  })

  return {
    projectConfig,
    persona: getBuddyPersona(personaID, projectConfig.personas),
  }
}

function formatSearchMatches(matches: readonly DynamicLearningToolSearchMatch[]): string[] {
  if (matches.length === 0) return [NO_RESULTS_OUTPUT]

  return [
    "Matching dynamic learning tools:",
    ...matches.map((match) =>
      [
        `- ${match.entry.id}: ${match.entry.title}`,
        `  Why it matched: ${match.reasons.join("; ") || "ranked by catalog metadata"}`,
      ].join("\n"),
    ),
    "To expose tools for this session, call `learning_tool_load` with exact IDs from this list.",
    "Do not call dynamic learning tools until `learning_tool_load` reports that they were exposed.",
  ]
}

function formatLoadedMatches(input: {
  matches: readonly DynamicLearningToolSearchMatch[]
  exposedToolIDs: readonly string[]
  rejectedToolIDs: readonly string[]
}): string[] {
  const { matches, exposedToolIDs, rejectedToolIDs } = input
  if (exposedToolIDs.length === 0) {
    return [
      NO_EXPOSED_TOOLS_OUTPUT,
      ...(rejectedToolIDs.length > 0
        ? [`Rejected IDs not returned by latest search: ${rejectedToolIDs.join(", ")}`]
        : []),
    ]
  }

  return [
    "Exposed dynamic learning tools:",
    ...matches
      .filter((match) => exposedToolIDs.includes(match.entry.id))
      .map((match) => `- ${match.entry.id}: ${match.entry.title}`),
    ...(rejectedToolIDs.length > 0
      ? [`Rejected IDs not returned by latest search: ${rejectedToolIDs.join(", ")}`]
      : []),
    "These tools remain available to call in this session until the session ends or is explicitly cleared.",
    "Do not call dynamic learning tools that were not listed here.",
  ]
}

function formatFiltered(filtered: readonly DynamicLearningToolFilteredEntry[]): string[] {
  if (filtered.length === 0) return []

  const useful = filtered.filter((entry) => entry.reason === "config")
  if (useful.length === 0) return []

  return [
    "Filtered dynamic learning tools:",
    ...useful.map((entry) => `- ${entry.id}: ${entry.reason}`),
  ]
}

function searchResultMetadata(
  matches: readonly DynamicLearningToolSearchMatch[],
): DynamicLearningToolSearchResultMetadata[] {
  return matches.map((match) =>
    DynamicLearningToolSearchResultSchema.parse({
      id: match.entry.id,
      title: match.entry.title,
      description: match.entry.description,
      useCase: match.entry.useCase,
      reasons: match.reasons,
      score: match.score,
    }),
  )
}

const learningToolSearchTool = createBuddyTool({
  id: LEARNING_TOOL_SEARCH_TOOL_ID,
  description: [
    "# Dynamic learning tool discovery",
    "",
    "Searches over deferred Buddy learning tool metadata with BM25-style scoring and returns loadable tool candidates.",
    "",
    "You have access to tools from the following sources:",
    DYNAMIC_LEARNING_TOOL_SOURCE_DESCRIPTION,
    "Some of the tools may not have been provided to you upfront, and you should use this tool (`learning_tool_search`) to search for the required tools.",
    "Search does not expose or execute dynamic tools. Use `learning_tool_load` with exact returned IDs before calling a dynamic learning tool.",
    "",
    "For Buddy pedagogy, search by capability, exact dynamic tool ID, or teaching need. Examples: `reflection metacognition misconception repair`, `debug failed attempt`, `stepwise solve guided hint`.",
  ].join("\n"),
  parameters: DynamicLearningToolSearchParameters,
  ui: {
    presentation: HIDDEN_SUMMARY_PRESENTATION,
    labels: {
      idle: "Search learning tools",
      running: "Searching learning tools",
    },
  },
  async execute(params, ctx) {
    const { projectConfig, persona } = await resolveDynamicLearningToolContext({
      directory: ctx.directory,
      sessionID: ctx.sessionID,
      agent: ctx.agent,
    })

    const result = searchDynamicLearningTools({
      query: params.query,
      persona,
      configuredToolToggles: projectConfig.tools,
      limit: params.limit,
    })

    const matchedToolIDs = result.matches.map((match) => match.entry.id)
    recordDynamicLearningToolSearchCandidates({
      directory: ctx.directory,
      sessionID: ctx.sessionID,
      toolIDs: matchedToolIDs,
    })

    const output = [
      ...formatSearchMatches(result.matches),
      ...formatFiltered(result.filtered),
    ].join("\n")

    return {
      title: LEARNING_TOOL_SEARCH_TOOL_ID,
      output,
      metadata: {
        query: params.query,
        persona: persona.id,
        matchedToolIds: matchedToolIDs,
        matches: searchResultMetadata(result.matches),
        filtered: result.filtered,
        nextTool: LEARNING_TOOL_LOAD_TOOL_ID,
      },
    }
  },
})

const learningToolLoadTool = createBuddyTool({
  id: LEARNING_TOOL_LOAD_TOOL_ID,
  description: [
    "# Dynamic learning tool loading",
    "",
    "Exposes exact dynamic learning tools returned by the latest `learning_tool_search` call for this session.",
    "",
    "Use this after `learning_tool_search` when a dynamic learning tool is not already loaded. Pass exact tool IDs from the most recent search result. This tool grants session-scoped access; it does not execute the loaded dynamic tools.",
  ].join("\n"),
  parameters: DynamicLearningToolLoadParameters,
  ui: {
    presentation: HIDDEN_SUMMARY_PRESENTATION,
    labels: {
      idle: "Load learning tools",
      running: "Loading learning tools",
    },
  },
  async execute(params, ctx) {
    const candidates = dynamicLearningToolSearchCandidateIDsForSession({
      directory: ctx.directory,
      sessionID: ctx.sessionID,
    })
    const requestedToolIDs = Array.from(new Set(params.toolIds))
    const loadableToolIDs = requestedToolIDs.filter((toolID) => candidates.has(toolID))
    const rejectedToolIDs = requestedToolIDs.filter((toolID) => !candidates.has(toolID))
    const { projectConfig, persona } = await resolveDynamicLearningToolContext({
      directory: ctx.directory,
      sessionID: ctx.sessionID,
      agent: ctx.agent,
    })

    const result = selectDynamicLearningToolsByID({
      ids: loadableToolIDs,
      persona,
      configuredToolToggles: projectConfig.tools,
    })
    const exposedToolIDs =
      result.matches.length > 0
        ? await grantDynamicLearningToolsForSession({
            directory: ctx.directory,
            sessionID: ctx.sessionID,
            tools: result.matches.map((match) => match.entry.tool),
          })
        : []
    const output = [
      ...formatLoadedMatches({
        matches: result.matches,
        exposedToolIDs,
        rejectedToolIDs,
      }),
      ...formatFiltered(result.filtered),
    ].join("\n")

    return {
      title: LEARNING_TOOL_LOAD_TOOL_ID,
      output,
      metadata: {
        requestedToolIds: requestedToolIDs,
        rejectedToolIds: rejectedToolIDs,
        registeredToolIds: exposedToolIDs,
        matches: searchResultMetadata(result.matches),
        filtered: result.filtered,
        grantScope: "session",
      },
    }
  },
})

const dynamicToolSearchTools = [learningToolSearchTool, learningToolLoadTool] as const

export { dynamicToolSearchTools }
