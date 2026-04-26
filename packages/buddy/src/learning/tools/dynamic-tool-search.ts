import z from "zod"
import { Session } from "@buddy/opencode-adapter/session"
import { createBuddyTool, type BuddyTool } from "./create-buddy-tool"
import { SMOKE_ASSESSMENT_TOOL_ID, SMOKE_PRACTICE_TOOL_ID } from "./dynamic-tool-ids"
import { registerBuddyTools } from "./register-buddy-tools"
import { isSessionNotFoundError } from "../../session"

const LEARNING_TOOL_SEARCH_TOOL_ID = "learning_tool_search"
const NO_RESULTS_OUTPUT = "No dynamic learning tools matched the query."

const DynamicLearningToolSearchParameters = z.object({
  query: z
    .string()
    .min(1)
    .describe("Search query describing the learning tool capability to load."),
})

const SmokeToolParameters = z.object({
  note: z.string().optional().describe("Optional note to include in the smoke-test output."),
})

type SearchableDynamicLearningTool = {
  tool: BuddyTool
  title: string
  searchText: string
}

function createSmokeTool(input: { id: string; title: string; output: string }): BuddyTool {
  return createBuddyTool(input.id, {
    description: `${input.title} Dynamic tool-search smoke test tool.`,
    parameters: SmokeToolParameters,
    execute(params) {
      return {
        title: input.id,
        output: [input.output, params.note ? `Note: ${params.note}` : undefined]
          .filter((line): line is string => line !== undefined)
          .join("\n"),
        metadata: {
          dynamic: true,
          smokeTest: true,
        },
      }
    },
  })
}

const dynamicPracticeSmokeTool = createSmokeTool({
  id: SMOKE_PRACTICE_TOOL_ID,
  title: "Practice smoke tool.",
  output: "Practice smoke tool loaded and executed.",
})

const dynamicAssessmentSmokeTool = createSmokeTool({
  id: SMOKE_ASSESSMENT_TOOL_ID,
  title: "Assessment smoke tool.",
  output: "Assessment smoke tool loaded and executed.",
})

const SEARCHABLE_DYNAMIC_LEARNING_TOOLS: readonly SearchableDynamicLearningTool[] = [
  {
    tool: dynamicPracticeSmokeTool,
    title: "Practice smoke tool",
    searchText: "practice exercise drill guided independent student practice smoke test",
  },
  {
    tool: dynamicAssessmentSmokeTool,
    title: "Assessment smoke tool",
    searchText: "assessment mastery check quiz retrieval evidence evaluate smoke test",
  },
]

function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
}

function matchingDynamicLearningTools(query: string): SearchableDynamicLearningTool[] {
  const terms = queryTerms(query)
  return SEARCHABLE_DYNAMIC_LEARNING_TOOLS.filter((entry) => {
    const searchText = `${entry.tool.id} ${entry.title} ${entry.searchText}`.toLowerCase()
    return terms.some((term) => searchText.includes(term))
  })
}

function formatSearchOutput(matches: readonly SearchableDynamicLearningTool[]): string {
  if (matches.length === 0) {
    return NO_RESULTS_OUTPUT
  }

  return [
    "Registered dynamic learning tools:",
    ...matches.map((entry) => `- ${entry.tool.id}: ${entry.title}`),
    "These tools are available to call on the next model loop iteration.",
  ].join("\n")
}

async function allowDynamicToolsForSession(input: {
  sessionID: Parameters<typeof Session.get>[0]
  toolIDs: readonly string[]
}): Promise<void> {
  const session = await Session.get(input.sessionID).catch((error) => {
    if (isSessionNotFoundError(error)) {
      return undefined
    }
    throw error
  })
  if (!session) return

  await Session.setPermission({
    sessionID: input.sessionID,
    permission: [
      ...(session.permission ?? []),
      ...input.toolIDs.map((toolID) => ({
        permission: toolID,
        pattern: "*",
        action: "allow" as const,
      })),
    ],
  })
}

const learningToolSearchTool = createBuddyTool(LEARNING_TOOL_SEARCH_TOOL_ID, {
  description:
    "Search for dynamic Buddy learning tools and register matching tools into the current OpenCode runtime. This is a smoke-test tool for dynamic tool discovery.",
  parameters: DynamicLearningToolSearchParameters,
  async execute(params, ctx) {
    const matches = matchingDynamicLearningTools(params.query)
    if (matches.length > 0) {
      await registerBuddyTools(
        ctx.directory,
        matches.map((entry) => entry.tool),
      )
      await allowDynamicToolsForSession({
        sessionID: ctx.sessionID,
        toolIDs: matches.map((entry) => entry.tool.id),
      })
    }

    return {
      title: LEARNING_TOOL_SEARCH_TOOL_ID,
      output: formatSearchOutput(matches),
      metadata: {
        query: params.query,
        registeredToolIds: matches.map((entry) => entry.tool.id),
      },
    }
  },
})

const dynamicToolSearchTools = [learningToolSearchTool] as const

export { dynamicToolSearchTools }
