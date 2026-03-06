import { Hono } from "hono"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { Session } from "@buddy/opencode-adapter/session"
import {
  mergeBuddyAndConfiguredAgents,
  parseConfiguredModel,
  readProjectConfig,
  resolveConfiguredAgentKey,
  syncOpenCodeProjectConfig,
} from "../config/compatibility.js"
import {
  AnyObjectSchema,
  BooleanSchema,
  DirectoryHeader,
  DirectoryQuery,
  ErrorSchema,
  MessageWithPartsSchema,
  SessionIDPath,
  SessionInfoSchema,
} from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import { compileRuntimeProfile } from "../learning/runtime/compiler.js"
import { findActivityBundleById } from "../learning/runtime/activity-bundles.js"
import { buildPromptInjectionPolicy } from "../learning/runtime/prompt-injection-policy.js"
import { resolvePromptInjectionDecision } from "../learning/runtime/prompt-injection.js"
import { buildBuddyRuntimeSessionPermissions } from "../learning/runtime/session-permissions.js"
import {
  deleteTeachingSessionState,
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../learning/runtime/session-state.js"
import {
  isTeachingIntentId,
  type RuntimeProfile,
  type TeachingIntentId,
  type TeachingSessionState,
  type WorkspaceState,
} from "../learning/runtime/types.js"
import { LearnerService } from "../learning/learner/service.js"
import { buildLearningSystemPrompt, summarizeAdvisorySuggestions } from "../learning/shared/compose-system-prompt.js"
import { TeachingPromptContextSchema } from "../learning/teaching/types.js"
import { getBuddyPersona, getDefaultBuddyPersona } from "../personas/catalog.js"
import { isPersonaId, type BuddyPersonaId } from "../personas/types.js"
import { loadOpenCodeApp } from "../opencode-runtime/runtime.js"
import {
  ensureAllowedDirectory,
  fetchOpenCode,
  isJsonContentType,
  isSessionInRequestedProject,
  loadSessionStatus,
  normalizeErrorResponse,
  proxyToOpenCode,
} from "./support.js"

function hasExplicitModel(value: unknown): value is { providerID: string; modelID: string } {
  if (!value || typeof value !== "object") return false
  if (!("providerID" in value) || !("modelID" in value)) return false
  return typeof value.providerID === "string" && typeof value.modelID === "string"
}

function hasExplicitCommandModel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function normalizePersonaTarget(input: {
  body: Record<string, unknown>
  config: Awaited<ReturnType<typeof readProjectConfig>>
}) {
  const rawPersona = typeof input.body.persona === "string" ? input.body.persona.trim() : ""
  const rawAgent = typeof input.body.agent === "string" ? input.body.agent : undefined

  if (rawPersona && rawAgent) {
    throw new Error('Provide either "persona" or "agent", not both')
  }

  const mergedAgents = mergeBuddyAndConfiguredAgents(input.config.agent ?? {})

  if (rawPersona) {
    if (!isPersonaId(rawPersona)) {
      throw new Error(`Unknown Buddy persona "${rawPersona}"`)
    }

    const persona = getBuddyPersona(rawPersona, input.config.personas)
    if (persona.hidden) {
      throw new Error(`Buddy persona "${rawPersona}" is hidden`)
    }

    return {
      personaID: persona.id,
      runtimeAgent: resolveConfiguredAgentKey(persona.runtimeAgent, mergedAgents),
      includeBuddySystem: true,
    }
  }

  if (rawAgent) {
    const explicitPersona = isPersonaId(rawAgent) ? getBuddyPersona(rawAgent, input.config.personas) : undefined
    if (explicitPersona?.hidden) {
      throw new Error(`Buddy persona "${rawAgent}" is hidden`)
    }

    return {
      personaID: explicitPersona?.id as BuddyPersonaId | undefined,
      runtimeAgent: resolveConfiguredAgentKey(rawAgent, mergedAgents),
      includeBuddySystem: !!explicitPersona,
    }
  }

  const persona = getDefaultBuddyPersona({
    defaultPersona: input.config.default_persona,
    overrides: input.config.personas,
  })

  return {
    personaID: persona.id,
    runtimeAgent: resolveConfiguredAgentKey(persona.runtimeAgent, mergedAgents),
    includeBuddySystem: true,
  }
}

function resolveIntentOverride(input: {
  body: Record<string, unknown>
  config: Awaited<ReturnType<typeof readProjectConfig>>
}): TeachingIntentId | undefined {
  const raw = typeof input.body.intent === "string" ? input.body.intent.trim() : ""
  if (raw) {
    if (!isTeachingIntentId(raw)) {
      throw new Error(`Unknown teaching intent "${raw}"`)
    }
    return raw
  }

  if (input.config.default_intent && isTeachingIntentId(input.config.default_intent)) {
    return input.config.default_intent
  }

  return undefined
}

function resolveFocusGoalIds(body: Record<string, unknown>): string[] {
  if (!Array.isArray(body.focusGoalIds)) return []
  return body.focusGoalIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
}

function resolveRequestedActivityBundleId(body: Record<string, unknown>): string | undefined {
  const raw = typeof body.activityBundleId === "string" ? body.activityBundleId.trim() : ""
  return raw || undefined
}

function resolveCurrentSurface(input: {
  personaID: BuddyPersonaId
  config: Awaited<ReturnType<typeof readProjectConfig>>
  workspaceState: WorkspaceState
}): TeachingSessionState["currentSurface"] {
  const persona = getBuddyPersona(input.personaID, input.config.personas)
  if (input.workspaceState === "interactive" && persona.surfaces.includes("editor")) {
    return "editor"
  }
  return persona.defaultSurface
}

function permissionRulesEqual(left: PermissionRuleset | undefined, right: PermissionRuleset): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right)
}

function isSessionNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const errorName = "name" in error ? (error as { name?: unknown }).name : undefined
  if (errorName !== "NotFoundError") return false

  const data = "data" in error ? (error as { data?: unknown }).data : undefined
  const dataMessage =
    data && typeof data === "object" && "message" in data ? (data as { message?: unknown }).message : undefined
  const errorMessage = "message" in error ? (error as { message?: unknown }).message : undefined
  const message = typeof dataMessage === "string"
    ? dataMessage
    : typeof errorMessage === "string"
      ? errorMessage
      : ""

  return message.includes("Session not found")
}

async function syncBuddyRuntimeSessionPermissions(input: {
  directory: string
  sessionID: string
  runtimeProfile?: RuntimeProfile
}) {
  await loadOpenCodeApp()
  await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const session = await Session.get(input.sessionID).catch((error) => {
        if (isSessionNotFoundError(error)) {
          return undefined
        }
        throw error
      })
      if (!session) {
        return
      }
      const nextPermission = buildBuddyRuntimeSessionPermissions({
        existing: session.permission,
        runtimeProfile: input.runtimeProfile,
      })

      if (permissionRulesEqual(session.permission, nextPermission)) {
        return
      }

      await Session.setPermission({
        sessionID: input.sessionID,
        permission: nextPermission,
      })
    },
  })
}

async function compileCommandRuntimeProfile(input: {
  directory: string
  sessionID: string
  config: Awaited<ReturnType<typeof readProjectConfig>>
  personaID: BuddyPersonaId
  intentOverride?: TeachingIntentId
}): Promise<RuntimeProfile> {
  const persona = getBuddyPersona(input.personaID, input.config.personas)
  const previousState = readTeachingSessionState(input.directory, input.sessionID)
  return compileRuntimeProfile({
    persona,
    workspaceState: previousState?.workspaceState ?? "chat",
    intentOverride: input.intentOverride,
  })
}

function restoreTeachingSessionState(input: {
  directory: string
  sessionID: string
  previousState?: TeachingSessionState
}) {
  if (input.previousState) {
    writeTeachingSessionState(input.directory, input.previousState)
    return
  }

  deleteTeachingSessionState(input.directory, input.sessionID)
}

async function ensureSessionExistsInDirectory(input: {
  directory: string
  sessionID: string
  request: Request
}): Promise<Response | undefined> {
  const response = await fetchOpenCode({
    directory: input.directory,
    method: "GET",
    path: `/session/${encodeURIComponent(input.sessionID)}`,
    headers: new Headers(input.request.headers),
  })
  const normalized = await normalizeErrorResponse(response)
  if (!normalized.ok) return normalized
  if (!isJsonContentType(normalized.headers.get("content-type"))) return undefined

  const session = (await normalized
    .clone()
    .json()
    .catch(() => undefined)) as unknown
  const matchesProject = await isSessionInRequestedProject(input.directory, session)
  if (!matchesProject) {
    return Response.json({ error: "Session not found" }, { status: 404 })
  }

  return undefined
}

class SessionLookupError extends Error {
  constructor(readonly response: Response) {
    super("Session lookup failed")
    this.name = "SessionLookupError"
  }
}

async function assertSessionExistsInDirectory(input: {
  directory: string
  sessionID: string
  request: Request
}) {
  const response = await ensureSessionExistsInDirectory(input)
  if (!response) return
  throw new SessionLookupError(response)
}

const directoryParameters = [DirectoryHeader, DirectoryQuery]

export const SessionRoutes = (): Hono =>
  new Hono()
    .get(
      "/",
      compatibilityRoute({
        operationId: "session.list",
        summary: "List sessions",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Session list",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: SessionInfoSchema,
                },
              },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        return proxyToOpenCode(c, {
          targetPath: "/session",
        })
      },
    )
    .post(
      "/",
      compatibilityRoute({
        operationId: "session.create",
        summary: "Create a new session",
        parameters: directoryParameters,
        requestBody: {
          required: false,
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        responses: {
          200: {
            description: "Created session",
            content: {
              "application/json": { schema: SessionInfoSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        return proxyToOpenCode(c, {
          targetPath: "/session",
        })
      },
    )
    .get(
      "/:sessionID",
      compatibilityRoute({
        operationId: "session.get",
        summary: "Get session by ID",
        parameters: [SessionIDPath, ...directoryParameters],
        responses: {
          200: {
            description: "Session info",
            content: {
              "application/json": { schema: SessionInfoSchema },
            },
          },
          404: {
            description: "Session not found",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const sessionID = c.req.param("sessionID")
        const response = await fetchOpenCode({
          directory: directoryResult.directory,
          method: "GET",
          path: `/session/${encodeURIComponent(sessionID)}`,
          query: new URL(c.req.url).search,
          headers: new Headers(c.req.raw.headers),
        })

        const normalized = await normalizeErrorResponse(response)
        if (!normalized.ok) return normalized
        if (!isJsonContentType(normalized.headers.get("content-type"))) return normalized

        const session = (await normalized
          .clone()
          .json()
          .catch(() => undefined)) as unknown
        const matchesProject = await isSessionInRequestedProject(directoryResult.directory, session)
        if (!matchesProject) {
          return c.json({ error: "Session not found" }, 404)
        }

        return normalized
      },
    )
    .patch(
      "/:sessionID",
      compatibilityRoute({
        operationId: "session.update",
        summary: "Patch session metadata",
        parameters: [SessionIDPath, ...directoryParameters],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        responses: {
          200: {
            description: "Updated session info",
            content: {
              "application/json": { schema: SessionInfoSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const sessionID = c.req.param("sessionID")
        return proxyToOpenCode(c, {
          targetPath: `/session/${encodeURIComponent(sessionID)}`,
        })
      },
    )
    .get(
      "/:sessionID/message",
      compatibilityRoute({
        operationId: "session.messages",
        summary: "List session messages",
        parameters: [SessionIDPath, ...directoryParameters],
        responses: {
          200: {
            description: "Message list",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: MessageWithPartsSchema,
                },
              },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const sessionID = c.req.param("sessionID")
        return proxyToOpenCode(c, {
          targetPath: `/session/${encodeURIComponent(sessionID)}/message`,
        })
      },
    )
    .get(
      "/:sessionID/teaching-state",
      compatibilityRoute({
        operationId: "session.teachingState",
        summary: "Get Buddy teaching runtime state for a session",
        parameters: [SessionIDPath, ...directoryParameters],
        responses: {
          200: {
            description: "Teaching runtime state",
            content: {
              "application/json": { schema: AnyObjectSchema },
            },
          },
          204: {
            description: "No Buddy teaching state exists for this session yet",
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const sessionID = c.req.param("sessionID")
        const state = readTeachingSessionState(directoryResult.directory, sessionID)
        if (!state) {
          return c.body(null, 204)
        }

        return c.json(state)
      },
    )
    .get(
      "/:sessionID/runtime-inspector",
      compatibilityRoute({
        operationId: "session.runtimeInspector",
        summary: "Get Buddy runtime inspector state for a session",
        parameters: [SessionIDPath, ...directoryParameters],
        responses: {
          200: {
            description: "Runtime inspector state",
            content: {
              "application/json": { schema: AnyObjectSchema },
            },
          },
          204: {
            description: "No Buddy runtime inspector state exists for this session yet",
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const sessionID = c.req.param("sessionID")
        const state = readTeachingSessionState(directoryResult.directory, sessionID)
        if (!state?.inspector) {
          return c.body(null, 204)
        }

        return c.json({
          sessionId: state.sessionId,
          persona: state.persona,
          intentOverride: state.intentOverride,
          currentSurface: state.currentSurface,
          workspaceState: state.workspaceState,
          focusGoalIds: state.focusGoalIds,
          inspector: state.inspector,
        })
      },
    )
    .post(
      "/:sessionID/message",
      compatibilityRoute({
        operationId: "session.prompt",
        summary: "Send a prompt to a session",
        parameters: [SessionIDPath, ...directoryParameters],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        responses: {
          200: {
            description: "Created user message",
            content: {
              "application/json": { schema: MessageWithPartsSchema },
            },
          },
          400: {
            description: "Invalid prompt payload",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
          409: {
            description: "Session is already running",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const sessionID = c.req.param("sessionID")

        await syncOpenCodeProjectConfig(directoryResult.directory).catch((error) => {
          throw new Error(
            `Failed to sync config before prompt: ${String(error instanceof Error ? error.message : error)}`,
          )
        })

        let rollbackTeachingState: (() => void) | undefined
        let observeAcceptedMessage: (() => Promise<void>) | undefined

        try {
          const response = await proxyToOpenCode(c, {
            targetPath: `/session/${encodeURIComponent(sessionID)}/message`,
            async transformJsonBody(body) {
              const parts = Array.isArray(body.parts) ? [...body.parts] : []
              const content = typeof body.content === "string" ? body.content : ""
              const teachingContextResult = TeachingPromptContextSchema.safeParse(body.teaching)
              const teachingContext = teachingContextResult.success ? teachingContextResult.data : undefined
              const projectConfig = await readProjectConfig(directoryResult.directory)
              const target = normalizePersonaTarget({
                body,
                config: projectConfig,
              })
              if (content.trim().length > 0) {
                parts.unshift({
                  type: "text",
                  text: content,
                })
              }

              if (parts.length === 0) {
                throw new Error("content or parts must be provided")
              }

              const transformed: Record<string, unknown> = {
                ...body,
                parts,
              }
              const existingSystem = typeof body.system === "string" ? body.system.trim() : ""
              let buddySystem = ""
              const previousState = readTeachingSessionState(directoryResult.directory, sessionID)

              if (target.includeBuddySystem && target.personaID) {
                const persona = getBuddyPersona(target.personaID, projectConfig.personas)
                const intentOverride = resolveIntentOverride({
                  body,
                  config: projectConfig,
                })
                const workspace = await LearnerService.ensureWorkspaceContext(directoryResult.directory)
                const focusGoalIds = resolveFocusGoalIds(body)
                const learnerDigest = await LearnerService.queryForPrompt({
                  directory: directoryResult.directory,
                  query: {
                    workspaceId: workspace.workspaceId,
                    persona: persona.id,
                    intent: intentOverride,
                    focusGoalIds,
                    tokenBudget: 1400,
                  },
                })
                const workspaceState: WorkspaceState = teachingContext?.active ? "interactive" : "chat"
                const runtimeProfile = compileRuntimeProfile({
                  persona,
                  workspaceState,
                  intentOverride,
                })
                const requestedActivityBundleId = resolveRequestedActivityBundleId(body)
                const activityBundle = requestedActivityBundleId
                  ? runtimeProfile.capabilityEnvelope.activityBundles.find((bundle) => bundle.id === requestedActivityBundleId)
                  : undefined
                if (requestedActivityBundleId && !activityBundle) {
                  throw new Error(`Unknown activity bundle "${requestedActivityBundleId}" for the current runtime`)
                }
                await assertSessionExistsInDirectory({
                  directory: directoryResult.directory,
                  sessionID,
                  request: c.req.raw,
                })
                const promptBuild = await buildLearningSystemPrompt({
                  directory: directoryResult.directory,
                  runtimeProfile,
                  learnerDigest,
                  teachingContext,
                  intentOverride,
                  focusGoalIds,
                  activityBundle,
                  userContent: content,
                })
                const injectionPolicy = buildPromptInjectionPolicy({
                  previous: previousState,
                  personaID: persona.id,
                  intentOverride,
                  workspaceState,
                  focusGoalIds,
                  requestedActivityBundleId,
                })
                const promptInjection = resolvePromptInjectionDecision({
                  previous: previousState?.promptInjectionCache,
                  stableHeaderSections: promptBuild.stableHeaderSections,
                  turnContextSections: promptBuild.turnContextSections,
                  policy: injectionPolicy.policy,
                })

                rollbackTeachingState = () =>
                  restoreTeachingSessionState({
                    directory: directoryResult.directory,
                    sessionID,
                    previousState,
                  })

                writeTeachingSessionState(directoryResult.directory, {
                  sessionId: sessionID,
                  persona: persona.id,
                  intentOverride,
                  currentSurface: resolveCurrentSurface({
                    personaID: persona.id,
                    config: projectConfig,
                    workspaceState,
                  }),
                  workspaceState,
                  focusGoalIds,
                  promptInjectionCache: promptInjection.cache,
                  inspector: {
                    runtimeAgent: runtimeProfile.runtimeAgent,
                    capabilityEnvelope: runtimeProfile.capabilityEnvelope,
                    learnerDigest,
                    advisorySuggestions: summarizeAdvisorySuggestions({
                      recommendedNextAction: learnerDigest.recommendedNextAction,
                      openFeedbackActions: learnerDigest.openFeedbackActions,
                      relevantGoalIds: focusGoalIds.length > 0 ? focusGoalIds : learnerDigest.relevantGoalIds,
                    }),
                    stableHeader: promptBuild.stableHeader,
                    turnContext: promptBuild.turnContext,
                    stableHeaderSections: promptBuild.stableHeaderSections,
                    turnContextSections: promptBuild.turnContextSections,
                    promptInjectionAudit: {
                      ...injectionPolicy.audit,
                      decision: {
                        injectStableHeader: promptInjection.injectStableHeader,
                        injectTurnContext: promptInjection.injectTurnContext,
                        changedStableHeaderSectionKeys: promptInjection.changedStableHeaderSectionKeys,
                        changedTurnContextSectionKeys: promptInjection.changedTurnContextSectionKeys,
                      },
                    },
                  },
                })
                observeAcceptedMessage = async () => {
                  await LearnerService.observeLearnerMessage({
                    directory: directoryResult.directory,
                    content,
                    goalIds: focusGoalIds.length > 0 ? focusGoalIds : learnerDigest.relevantGoalIds,
                    sessionId: sessionID,
                  })
                }
                await syncBuddyRuntimeSessionPermissions({
                  directory: directoryResult.directory,
                  sessionID,
                  runtimeProfile,
                })
                buddySystem = promptInjection.stableHeader

                if (promptInjection.injectTurnContext) {
                  parts.unshift({
                    type: "text",
                    text: promptInjection.turnContext,
                    synthetic: true,
                  })
                  transformed.parts = parts
                }
              } else {
                await assertSessionExistsInDirectory({
                  directory: directoryResult.directory,
                  sessionID,
                  request: c.req.raw,
                })
                await syncBuddyRuntimeSessionPermissions({
                  directory: directoryResult.directory,
                  sessionID,
                })
              }
              const mergedSystem = [existingSystem, buddySystem].filter(Boolean).join("\n\n").trim()
              if (mergedSystem) {
                transformed.system = mergedSystem
              }
              const configuredModel = parseConfiguredModel(projectConfig.model)
              const explicitModel = hasExplicitModel(body.model)
              if (!explicitModel && configuredModel) {
                transformed.model = configuredModel
              }
              transformed.agent = target.runtimeAgent
              delete transformed.content
              delete transformed.persona
              delete transformed.intent
              delete transformed.focusGoalIds
              delete transformed.activityBundleId
              delete transformed.strategy
              delete transformed.adaptivity
              delete transformed.activity
              delete transformed.currentGoalIds
              delete transformed.teaching
              return transformed
            },
            forceBusyAs409: true,
            registerCurriculumTools: true,
            registerFigureTools: true,
            registerFreeformFigureTools: true,
            registerGoalTools: true,
            registerLearnerTools: true,
            registerTeachingTools: true,
          })

          if (!response.ok) {
            rollbackTeachingState?.()
            return response
          }

          if (observeAcceptedMessage) {
            await observeAcceptedMessage().catch((error) => {
              console.warn("Failed to record learner evidence after accepted prompt:", error)
            })
          }

          return response
        } catch (error) {
          rollbackTeachingState?.()
          if (error instanceof SessionLookupError) {
            return error.response
          }
          const message = String(error instanceof Error ? error.message : error)
          if (message.includes("content or parts must be provided")) {
            return c.json({ error: "content or parts must be provided" }, 400)
          }
          if (
            message.includes('Provide either "persona" or "agent"') ||
            message.includes("Unknown Buddy persona") ||
            message.includes("Unknown teaching intent") ||
            message.includes("Unknown activity bundle") ||
            message.includes("is hidden")
          ) {
            return c.json({ error: message }, 400)
          }
          throw error
        }
      },
    )
    .post(
      "/:sessionID/command",
      compatibilityRoute({
        operationId: "session.command",
        summary: "Send a slash command to a session",
        parameters: [SessionIDPath, ...directoryParameters],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        responses: {
          200: {
            description: "Created command message",
            content: {
              "application/json": { schema: MessageWithPartsSchema },
            },
          },
          400: {
            description: "Invalid command payload",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
          409: {
            description: "Session is already running",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const sessionID = c.req.param("sessionID")

        await syncOpenCodeProjectConfig(directoryResult.directory).catch((error) => {
          throw new Error(
            `Failed to sync config before command: ${String(error instanceof Error ? error.message : error)}`,
          )
        })

        let rollbackTeachingState: (() => void) | undefined

        try {
          const response = await proxyToOpenCode(c, {
            targetPath: `/session/${encodeURIComponent(sessionID)}/command`,
            async transformJsonBody(body) {
              const projectConfig = await readProjectConfig(directoryResult.directory)
              const target = normalizePersonaTarget({
                body,
                config: projectConfig,
              })

              if (target.includeBuddySystem && target.personaID) {
                const intentOverride = resolveIntentOverride({
                  body,
                  config: projectConfig,
                })
                const runtimeProfile = await compileCommandRuntimeProfile({
                  directory: directoryResult.directory,
                  sessionID,
                  config: projectConfig,
                  personaID: target.personaID,
                  intentOverride,
                })
                const focusGoalIds = resolveFocusGoalIds(body)
                const requestedActivityBundleId = resolveRequestedActivityBundleId(body)
                if (requestedActivityBundleId && !findActivityBundleById(requestedActivityBundleId)) {
                  throw new Error(`Unknown activity bundle "${requestedActivityBundleId}"`)
                }
                await assertSessionExistsInDirectory({
                  directory: directoryResult.directory,
                  sessionID,
                  request: c.req.raw,
                })
                const previousState = readTeachingSessionState(directoryResult.directory, sessionID)
                const workspaceState = previousState?.workspaceState ?? "chat"
                rollbackTeachingState = () =>
                  restoreTeachingSessionState({
                    directory: directoryResult.directory,
                    sessionID,
                    previousState,
                  })
                writeTeachingSessionState(directoryResult.directory, {
                  sessionId: sessionID,
                  persona: target.personaID,
                  intentOverride,
                  currentSurface: resolveCurrentSurface({
                    personaID: target.personaID,
                    config: projectConfig,
                    workspaceState,
                  }),
                  workspaceState,
                  focusGoalIds,
                  promptInjectionCache: previousState?.promptInjectionCache,
                })
                await syncBuddyRuntimeSessionPermissions({
                  directory: directoryResult.directory,
                  sessionID,
                  runtimeProfile,
                })
              } else {
                await assertSessionExistsInDirectory({
                  directory: directoryResult.directory,
                  sessionID,
                  request: c.req.raw,
                })
                await syncBuddyRuntimeSessionPermissions({
                  directory: directoryResult.directory,
                  sessionID,
                })
              }

              const transformed: Record<string, unknown> = {
                ...body,
                agent: target.runtimeAgent,
              }
              if (!hasExplicitCommandModel(body.model) && projectConfig.model) {
                transformed.model = projectConfig.model
              }
              delete transformed.persona
              delete transformed.intent
              delete transformed.focusGoalIds
              delete transformed.activityBundleId
              delete transformed.strategy
              delete transformed.adaptivity
              delete transformed.activity
              return transformed
            },
            forceBusyAs409: true,
            registerCurriculumTools: true,
            registerFigureTools: true,
            registerFreeformFigureTools: true,
            registerGoalTools: true,
            registerLearnerTools: true,
            registerTeachingTools: true,
          })

          if (!response.ok) {
            rollbackTeachingState?.()
          }

          return response
        } catch (error) {
          rollbackTeachingState?.()
          if (error instanceof SessionLookupError) {
            return error.response
          }
          const message = String(error instanceof Error ? error.message : error)
          if (
            message.includes('Provide either "persona" or "agent"') ||
            message.includes("Unknown Buddy persona") ||
            message.includes("Unknown teaching intent") ||
            message.includes("Unknown activity bundle") ||
            message.includes("is hidden")
          ) {
            return c.json({ error: message }, 400)
          }
          throw error
        }
      },
    )
    .post(
      "/:sessionID/abort",
      compatibilityRoute({
        operationId: "session.abort",
        summary: "Abort active session run",
        parameters: [SessionIDPath, ...directoryParameters],
        responses: {
          200: {
            description: "Whether a running session was aborted",
            content: {
              "application/json": { schema: BooleanSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const sessionID = c.req.param("sessionID")
        const statuses = await loadSessionStatus(directoryResult.directory, c.req.raw)
        const current = statuses?.[sessionID]
        if (!current || current.type === "idle") {
          return c.json(false)
        }

        const response = await proxyToOpenCode(c, {
          targetPath: `/session/${encodeURIComponent(sessionID)}/abort`,
        })

        if (!response.ok) return response
        return c.json(true)
      },
    )
