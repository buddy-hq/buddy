import z from "zod"
import type { Config } from "@buddy/backend/config"
import type { BuddyTool } from "./create-buddy-tool"
import { createBuddyTool } from "./create-buddy-tool"
import type { DynamicLearningToolSearchResultMetadata } from "./dynamic-tool-catalog"
import type {
  DynamicLearningToolFilteredEntry,
  DynamicLearningToolSearchMatch,
} from "./dynamic-tool-search"
import { isPersona, type Persona } from "../shared/teaching-vocabulary"
import type { PersonaDefinition } from "../shared/runtime-types"

const LEARNING_TOOL_SEARCH_TOOL_ID = "learning_tool_search"
const LEARNING_TOOL_LOAD_TOOL_ID = "learning_tool_load"
const NO_RESULTS_OUTPUT = "No dynamic learning tools matched the query."
const NO_EXPOSED_TOOLS_OUTPUT =
  "No dynamic learning tools were exposed. Call `learning_tool_search` first, then pass exact returned tool IDs to `learning_tool_load`."
const DYNAMIC_LEARNING_TOOL_SOURCE_DESCRIPTION =
  "- Dynamic tools: Buddy learning tools provided by the current session."
const HIDDEN_SUMMARY_PRESENTATION = "hidden-summary" as const
const MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER = 3

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

type DynamicLearningToolSearchRuntime = Pick<
  typeof import("./dynamic-tool-search"),
  "searchDynamicLearningTools" | "selectDynamicLearningToolsByID"
> &
  Pick<
    typeof import("./dynamic-tool-grants"),
    | "dynamicLearningToolSearchCandidateIDsForSession"
    | "grantDynamicLearningToolsForSession"
    | "recordDynamicLearningToolSearchCandidates"
  >

async function loadDynamicLearningToolSearchRuntime(): Promise<DynamicLearningToolSearchRuntime> {
  const [searchModule, grantModule] = await Promise.all([
    import("./dynamic-tool-search"),
    import("./dynamic-tool-grants"),
  ])

  return {
    searchDynamicLearningTools: searchModule.searchDynamicLearningTools,
    selectDynamicLearningToolsByID: searchModule.selectDynamicLearningToolsByID,
    dynamicLearningToolSearchCandidateIDsForSession:
      grantModule.dynamicLearningToolSearchCandidateIDsForSession,
    grantDynamicLearningToolsForSession: grantModule.grantDynamicLearningToolsForSession,
    recordDynamicLearningToolSearchCandidates:
      grantModule.recordDynamicLearningToolSearchCandidates,
  }
}

function resolveSearchPersona(input: {
  agent: string
  statePersona?: string
  defaultPersona: Persona
}): Persona {
  if (input.statePersona && isPersona(input.statePersona)) return input.statePersona
  if (isPersona(input.agent)) return input.agent
  return input.defaultPersona
}

async function resolveDynamicLearningToolContext(input: {
  directory: string
  sessionID: string
  agent: string
}): Promise<DynamicLearningToolContext> {
  const [
    { readProjectConfig },
    { getBuddyPersona, getDefaultBuddyPersona },
    { readTeachingSessionState },
  ] = await Promise.all([
    import("../../config/runtime/project-config.js"),
    import("../personas/wiring/persona-profiles"),
    import("../agent-execution/state/session-state"),
  ])
  const [projectConfig, teachingState] = await Promise.all([
    readProjectConfig(input.directory),
    Promise.resolve(readTeachingSessionState(input.directory, input.sessionID)),
  ])
  const personaID = resolveSearchPersona({
    agent: input.agent,
    statePersona: teachingState?.persona,
    defaultPersona: getDefaultBuddyPersona({
      defaultPersona: projectConfig.default_persona,
      primaryUse: projectConfig.personalization?.primary_use,
      overrides: projectConfig.personas,
    }).id,
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

async function searchResultMetadata(
  matches: readonly DynamicLearningToolSearchMatch[],
): Promise<DynamicLearningToolSearchResultMetadata[]> {
  const { DynamicLearningToolSearchResultSchema } = await import("./dynamic-tool-catalog")
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

function createLearningToolSearchTool(): BuddyTool {
  return createBuddyTool({
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
      const { recordDynamicLearningToolSearchCandidates, searchDynamicLearningTools } =
        await loadDynamicLearningToolSearchRuntime()
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
          matches: await searchResultMetadata(result.matches),
          filtered: result.filtered,
          nextTool: LEARNING_TOOL_LOAD_TOOL_ID,
        },
      }
    },
  })
}

function createLearningToolLoadTool(): BuddyTool {
  return createBuddyTool({
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
      const {
        dynamicLearningToolSearchCandidateIDsForSession,
        grantDynamicLearningToolsForSession,
        selectDynamicLearningToolsByID,
      } = await loadDynamicLearningToolSearchRuntime()
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
          matches: await searchResultMetadata(result.matches),
          filtered: result.filtered,
          grantScope: "session",
        },
      }
    },
  })
}

let cachedDynamicToolSearchTools: readonly [BuddyTool, BuddyTool] | undefined

function getDynamicToolSearchTools(): readonly [BuddyTool, BuddyTool] {
  if (cachedDynamicToolSearchTools) {
    return cachedDynamicToolSearchTools
  }

  cachedDynamicToolSearchTools = [
    createLearningToolSearchTool(),
    createLearningToolLoadTool(),
  ] as const

  return cachedDynamicToolSearchTools
}

export { getDynamicToolSearchTools }
