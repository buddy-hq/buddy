import { Hono } from "hono"
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
import { composeLearningSystemPrompt } from "../learning/shared/compose-system-prompt.js"
import { TeachingPromptContextSchema } from "../learning/teaching/types.js"
import { getBuddyMode, getDefaultBuddyMode } from "../modes/catalog.js"
import { isBuddyModeID, type BuddyModeID } from "../modes/types.js"
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

function normalizeModeTarget(input: {
  body: Record<string, unknown>
  config: Awaited<ReturnType<typeof readProjectConfig>>
}) {
  const rawMode = typeof input.body.mode === "string" ? input.body.mode.trim() : ""
  const rawAgent = typeof input.body.agent === "string" ? input.body.agent : undefined

  if (rawMode && rawAgent) {
    throw new Error('Provide either "mode" or "agent", not both')
  }

  const mergedAgents = mergeBuddyAndConfiguredAgents(input.config.agent ?? {})

  if (rawMode) {
    if (!isBuddyModeID(rawMode)) {
      throw new Error(`Unknown Buddy mode "${rawMode}"`)
    }

    const mode = getBuddyMode(rawMode, input.config.modes)
    if (mode.hidden) {
      throw new Error(`Buddy mode "${rawMode}" is hidden`)
    }

    return {
      modeID: mode.id,
      runtimeAgent: resolveConfiguredAgentKey(mode.runtimeAgent, mergedAgents),
      includeBuddySystem: true,
    }
  }

  if (rawAgent) {
    const explicitMode = isBuddyModeID(rawAgent) ? getBuddyMode(rawAgent, input.config.modes) : undefined
    if (explicitMode?.hidden) {
      throw new Error(`Buddy mode "${rawAgent}" is hidden`)
    }

    return {
      modeID: explicitMode?.id as BuddyModeID | undefined,
      runtimeAgent: resolveConfiguredAgentKey(rawAgent, mergedAgents),
      includeBuddySystem: !!explicitMode,
    }
  }

  const mode = getDefaultBuddyMode({
    defaultMode: input.config.default_mode,
    overrides: input.config.modes,
  })

  return {
    modeID: mode.id,
    runtimeAgent: resolveConfiguredAgentKey(mode.runtimeAgent, mergedAgents),
    includeBuddySystem: true,
  }
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

        return proxyToOpenCode(c, {
          targetPath: `/session/${encodeURIComponent(sessionID)}/message`,
          async transformJsonBody(body) {
            const parts = Array.isArray(body.parts) ? [...body.parts] : []
            const content = typeof body.content === "string" ? body.content : ""
            const teachingContextResult = TeachingPromptContextSchema.safeParse(body.teaching)
            const teachingContext = teachingContextResult.success ? teachingContextResult.data : undefined
            const projectConfig = await readProjectConfig(directoryResult.directory)
            const target = normalizeModeTarget({
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
            const buddySystem = target.includeBuddySystem
              ? await composeLearningSystemPrompt({
                  directory: directoryResult.directory,
                  modeID: target.modeID,
                  teachingContext,
                  userContent: content,
                })
              : ""
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
            delete transformed.mode
            delete transformed.teaching
            return transformed
          },
          forceBusyAs409: true,
          registerCurriculumTools: true,
          registerFigureTools: true,
          registerFreeformFigureTools: true,
          registerGoalTools: true,
          registerTeachingTools: true,
        }).catch((error) => {
          const message = String(error instanceof Error ? error.message : error)
          if (message.includes("content or parts must be provided")) {
            return c.json({ error: "content or parts must be provided" }, 400)
          }
          if (
            message.includes('Provide either "mode" or "agent"') ||
            message.includes("Unknown Buddy mode") ||
            message.includes("is hidden")
          ) {
            return c.json({ error: message }, 400)
          }
          throw error
        })
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

        return proxyToOpenCode(c, {
          targetPath: `/session/${encodeURIComponent(sessionID)}/command`,
          async transformJsonBody(body) {
            const projectConfig = await readProjectConfig(directoryResult.directory)
            const target = normalizeModeTarget({
              body,
              config: projectConfig,
            })

            const transformed: Record<string, unknown> = {
              ...body,
              agent: target.runtimeAgent,
            }
            if (!hasExplicitCommandModel(body.model) && projectConfig.model) {
              transformed.model = projectConfig.model
            }
            delete transformed.mode
            return transformed
          },
          forceBusyAs409: true,
          registerCurriculumTools: true,
          registerFigureTools: true,
          registerFreeformFigureTools: true,
          registerGoalTools: true,
          registerTeachingTools: true,
        }).catch((error) => {
          const message = String(error instanceof Error ? error.message : error)
          if (
            message.includes('Provide either "mode" or "agent"') ||
            message.includes("Unknown Buddy mode") ||
            message.includes("is hidden")
          ) {
            return c.json({ error: message }, 400)
          }
          throw error
        })
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
