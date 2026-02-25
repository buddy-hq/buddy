import { streamText, tool, type ModelMessage } from "ai"
import { Agent } from "../agent/agent.js"
import { Bus } from "../bus/index.js"
import { PermissionNext } from "../permission/next.js"
import { Provider } from "../provider/provider.js"
import { ToolRegistry } from "../tool/registry.js"
import { loadBehavior, loadCurriculumContext, loadEnvironment, loadMaxStepsPrompt } from "./system-prompt.js"
import { loadInstructions } from "./instruction.js"
import { kimiModel } from "./kimi.js"
import { MessageEvents, type ToolPart, toModelMessages } from "./message-v2/index.js"
import type { MessageWithParts } from "./message-v2/index.js"
import { SessionStorage } from "./session-storage.js"
import { SessionStore } from "./session-store.js"
import { resolveRuntimeModel } from "./model-resolver.js"
import { ProviderTransform } from "./provider-transform.js"

const DOOM_LOOP_THRESHOLD = 3

function resolveAgentName(history: MessageWithParts[]) {
  const lastUser = [...history].reverse().find((message) => message.info.role === "user")
  if (!lastUser || lastUser.info.role !== "user") return undefined
  return lastUser.info.agent
}

function resolveLatestUserModel(history: MessageWithParts[]) {
  const lastUser = [...history].reverse().find((message) => message.info.role === "user")
  if (!lastUser || lastUser.info.role !== "user") return undefined
  return lastUser.info.model
}

async function resolveTools(input: {
  sessionID: string
  messageID: string
  history: MessageWithParts[]
  abortSignal: AbortSignal
  agent: Agent.Info
  model: {
    providerID: string
    modelID: string
  }
}) {
  const resolvedTools = await ToolRegistry.tools({
    model: input.model,
    agent: input.agent,
  })

  const tools: Record<string, any> = {}
  const sessionPermission = SessionStorage.getPermission(input.sessionID)
  const ruleset = PermissionNext.merge(input.agent.permission, sessionPermission)
  const disabled = PermissionNext.disabled(
    resolvedTools.map((item) => item.id),
    ruleset,
  )

  async function updateToolMetadata(inputData: {
    sessionID: string
    messageID: string
    callID?: string
    title?: string
    metadata?: Record<string, unknown>
  }) {
    if (!inputData.callID) return

    const message = SessionStore.getMessageWithParts(inputData.sessionID, inputData.messageID)
    if (!message) return

    const part = [...message.parts]
      .reverse()
      .find((candidate): candidate is ToolPart => candidate.type === "tool" && candidate.callID === inputData.callID)
    if (!part) return

    const next: ToolPart = {
      ...part,
      metadata: {
        ...(part.metadata ?? {}),
        ...(inputData.metadata ?? {}),
        ...(inputData.title ? { title: inputData.title } : {}),
      },
    }

    SessionStore.updatePart(next)
    await Bus.publish(MessageEvents.PartUpdated, { part: next })
  }

  for (const item of resolvedTools) {
    if (item.id !== "invalid" && disabled.has(item.id)) continue

    tools[item.id] = tool({
      description: item.description,
      inputSchema: item.parameters as any,
      async execute(args: any, options: any) {
        const toolCallID =
          typeof options?.toolCallId === "string" && options.toolCallId.trim().length > 0
            ? options.toolCallId
            : undefined

        const ctx = {
          sessionID: input.sessionID,
          messageID: input.messageID,
          agent: input.agent.name,
          abort: options?.abortSignal ?? input.abortSignal,
          callID: toolCallID,
          messages: input.history,
          async metadata(metadataInput: { title?: string; metadata?: Record<string, unknown> }) {
            await updateToolMetadata({
              sessionID: input.sessionID,
              messageID: input.messageID,
              callID: toolCallID,
              title: metadataInput.title,
              metadata: metadataInput.metadata,
            })
          },
          async ask(request: {
            permission: string
            patterns: string[]
            always: string[]
            metadata: Record<string, unknown>
          }) {
            await PermissionNext.ask({
              ...request,
              sessionID: input.sessionID,
              tool: toolCallID
                ? {
                    messageID: input.messageID,
                    callID: toolCallID,
                  }
                : undefined,
              ruleset,
            })
          },
        }

        const message = SessionStore.getMessageWithParts(input.sessionID, input.messageID)
        if (message) {
          const lastThree = message.parts
            .filter((part): part is ToolPart => part.type === "tool" && part.state.status !== "pending")
            .slice(-DOOM_LOOP_THRESHOLD)

          if (
            lastThree.length === DOOM_LOOP_THRESHOLD &&
            lastThree.every(
              (part) => part.tool === item.id && JSON.stringify(part.state.input) === JSON.stringify(args),
            )
          ) {
            await PermissionNext.ask({
              permission: "doom_loop",
              patterns: [item.id],
              sessionID: input.sessionID,
              metadata: {
                tool: item.id,
                input: args,
              },
              always: [item.id],
              tool: toolCallID
                ? {
                    messageID: input.messageID,
                    callID: toolCallID,
                  }
                : undefined,
              ruleset,
            })
          }
        }

        return item.execute(args, ctx as any)
      },
    } as any)
  }

  return tools
}

type StreamAssistantInput = {
  sessionID: string
  messageID: string
  history: MessageWithParts[]
  abortSignal: AbortSignal
  forceTextResponseOnly?: boolean
  injectMaxStepsPrompt?: boolean
  step?: number
}

export async function streamAssistant(input: StreamAssistantInput) {
  const hintedAgent = resolveAgentName(input.history)
  const fallbackName = await Agent.defaultAgent()
  const resolvedAgent = (hintedAgent ? await Agent.get(hintedAgent) : undefined) ?? (await Agent.get(fallbackName))
  if (!resolvedAgent) {
    throw new Error("No active agent is configured")
  }

  const modelIdentity = await resolveRuntimeModel({
    requestModel: resolveLatestUserModel(input.history),
    agent: resolvedAgent,
  })

  const stableSystem = [
    loadEnvironment({
      providerID: modelIdentity.providerID,
      modelID: modelIdentity.modelID,
    }),
    loadBehavior(),
  ].join("\n\n")

  const dynamicParts: string[] = []
  if (resolvedAgent.prompt) {
    dynamicParts.push(resolvedAgent.prompt)
  }

  const instructions = await loadInstructions()
  dynamicParts.push(...instructions)

  const curriculum = await loadCurriculumContext()
  if (curriculum) {
    dynamicParts.push(curriculum)
  }

  const system: string[] = [stableSystem]
  if (dynamicParts.length > 0) {
    system.push(dynamicParts.join("\n\n"))
  }

  const tools = input.forceTextResponseOnly
    ? undefined
    : await resolveTools({
        sessionID: input.sessionID,
        messageID: input.messageID,
        history: input.history,
        abortSignal: input.abortSignal,
        agent: resolvedAgent,
        model: modelIdentity,
      })

  const step = input.step ?? 1
  if (step > 1) {
    const lastAssistantIdx = [...input.history].reverse().findIndex((message) => message.info.role === "assistant")
    const lastAssistantMessageId =
      lastAssistantIdx >= 0 ? input.history[input.history.length - 1 - lastAssistantIdx]?.info.id : undefined

    for (const message of input.history) {
      if (message.info.role !== "user") continue
      if (lastAssistantMessageId && message.info.id <= lastAssistantMessageId) continue

      for (const part of message.parts) {
        if (part.type !== "text") continue
        if (!part.text.trim()) continue
        part.text = [
          "<system-reminder>",
          "The user sent the following message:",
          part.text,
          "",
          "Please address this message and continue with your tasks.",
          "</system-reminder>",
        ].join("\n")
      }
    }
  }

  const resolvedModel = await Provider.findModel({
    providerID: modelIdentity.providerID,
    modelID: modelIdentity.modelID,
  })

  const modelMessages = toModelMessages(input.history, {
    providerID: modelIdentity.providerID,
    modelID: modelIdentity.modelID,
    apiNpm: resolvedModel?.api.npm,
  })
  const messages = input.injectMaxStepsPrompt
    ? [...modelMessages, { role: "assistant" as const, content: loadMaxStepsPrompt() }]
    : modelMessages

  const messagesWithSystem: ModelMessage[] = [
    ...system.map((content) => ({
      role: "system" as const,
      content,
    })),
    ...messages,
  ]
  const transformedMessages = ProviderTransform.message(messagesWithSystem, resolvedModel)

  const maxOutputTokens = await ProviderTransform.maxOutputTokens(modelIdentity)

  return streamText({
    async experimental_repairToolCall(failed) {
      const lower = failed.toolCall.toolName.toLowerCase()
      if (lower !== failed.toolCall.toolName && tools?.[lower]) {
        return {
          ...failed.toolCall,
          toolName: lower,
        }
      }

      return {
        ...failed.toolCall,
        input: JSON.stringify({
          tool: failed.toolCall.toolName,
          error: failed.error.message,
        }),
        toolName: "invalid",
      }
    },
    model: kimiModel(modelIdentity.modelID),
    messages: transformedMessages,
    temperature: resolvedAgent.temperature ?? 1.0,
    topP: resolvedAgent.topP,
    providerOptions: ProviderTransform.providerOptions(modelIdentity),
    tools,
    activeTools: tools ? Object.keys(tools).filter((name) => name !== "invalid") : undefined,
    toolChoice: tools ? "auto" : "none",
    abortSignal: input.abortSignal,
    maxOutputTokens,
    maxRetries: 0,
  })
}
