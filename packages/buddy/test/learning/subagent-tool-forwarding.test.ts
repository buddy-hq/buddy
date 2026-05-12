import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { MessageID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { SessionPrompt as OpenCodeSessionPrompt } from "@buddy/opencode-adapter/session-prompt"
import { readProjectConfig } from "../../src/config/runtime/opencode-sync"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import { syncBuddyRuntimeSessionPermissions } from "../../src/learning/agent-execution/permissions/runtime-session-permissions"
import { createSessionCommandTransform } from "../../src/learning/agent-execution/transforms/command-transform"
import {
  clearAllTeachingSessionState,
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import { REGISTERED_BUDDY_PERSONAS } from "../../src/learning/personas/registry"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import { LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY } from "../../src/learning/features/memory/subagents/memory-consolidator"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { TEST_TOOL_MODEL, requireTool } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

type PromptInput = Parameters<typeof OpenCodeSessionPrompt.prompt>[0]

function createRequest() {
  return new Request("http://localhost/api/session")
}

async function createSession(input: {
  directory: string
  parentID?: string
  permission?: PermissionRuleset
}): Promise<string> {
  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const session = await OpenCodeSession.create({
        ...(input.parentID ? { parentID: SessionID.make(input.parentID) } : {}),
        ...(input.permission ? { permission: input.permission } : {}),
      })
      return session.id
    },
  })
}

async function seedUserPromptMessage(input: {
  agent: string
  directory: string
  sessionID: string
}) {
  await OpenCodeInstance.provide({
    directory: input.directory,
    fn: () =>
      OpenCodeSessionPrompt.prompt({
        sessionID: SessionID.make(input.sessionID),
        agent: input.agent,
        model: TEST_TOOL_MODEL,
        noReply: true,
        parts: [
          {
            type: "text",
            text: "Seed parent prompt context.",
          },
        ],
      }),
  })
}

async function seedAssistantMessage(input: {
  agent: string
  directory: string
  sessionID: string
}): Promise<string> {
  const messageID = MessageID.ascending()
  const messages = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: () =>
      OpenCodeSession.messages({
        sessionID: SessionID.make(input.sessionID),
      }),
  })
  type RouteMessage = (typeof messages)[number]

  await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      await OpenCodeSession.updateMessage({
        id: messageID,
        sessionID: SessionID.make(input.sessionID),
        role: "assistant",
        parentID: MessageID.make("msg_parent"),
        time: { created: Date.now(), completed: Date.now() },
        mode: input.agent,
        agent: input.agent,
        providerID: TEST_TOOL_MODEL.providerID,
        modelID: TEST_TOOL_MODEL.modelID,
        path: { cwd: input.directory, root: input.directory },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
          total: 0,
        },
      } satisfies RouteMessage["info"])
    },
  })

  return messageID
}

async function appendSessionToolDeny(input: {
  directory: string
  sessionID: string
  toolID: string
}) {
  const session = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: () => OpenCodeSession.get(SessionID.make(input.sessionID)),
  })

  await OpenCodeInstance.provide({
    directory: input.directory,
    fn: () =>
      OpenCodeSession.setPermission({
        sessionID: SessionID.make(input.sessionID),
        permission: [
          ...(session.permission ?? []),
          {
            permission: input.toolID,
            pattern: "*",
            action: "deny",
          },
        ],
      }),
  })
}

async function seedPersonaRuntime(input: {
  directory: string
  personaID: "buddy" | "reading-buddy"
  sessionID: string
}) {
  const projectConfig = await readProjectConfig(input.directory)
  const persona = getBuddyPersona(input.personaID, projectConfig.personas)
  const definition = REGISTERED_BUDDY_PERSONAS.find((entry) => entry.id === input.personaID)
  if (!definition) {
    throw new Error(`Unknown Buddy persona "${input.personaID}"`)
  }

  const sessionRuntime = resolveSessionRuntime({
    persona: {
      id: persona.id,
      features: definition.features,
      defaultSurface: persona.defaultSurface,
    },
    teachingWorkspaceState: "inactive",
    configuredToolToggles: projectConfig.tools,
  })

  writeTeachingSessionState(input.directory, {
    sessionId: input.sessionID,
    persona: input.personaID,
    currentSurface: persona.defaultSurface,
    teachingWorkspaceState: "inactive",
    sessionRuntime,
    focusGoalIds: [],
  })
  await syncBuddyRuntimeSessionPermissions({
    directory: input.directory,
    sessionID: input.sessionID,
    sessionRuntime,
  })
}

afterEach(async () => {
  clearAllTeachingSessionState()
  await OpenCodeInstance.disposeAll()
})

describe("subagent tool forwarding", () => {
  test("direct Buddy subagents inherit the default persona tools and keep only their own extras", async () => {
    await using project = await tmpdir({ git: true })
    await syncOpenCodeProjectConfig(project.path)
    await loadOpenCodeApp()

    const sessionID = await createSession({
      directory: project.path,
    })
    const transform = createSessionCommandTransform({
      context: {
        directory: project.path,
        request: createRequest(),
        sessionID,
      },
    })

    const transformed = await transform.onTransform({
      agent: "question-set-author",
    })
    const tools = (transformed.tools ?? {}) as Record<string, boolean>

    expect(transformed.agent).toBe("question-set-author")
    expect(tools.save_flashcard_deck).toBe(false)
    expect(tools.debug_attempt).toBe(false)
    expect(tools.goal_state).toBe(true)
    expect(tools.learner_memory_search).toBe(true)
    expect(tools.prepare_resource).toBe(true)
    expect(tools.ingest_full_text).toBe(true)
    expect(tools.render_mermaid).toBe(true)
    expect(tools.reflection).toBe(true)
    expect(tools.stepwise_solve).toBe(true)
    expect(tools.save_question_set).toBe(true)

    const session = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.get(SessionID.make(sessionID)),
    })
    expect(
      session.permission?.some(
        (rule) => rule.permission === "goal_state" && rule.action === "allow",
      ),
    ).toBe(true)
    expect(
      session.permission?.some(
        (rule) => rule.permission === "save_flashcard_deck" && rule.action === "deny",
      ),
    ).toBe(true)
    expect(readTeachingSessionState(project.path, sessionID)).toMatchObject({
      persona: "buddy",
      lastLlmOutbound: {
        payload: {
          agent: "question-set-author",
        },
      },
    })
  }, 40_000)

  test("child subagents inherit the caller's effective current tools before adding their own", async () => {
    await using project = await tmpdir({ git: true })
    await syncOpenCodeProjectConfig(project.path)
    await loadOpenCodeApp()

    const parentSessionID = await createSession({
      directory: project.path,
    })
    await seedPersonaRuntime({
      directory: project.path,
      sessionID: parentSessionID,
      personaID: "reading-buddy",
    })
    await seedUserPromptMessage({
      directory: project.path,
      sessionID: parentSessionID,
      agent: "reading-buddy",
    })
    await appendSessionToolDeny({
      directory: project.path,
      sessionID: parentSessionID,
      toolID: "websearch",
    })

    const childSessionID = await createSession({
      directory: project.path,
      parentID: parentSessionID,
    })
    const childTransform = createSessionCommandTransform({
      context: {
        directory: project.path,
        request: createRequest(),
        sessionID: childSessionID,
      },
    })

    const transformed = await childTransform.onTransform({
      agent: "question-set-author",
    })
    const tools = (transformed.tools ?? {}) as Record<string, boolean>

    expect(tools.debug_attempt).toBe(false)
    expect(tools.save_flashcard_deck).toBe(false)
    expect(tools.save_question_set).toBe(true)
  }, 40_000)

  test("direct subagent prompts write runtime tool overrides through the patched session prompt service", async () => {
    await using project = await tmpdir({ git: true })
    await syncOpenCodeProjectConfig(project.path)
    await loadOpenCodeApp()

    const sessionID = await createSession({
      directory: project.path,
    })

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        OpenCodeSessionPrompt.prompt({
          sessionID: SessionID.make(sessionID),
          agent: "question-set-author",
          model: TEST_TOOL_MODEL,
          noReply: true,
          parts: [
            {
              type: "text",
              text: "List your tools.",
            },
          ],
        }),
    })

    const messages = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        OpenCodeSession.messages({
          sessionID: SessionID.make(sessionID),
        }),
    })
    const userMessage = messages.find((message) => message.info.role === "user")
    if (!userMessage || userMessage.info.role !== "user") {
      throw new Error("Expected the prompt to persist a user message.")
    }

    expect(userMessage.info.tools?.save_flashcard_deck).toBe(false)
    expect(userMessage.info.tools?.debug_attempt).toBe(false)
    expect(userMessage.info.tools?.goal_state).toBe(true)
    expect(userMessage.info.tools?.learner_memory_search).toBe(true)
    expect(userMessage.info.tools?.prepare_resource).toBe(true)
    expect(userMessage.info.tools?.ingest_full_text).toBe(true)
    expect(userMessage.info.tools?.render_mermaid).toBe(true)
    expect(userMessage.info.tools?.save_question_set).toBe(true)

    const session = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.get(SessionID.make(sessionID)),
    })
    expect(
      session.permission?.some(
        (rule) => rule.permission === "goal_state" && rule.action === "allow",
      ),
    ).toBe(true)
    expect(
      session.permission?.some(
        (rule) => rule.permission === "save_flashcard_deck" && rule.action === "deny",
      ),
    ).toBe(true)
    expect(readTeachingSessionState(project.path, sessionID)).toMatchObject({
      persona: "buddy",
    })
  }, 40_000)

  test("standalone subagent prompts keep explicit tool and permission inputs untouched", async () => {
    await using project = await tmpdir({ git: true })
    await syncOpenCodeProjectConfig(project.path)
    await loadOpenCodeApp()

    const customPermission: PermissionRuleset = [
      {
        permission: "edit",
        pattern: `${project.path}/learner-memory/*`,
        action: "allow",
      },
    ]
    const explicitTools = {
      read: true,
      write: true,
      task: false,
    } satisfies Record<string, boolean>
    const expectedPromptPermission: PermissionRuleset = [
      {
        permission: "read",
        pattern: "*",
        action: "allow",
      },
      {
        permission: "write",
        pattern: "*",
        action: "allow",
      },
      {
        permission: "task",
        pattern: "*",
        action: "deny",
      },
    ]

    const sessionID = await createSession({
      directory: project.path,
      permission: customPermission,
    })

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        OpenCodeSessionPrompt.prompt({
          sessionID: SessionID.make(sessionID),
          agent: LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY,
          model: TEST_TOOL_MODEL,
          noReply: true,
          tools: explicitTools,
          parts: [
            {
              type: "text",
              text: "Use the explicit standalone session config only.",
            },
          ],
        }),
    })

    const messages = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        OpenCodeSession.messages({
          sessionID: SessionID.make(sessionID),
        }),
    })
    const userMessage = messages.find((message) => message.info.role === "user")
    if (!userMessage || userMessage.info.role !== "user") {
      throw new Error("Expected the prompt to persist a user message.")
    }

    expect(userMessage.info.tools).toEqual(explicitTools)
    expect(userMessage.info.tools?.goal_state).toBeUndefined()
    expect(userMessage.info.tools?.save_question_set).toBeUndefined()

    const session = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeSession.get(SessionID.make(sessionID)),
    })
    expect(session.permission).toEqual(expectedPromptPermission)
    expect(session.permission?.some((rule) => rule.permission === "goal_state")).toBe(false)
    expect(session.permission?.some((rule) => rule.permission === "save_question_set")).toBe(false)
  }, 40_000)

  test("delegated task prompts inherit parent runtime tools through the patched task tool", async () => {
    await using project = await tmpdir({ git: true })
    await syncOpenCodeProjectConfig(project.path)
    await loadOpenCodeApp()

    const parentSessionID = await createSession({
      directory: project.path,
    })
    await seedPersonaRuntime({
      directory: project.path,
      sessionID: parentSessionID,
      personaID: "reading-buddy",
    })
    await seedUserPromptMessage({
      directory: project.path,
      sessionID: parentSessionID,
      agent: "reading-buddy",
    })
    await appendSessionToolDeny({
      directory: project.path,
      sessionID: parentSessionID,
      toolID: "websearch",
    })
    const parentAssistantMessageID = await seedAssistantMessage({
      directory: project.path,
      sessionID: parentSessionID,
      agent: "reading-buddy",
    })

    let capturedChildPrompt:
      | {
          agent: string
          sessionID: string
          tools?: Record<string, boolean>
        }
      | undefined

    const tools = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.tools(TEST_TOOL_MODEL),
    })
    const taskTool = requireTool(tools, "task")

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        taskTool.execute(
          {
            description: "List tools",
            prompt: "Reply with your tools only.",
            subagent_type: "question-set-author",
          },
          {
            sessionID: SessionID.make(parentSessionID),
            messageID: MessageID.make(parentAssistantMessageID),
            agent: "reading-buddy",
            abort: new AbortController().signal,
            messages: [],
            metadata() {
              return Effect.void
            },
            ask() {
              return Effect.void
            },
            extra: {
              bypassAgentCheck: true,
              promptOps: {
                cancel() {},
                resolvePromptParts(template: string) {
                  return Effect.succeed([
                    {
                      type: "text" as const,
                      text: template,
                    },
                  ])
                },
                prompt(input: PromptInput) {
                  if (!input.messageID || !input.model || typeof input.agent !== "string") {
                    throw new Error(
                      "Expected delegated task prompt input to include agent metadata.",
                    )
                  }

                  capturedChildPrompt = {
                    agent: input.agent,
                    sessionID: input.sessionID,
                    tools: input.tools,
                  }
                  return Effect.succeed({
                    info: {
                      id: MessageID.make("msg_child_assistant"),
                      sessionID: SessionID.make(input.sessionID),
                      role: "assistant" as const,
                      parentID: MessageID.make(input.messageID),
                      time: { created: Date.now(), completed: Date.now() },
                      mode: "question-set-author",
                      agent: input.agent,
                      providerID: input.model.providerID,
                      modelID: input.model.modelID,
                      path: { cwd: project.path, root: project.path },
                      cost: 0,
                      tokens: {
                        input: 0,
                        output: 0,
                        reasoning: 0,
                        cache: { read: 0, write: 0 },
                        total: 0,
                      },
                    },
                    parts: [
                      {
                        id: "prt_child_text",
                        sessionID: SessionID.make(input.sessionID),
                        messageID: MessageID.make("msg_child_assistant"),
                        type: "text" as const,
                        text: "done",
                      },
                    ],
                  })
                },
              },
            },
          },
        ),
    })

    if (!capturedChildPrompt) {
      throw new Error("Expected task prompt forwarding to capture the child prompt.")
    }

    expect(capturedChildPrompt.agent).toBe("question-set-author")
    expect(capturedChildPrompt.tools?.websearch).toBe(false)
    expect(capturedChildPrompt.tools?.save_flashcard_deck).toBe(false)
    expect(capturedChildPrompt.tools?.debug_attempt).toBe(false)
    expect(capturedChildPrompt.tools?.save_question_set).toBe(true)
    expect(readTeachingSessionState(project.path, capturedChildPrompt.sessionID)).toMatchObject({
      persona: "reading-buddy",
    })
  }, 40_000)

  test("the named task tool path also forwards parent runtime tools", async () => {
    await using project = await tmpdir({ git: true })
    await syncOpenCodeProjectConfig(project.path)
    await loadOpenCodeApp()

    const parentSessionID = await createSession({
      directory: project.path,
    })
    await seedPersonaRuntime({
      directory: project.path,
      sessionID: parentSessionID,
      personaID: "reading-buddy",
    })
    await seedUserPromptMessage({
      directory: project.path,
      sessionID: parentSessionID,
      agent: "reading-buddy",
    })
    await appendSessionToolDeny({
      directory: project.path,
      sessionID: parentSessionID,
      toolID: "websearch",
    })
    const parentAssistantMessageID = await seedAssistantMessage({
      directory: project.path,
      sessionID: parentSessionID,
      agent: "reading-buddy",
    })

    let capturedChildPrompt:
      | {
          agent: string
          sessionID: string
          tools?: Record<string, boolean>
        }
      | undefined

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: async () => {
        const namedTools = await ToolRegistry.named()

        await Effect.runPromise(
          namedTools.task.execute(
            {
              description: "List tools",
              prompt: "Reply with your tools only.",
              subagent_type: "question-set-author",
            },
            {
              sessionID: SessionID.make(parentSessionID),
              messageID: MessageID.make(parentAssistantMessageID),
              agent: "reading-buddy",
              abort: new AbortController().signal,
              messages: [],
              metadata() {
                return Effect.void
              },
              ask() {
                return Effect.void
              },
              extra: {
                bypassAgentCheck: true,
                promptOps: {
                  cancel() {},
                  resolvePromptParts(template: string) {
                    return Effect.succeed([
                      {
                        type: "text" as const,
                        text: template,
                      },
                    ])
                  },
                  prompt(input: PromptInput) {
                    if (!input.messageID || !input.model || typeof input.agent !== "string") {
                      throw new Error(
                        "Expected delegated task prompt input to include agent metadata.",
                      )
                    }

                    capturedChildPrompt = {
                      agent: input.agent,
                      sessionID: input.sessionID,
                      tools: input.tools,
                    }
                    return Effect.succeed({
                      info: {
                        id: MessageID.make("msg_named_child_assistant"),
                        sessionID: SessionID.make(input.sessionID),
                        role: "assistant" as const,
                        parentID: MessageID.make(input.messageID),
                        time: { created: Date.now(), completed: Date.now() },
                        mode: "question-set-author",
                        agent: input.agent,
                        providerID: input.model.providerID,
                        modelID: input.model.modelID,
                        path: { cwd: project.path, root: project.path },
                        cost: 0,
                        tokens: {
                          input: 0,
                          output: 0,
                          reasoning: 0,
                          cache: { read: 0, write: 0 },
                          total: 0,
                        },
                      },
                      parts: [
                        {
                          id: "prt_named_child_text",
                          sessionID: SessionID.make(input.sessionID),
                          messageID: MessageID.make("msg_named_child_assistant"),
                          type: "text" as const,
                          text: "done",
                        },
                      ],
                    })
                  },
                },
              },
            },
          ),
        )
      },
    })

    if (!capturedChildPrompt) {
      throw new Error("Expected task prompt forwarding to capture the child prompt.")
    }

    expect(capturedChildPrompt.agent).toBe("question-set-author")
    expect(capturedChildPrompt.tools?.websearch).toBe(false)
    expect(capturedChildPrompt.tools?.save_flashcard_deck).toBe(false)
    expect(capturedChildPrompt.tools?.debug_attempt).toBe(false)
    expect(capturedChildPrompt.tools?.save_question_set).toBe(true)
  }, 40_000)
})
