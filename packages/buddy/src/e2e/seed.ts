import { GlobalBus } from "@buddy/opencode-adapter/bus"
import { MessageID, ModelID, PartID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { TeachingLanguageSchema } from "../learning/capabilities/lesson-workspace/model/types"
import { MermaidArtifactService } from "../learning/capabilities/figures/mermaid/service"
import { TeachingService } from "../learning/capabilities/lesson-workspace/service/operations"
import { isIntent, isPersona } from "../learning/shared/teaching-vocabulary"
import { writeTeachingSessionState } from "../learning/agent-execution/state/session-state"

const DEFAULT_MODEL_ID = "gpt-5-nano"
const DEFAULT_SESSION_TITLE = "E2E Session"
const DEFAULT_TURN_COUNT = 3

type SessionSeed = {
  sessionID?: string
  title?: string
}

type TeachingSeed = {
  persona?: string
  intent?: string
  focusGoalIds?: string[]
}

function defaultModel() {
  return {
    providerID: ProviderID.openai,
    modelID: ModelID.make(DEFAULT_MODEL_ID),
  }
}

function buildLongText(targetLength: number) {
  if (targetLength <= 0) return ""
  const token = "Long transcript payload "
  const repeat = Math.ceil(targetLength / token.length)
  return token.repeat(repeat).slice(0, targetLength)
}

async function ensureSession(input: {
  directory: string
  seed?: SessionSeed
}): Promise<{ id: string; title: string }> {
  const existingSessionID = input.seed?.sessionID
  const requestedTitle = input.seed?.title?.trim() || DEFAULT_SESSION_TITLE

  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      if (existingSessionID) {
        try {
          const existing = await OpenCodeSession.get(SessionID.make(existingSessionID))
          return { id: existing.id, title: existing.title }
        } catch {
          const created = await OpenCodeSession.create(undefined)
          if (requestedTitle.length > 0 && created.title !== requestedTitle) {
            await OpenCodeSession.setTitle({
              sessionID: SessionID.make(created.id),
              title: requestedTitle,
            })
          }
          return {
            id: created.id,
            title: requestedTitle.length > 0 ? requestedTitle : created.title,
          }
        }
      }

      const created = await OpenCodeSession.create(undefined)
      if (requestedTitle.length > 0 && created.title !== requestedTitle) {
        await OpenCodeSession.setTitle({
          sessionID: SessionID.make(created.id),
          title: requestedTitle,
        })
      }
      return {
        id: created.id,
        title: requestedTitle.length > 0 ? requestedTitle : created.title,
      }
    },
  })
}

export async function seedSessionTranscript(input: {
  directory: string
  seed?: SessionSeed
  turnCount?: number
  includeAssistant?: boolean
  longAssistantChars?: number
  archived?: boolean
}) {
  const includeAssistant = input.includeAssistant ?? true
  const turnCount = Math.max(1, Math.min(400, input.turnCount ?? DEFAULT_TURN_COUNT))
  const longAssistantChars = Math.max(0, input.longAssistantChars ?? 0)

  const session = await ensureSession({
    directory: input.directory,
    seed: input.seed,
  })

  await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const model = defaultModel()
      const baseTime = Date.now()

      for (let index = 0; index < turnCount; index += 1) {
        const userMessageID = MessageID.ascending()
        const userPartID = PartID.ascending()
        const userText = `Seeded user message ${index + 1}`
        const userCreatedAt = baseTime + index * 2

        await OpenCodeSession.updateMessage({
          id: userMessageID,
          sessionID: SessionID.make(session.id),
          role: "user",
          time: {
            created: userCreatedAt,
          },
          format: {
            type: "text",
          },
          agent: "buddy",
          model,
        })

        await OpenCodeSession.updatePart({
          id: userPartID,
          sessionID: SessionID.make(session.id),
          messageID: userMessageID,
          type: "text",
          text: userText,
        })

        if (!includeAssistant) {
          continue
        }

        const assistantMessageID = MessageID.ascending()
        const assistantPartID = PartID.ascending()
        const assistantCreatedAt = userCreatedAt + 1
        const longSuffix = index === turnCount - 1 ? buildLongText(longAssistantChars) : ""
        const assistantText = [`Seeded assistant message ${index + 1}`, longSuffix]
          .filter((value) => value.length > 0)
          .join("\n\n")

        await OpenCodeSession.updateMessage({
          id: assistantMessageID,
          sessionID: SessionID.make(session.id),
          role: "assistant",
          time: {
            created: assistantCreatedAt,
            completed: assistantCreatedAt,
          },
          parentID: userMessageID,
          providerID: model.providerID,
          modelID: model.modelID,
          mode: "chat",
          agent: "buddy",
          path: {
            cwd: input.directory,
            root: input.directory,
          },
          cost: 0,
          tokens: {
            total: 0,
            input: 0,
            output: 0,
            reasoning: 0,
            cache: {
              read: 0,
              write: 0,
            },
          },
          finish: "stop",
        })

        await OpenCodeSession.updatePart({
          id: assistantPartID,
          sessionID: SessionID.make(session.id),
          messageID: assistantMessageID,
          type: "text",
          text: assistantText,
          time: {
            start: assistantCreatedAt,
            end: assistantCreatedAt,
          },
        })
      }

      if (input.archived) {
        await OpenCodeSession.setArchived({
          sessionID: SessionID.make(session.id),
          time: Date.now(),
        })
      }
    },
  })

  return {
    sessionID: session.id,
    turnCount,
    includeAssistant,
  }
}

export async function seedTeachingWorkspace(input: {
  directory: string
  seed?: SessionSeed
  language?: string
  relativePath?: string
  code?: string
  teaching?: TeachingSeed
}) {
  const session = await ensureSession({
    directory: input.directory,
    seed: input.seed,
  })

  const parsedLanguage = input.language
    ? TeachingLanguageSchema.safeParse(input.language.trim())
    : undefined
  const language = parsedLanguage?.success ? parsedLanguage.data : undefined

  const workspace = await TeachingService.ensure(input.directory, session.id, language ?? "ts")

  let nextWorkspace = workspace
  const relativePath = input.relativePath?.trim()
  const code = input.code

  if (relativePath && relativePath !== workspace.activeRelativePath) {
    nextWorkspace = await TeachingService.addFile(input.directory, session.id, {
      relativePath,
      ...(code !== undefined ? { content: code } : {}),
      activate: true,
      ...(language ? { language } : {}),
    })
  } else if (code !== undefined) {
    nextWorkspace = await TeachingService.save(input.directory, session.id, {
      code,
      expectedRevision: workspace.revision,
      ...(relativePath ? { relativePath } : {}),
      ...(language ? { language } : {}),
    })
  }

  const requestedPersona = input.teaching?.persona
  const requestedIntent = input.teaching?.intent
  const persona = requestedPersona && isPersona(requestedPersona) ? requestedPersona : "buddy"
  const intent = requestedIntent && isIntent(requestedIntent) ? requestedIntent : "learn"
  const focusGoalIds = input.teaching?.focusGoalIds ?? []

  writeTeachingSessionState(input.directory, {
    sessionId: session.id,
    persona,
    intent,
    currentSurface: "editor",
    workspaceState: "interactive",
    focusGoalIds,
    lastLlmOutbound: {
      kind: "message",
      createdAt: new Date().toISOString(),
      payload: {
        sessionID: session.id,
        source: "e2e-seed",
      },
      fullSystemPrompt: "E2E seeded system prompt",
    },
    llmOutboundHistory: [
      {
        kind: "message",
        createdAt: new Date().toISOString(),
        payload: {
          sessionID: session.id,
          source: "e2e-seed",
        },
        fullSystemPrompt: "E2E seeded system prompt",
      },
    ],
  })

  return {
    sessionID: session.id,
    workspace: nextWorkspace,
  }
}

export async function seedMermaidArtifacts(input: {
  directory: string
  artifacts: Array<{
    source: string
    alt: string
    caption?: string
    diagramType?: string
  }>
}) {
  const artifacts = input.artifacts.filter(
    (artifact) => artifact.source.trim().length > 0 && artifact.alt.trim().length > 0,
  )

  const writes = artifacts.map((artifact, index) => {
    const createdAt = new Date(Date.now() + index).toISOString()
    const source = artifact.source.trim()
    const alt = artifact.alt.trim()
    const diagramType =
      artifact.diagramType?.trim() || MermaidArtifactService.inferDiagramType(source)
    const sourceHash = MermaidArtifactService.hashSource(source)
    const identity = {
      kind: "mermaid.v1" as const,
      diagramType,
      alt,
      ...(artifact.caption?.trim() ? { caption: artifact.caption.trim() } : {}),
      repairAttempts: 0,
      repairLog: [] as string[],
      sourceHash,
      createdAt,
      createdBy: {
        sessionID: "session_e2e_seed",
        messageID: `message_e2e_seed_${index + 1}`,
        callID: `call_e2e_seed_${index + 1}`,
      },
    }
    const artifactID = MermaidArtifactService.hashArtifact(identity)

    return MermaidArtifactService.write({
      directory: input.directory,
      source,
      manifest: {
        ...identity,
        version: 1,
        artifactID,
      },
    }).then(() => artifactID)
  })

  const artifactIDs = await Promise.all(writes)
  return {
    artifactIDs,
  }
}

export function emitSessionErrorEvent(input: {
  directory: string
  sessionID?: string
  message: string
}) {
  GlobalBus.emit("event", {
    directory: input.directory,
    payload: {
      type: "session.error",
      properties: {
        ...(input.sessionID ? { sessionID: input.sessionID } : {}),
        error: {
          name: "E2ESessionError",
          message: input.message,
        },
      },
    },
  })
}

export function emitInstanceDisposedEvent(input: { directory: string }) {
  GlobalBus.emit("event", {
    directory: input.directory,
    payload: {
      type: "server.instance.disposed",
      properties: {
        directory: input.directory,
      },
    },
  })
}
