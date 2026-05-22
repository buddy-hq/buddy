import type { AgentToolResult, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { readTeachingSessionState } from "../learning/agent-execution/state/session-state"
import { listBuddySubagentDefinitions } from "../learning/subagent-manifest"
import { allBuddyTools } from "../learning/runtime/feature-registry"
import { dynamicToolSearchTools } from "../learning/runtime/dynamic-tool-discovery"
import { normalizeToolCallArgs } from "../learning/runtime/normalize-tool-call-args"
import type { PiToolDefinition } from "../learning/runtime/create-buddy-tool"
import { toolMatchesRuntimeConstraints } from "../learning/runtime/tool-constraints"
import { specializedToolIDs } from "../learning/agent-execution/transforms/subagent-tool-forwarding"
import type { TeachingWorkspaceState } from "../learning/access/types"
import type { Config } from "../config"
import { buildOpenCodePiToolSet } from "./opencode-tool-bridge"

const BUDDY_TASK_TOOL_NAME = "task"
const SUBAGENT_NOT_FOUND_ERROR = "Unknown Buddy subagent"

type BuddyPiCustomToolServices = {
  runSubagent(input: {
    directory: string
    parentSessionID?: string
    parentSessionFile?: string
    systemPrompt: string
    agent: string
    description: string
    task: string
    model?: ExtensionContext["model"]
    onSessionCreated?: (sessionID: string) => void
  }): Promise<{
    sessionId: string
    output: string
  }>
}

export type BuddyPiToolSet = {
  tools: PiToolDefinition[]
  defaultToolNames: string[]
}

type BuddyTaskToolParams = {
  agent: string
  description?: string
  task: string
}

function readBuddyTaskToolParams(value: unknown): BuddyTaskToolParams {
  const normalized = normalizeToolCallArgs(value)
  if (
    normalized &&
    typeof normalized === "object" &&
    !Array.isArray(normalized) &&
    "agent" in normalized &&
    "task" in normalized &&
    typeof normalized.agent === "string" &&
    typeof normalized.task === "string"
  ) {
    const description =
      "description" in normalized && typeof normalized.description === "string"
        ? normalized.description
        : undefined
    return {
      agent: normalized.agent,
      ...(description ? { description } : {}),
      task: normalized.task,
    }
  }

  throw new Error("task tool requires string agent and task parameters.")
}

function taskDescription(input: BuddyTaskToolParams) {
  const explicit = input.description?.trim()
  if (explicit) return explicit
  const firstLine = input.task.trim().split("\n")[0]?.trim()
  if (!firstLine) return input.agent
  return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine
}

function availableSubagentPromptSnippet() {
  const lines = listBuddySubagentDefinitions().map(
    (subagent) => `  - ${subagent.key}: ${subagent.description}`,
  )
  return [
    "- task: Delegate a bounded task to a specialized Buddy subagent.",
    "  Available Buddy subagents:",
    ...lines,
  ].join("\n")
}

function buddyPiFeatureTools(directory: string): PiToolDefinition[] {
  const seen = new Set<string>()
  const tools: PiToolDefinition[] = []

  for (const tool of [...dynamicToolSearchTools, ...allBuddyTools()]) {
    if (seen.has(tool.id)) continue
    seen.add(tool.id)
    tools.push(tool.toPiTool(directory))
  }

  return tools
}

function staticBuddyToolNamesForSession(directory: string, sessionID: string) {
  const teachingState = readTeachingSessionState(directory, sessionID)
  const sessionRuntime = teachingState?.sessionRuntime
  if (!sessionRuntime) {
    return []
  }
  const names = allBuddyTools()
    .filter((tool) => {
      if (tool.constraints?.teachingWorkspace === "active") {
        return teachingState?.teachingWorkspaceState === "active"
      }
      return true
    })
    .filter((tool) => toolMatchesRuntimeConstraints(tool))
    .filter((tool) => sessionRuntime.access.tools[tool.id] === "allow")
    .map((tool) => tool.id)

  const hasAllowedSubagents = Object.values(sessionRuntime.access.subagents).some(
    (value) => value === "allow",
  )

  return [
    ...new Set([
      ...dynamicToolSearchTools.map((tool) => tool.id),
      ...names,
      ...(hasAllowedSubagents ? [BUDDY_TASK_TOOL_NAME] : []),
    ]),
  ]
}

function subagentDeniedToolNames(targetAgent: string) {
  const subagent = listBuddySubagentDefinitions().find((candidate) => candidate.key === targetAgent)
  if (!subagent?.permission || typeof subagent.permission === "string") {
    return new Set<string>()
  }

  return new Set(
    Object.entries(subagent.permission)
      .filter(([permissionKey, value]) => permissionKey !== "*" && value === "deny")
      .map(([permissionKey]) => permissionKey),
  )
}

export function buddyPiToolNamesForSession(directory: string, sessionID: string) {
  return staticBuddyToolNamesForSession(directory, sessionID)
}

export function forwardedBuddyPiToolNamesForSubagent(input: {
  targetAgent: string
  parentToolNames: readonly string[]
  configuredToolToggles: Config.Info["tools"] | undefined
  teachingWorkspaceState: TeachingWorkspaceState
}) {
  const denied = subagentDeniedToolNames(input.targetAgent)
  const forwarded = new Set(
    input.parentToolNames.filter(
      (toolName) => !denied.has(toolName) && toolName !== BUDDY_TASK_TOOL_NAME,
    ),
  )

  const allToolIDs = allBuddyTools().map((t) => t.id)
  const specialized = specializedToolIDs({
    allToolIDs,
    configuredToolToggles: input.configuredToolToggles,
    targetAgent: input.targetAgent,
    teachingWorkspaceState: input.teachingWorkspaceState,
  })

  for (const toolID of specialized) {
    forwarded.add(toolID)
  }

  return [...forwarded]
}

const BUDDY_TASK_TOOL_DESCRIPTION = `Launch a new agent to handle complex, multistep tasks autonomously.

When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.

When NOT to use the Task tool:
- If you want to read a specific file path, use the Read or Glob tool instead of the Task tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the Grep tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the Read tool instead of the Task tool, to find the match more quickly
- If no available agent is a good fit for the task, use other tools directly


Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result. The output includes a task_id you can reuse later to continue the same subagent session.
3. Each agent invocation starts with a fresh context unless you provide task_id to resume the same subagent session (which continues with its previous messages and tool outputs). When starting fresh, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted
5. Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent. Tell it how to verify its work if possible (e.g., relevant test commands).
6. If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.`

function buddyPiTaskTool(directory: string, services: BuddyPiCustomToolServices): PiToolDefinition {
  return {
    name: BUDDY_TASK_TOOL_NAME,
    label: "Delegate to Buddy subagent",
    description: BUDDY_TASK_TOOL_DESCRIPTION,
    promptSnippet: availableSubagentPromptSnippet(),
    parameters: Type.Object({
      agent: Type.String({
        description:
          "Buddy subagent key, such as question-set-author, flashcard-author, practice-agent, or assessment-agent.",
      }),
      description: Type.Optional(
        Type.String({
          description: "A short label for the delegated task shown in the UI.",
        }),
      ),
      task: Type.String({
        description: "The task to run with the selected subagent.",
      }),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      onUpdate,
      context,
    ): Promise<AgentToolResult<unknown>> {
      const input = readBuddyTaskToolParams(params)
      const subagent = listBuddySubagentDefinitions().find(
        (candidate) => candidate.key === input.agent,
      )
      if (!subagent) {
        throw new Error(`${SUBAGENT_NOT_FOUND_ERROR}: ${input.agent}`)
      }

      const description = taskDescription(input)
      const result = await services.runSubagent({
        directory,
        parentSessionID: context?.sessionManager.getSessionId(),
        parentSessionFile: context?.sessionManager.getSessionFile(),
        systemPrompt: subagent.prompt,
        agent: input.agent,
        description,
        task: input.task,
        model: context?.model,
        onSessionCreated: (sessionId) => {
          onUpdate?.({
            content: [],
            details: {
              kind: "buddy-task",
              sessionId,
              agent: input.agent,
              description,
            },
          })
        },
      })

      return {
        content: [{ type: "text", text: result.output }],
        details: {
          kind: "buddy-task",
          sessionId: result.sessionId,
          agent: input.agent,
          description,
        },
      }
    },
  }
}

export async function buddyPiCustomTools(
  directory: string,
  services: BuddyPiCustomToolServices,
): Promise<BuddyPiToolSet> {
  const featureTools = buddyPiFeatureTools(directory)
  const openCodeToolSet = await buildOpenCodePiToolSet(directory)
  return {
    tools: [...featureTools, ...openCodeToolSet.tools, buddyPiTaskTool(directory, services)],
    defaultToolNames: openCodeToolSet.defaultToolNames,
  }
}

export function buddyPiToolNames(tools: readonly PiToolDefinition[]): string[] {
  return tools.map((tool) => tool.name)
}
