import { Hono } from "hono"
import { validator } from "hono-openapi"
import z from "zod"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { clearAllTeachingSessionState } from "../learning/agent-execution/state/session-state"
import {
  mapOpenProjectRegistryError,
  setOpenProjectRegistryEntries,
} from "../project/open-project-registry"
import { allowedDirectoryRoots, isAllowedDirectory, resolveDirectory } from "../project/directory"
import {
  getE2ERuntimeState,
  isE2EModeEnabled,
  resetE2ERuntimeState,
  setE2EFaultState,
  setE2EProviderState,
} from "../e2e/runtime"
import {
  emitInstanceDisposedEvent,
  emitSessionErrorEvent,
  seedMermaidArtifacts,
  seedSessionTranscript,
  seedTeachingWorkspace,
} from "../e2e/seed"

const resetBodySchema = z
  .object({
    clearOpenProjects: z.boolean().optional(),
    disposeInstances: z.boolean().optional(),
    clearTeachingState: z.boolean().optional(),
  })
  .optional()

const faultsBodySchema = z.object({
  failNextPromptMessage: z.string().optional(),
  failNextCommandMessage: z.string().optional(),
})

const providersBodySchema = z.object({
  openAIConnected: z.boolean().optional(),
})

const openProjectsBodySchema = z.object({
  directories: z.array(z.string()),
})

const seedSessionBodySchema = z.object({
  directory: z.string(),
  sessionID: z.string().optional(),
  title: z.string().optional(),
  turnCount: z.number().int().min(1).max(400).optional(),
  includeAssistant: z.boolean().optional(),
  longAssistantChars: z.number().int().min(0).max(100_000).optional(),
  archived: z.boolean().optional(),
})

const seedTeachingBodySchema = z.object({
  directory: z.string(),
  sessionID: z.string().optional(),
  title: z.string().optional(),
  language: z.string().optional(),
  relativePath: z.string().optional(),
  code: z.string().optional(),
  teaching: z
    .object({
      persona: z.string().optional(),
      intent: z.string().optional(),
      focusGoalIds: z.array(z.string()).optional(),
    })
    .optional(),
})

const seedMermaidBodySchema = z.object({
  directory: z.string(),
  artifacts: z.array(
    z.object({
      source: z.string(),
      alt: z.string(),
      caption: z.string().optional(),
      diagramType: z.string().optional(),
    }),
  ),
})

const emitSessionErrorBodySchema = z.object({
  directory: z.string(),
  sessionID: z.string().optional(),
  message: z.string().min(1),
})

const emitInstanceDisposedBodySchema = z.object({
  directory: z.string(),
})

function requireAllowedDirectory(rawDirectory: string): string | Response {
  const directory = resolveDirectory(rawDirectory)
  if (isAllowedDirectory(directory, allowedDirectoryRoots())) {
    return directory
  }
  return Response.json({ error: "Directory is outside allowed roots" }, { status: 403 })
}

async function runOpenProjectsSet(directories: string[]) {
  try {
    return {
      ok: true as const,
      directories: await setOpenProjectRegistryEntries(directories),
    }
  } catch (error) {
    return {
      ok: false as const,
      response:
        mapOpenProjectRegistryError(error) ?? Response.json({ error: "Failed" }, { status: 500 }),
    }
  }
}

export const E2ERoutes = new Hono()
  .use("*", async (c, next) => {
    if (!isE2EModeEnabled()) {
      return c.json({ error: "E2E mode is disabled" }, 404)
    }
    return next()
  })
  .get("/state", (c) => {
    return c.json({
      mode: "enabled",
      runtime: getE2ERuntimeState(),
    })
  })
  .post("/reset", validator("json", resetBodySchema), async (c) => {
    const payload = c.req.valid("json")
    const clearOpenProjects = payload?.clearOpenProjects ?? true
    const disposeInstances = payload?.disposeInstances ?? true
    const clearTeachingState = payload?.clearTeachingState ?? true

    resetE2ERuntimeState()

    if (clearTeachingState) {
      clearAllTeachingSessionState()
    }

    if (disposeInstances) {
      await OpenCodeInstance.disposeAll()
    }

    if (clearOpenProjects) {
      const clearResult = await runOpenProjectsSet([])
      if (!clearResult.ok) return clearResult.response
    }

    return c.json({
      ok: true,
      runtime: getE2ERuntimeState(),
    })
  })
  .put("/faults", validator("json", faultsBodySchema), async (c) => {
    const payload = c.req.valid("json")
    setE2EFaultState({
      ...(payload.failNextPromptMessage !== undefined
        ? { failNextPromptMessage: payload.failNextPromptMessage }
        : {}),
      ...(payload.failNextCommandMessage !== undefined
        ? { failNextCommandMessage: payload.failNextCommandMessage }
        : {}),
    })
    return c.json({
      ok: true,
      runtime: getE2ERuntimeState(),
    })
  })
  .put("/providers", validator("json", providersBodySchema), async (c) => {
    const payload = c.req.valid("json")
    setE2EProviderState({ openAIConnected: payload.openAIConnected })
    return c.json({
      ok: true,
      runtime: getE2ERuntimeState(),
    })
  })
  .put("/open-projects", validator("json", openProjectsBodySchema), async (c) => {
    const payload = c.req.valid("json")
    const result = await runOpenProjectsSet(payload.directories)
    if (!result.ok) return result.response
    return c.json({
      ok: true,
      directories: result.directories,
    })
  })
  .post("/seed/session", validator("json", seedSessionBodySchema), async (c) => {
    const payload = c.req.valid("json")
    const allowedDirectory = requireAllowedDirectory(payload.directory)
    if (allowedDirectory instanceof Response) return allowedDirectory

    const result = await seedSessionTranscript({
      directory: allowedDirectory,
      seed: {
        sessionID: payload.sessionID,
        title: payload.title,
      },
      turnCount: payload.turnCount,
      includeAssistant: payload.includeAssistant,
      longAssistantChars: payload.longAssistantChars,
      archived: payload.archived,
    })

    return c.json({
      ok: true,
      directory: allowedDirectory,
      ...result,
    })
  })
  .post("/seed/teaching-workspace", validator("json", seedTeachingBodySchema), async (c) => {
    const payload = c.req.valid("json")
    const allowedDirectory = requireAllowedDirectory(payload.directory)
    if (allowedDirectory instanceof Response) return allowedDirectory

    const result = await seedTeachingWorkspace({
      directory: allowedDirectory,
      seed: {
        sessionID: payload.sessionID,
        title: payload.title,
      },
      language: payload.language,
      relativePath: payload.relativePath,
      code: payload.code,
      teaching: payload.teaching,
    })

    return c.json({
      ok: true,
      directory: allowedDirectory,
      ...result,
    })
  })
  .post("/seed/mermaid", validator("json", seedMermaidBodySchema), async (c) => {
    const payload = c.req.valid("json")
    const allowedDirectory = requireAllowedDirectory(payload.directory)
    if (allowedDirectory instanceof Response) return allowedDirectory

    const result = await seedMermaidArtifacts({
      directory: allowedDirectory,
      artifacts: payload.artifacts,
    })

    return c.json({
      ok: true,
      directory: allowedDirectory,
      ...result,
    })
  })
  .post("/emit/session-error", validator("json", emitSessionErrorBodySchema), async (c) => {
    const payload = c.req.valid("json")
    const allowedDirectory = requireAllowedDirectory(payload.directory)
    if (allowedDirectory instanceof Response) return allowedDirectory

    emitSessionErrorEvent({
      directory: allowedDirectory,
      sessionID: payload.sessionID,
      message: payload.message,
    })
    return c.json({ ok: true })
  })
  .post("/emit/instance-disposed", validator("json", emitInstanceDisposedBodySchema), async (c) => {
    const payload = c.req.valid("json")
    const allowedDirectory = requireAllowedDirectory(payload.directory)
    if (allowedDirectory instanceof Response) return allowedDirectory

    emitInstanceDisposedEvent({
      directory: allowedDirectory,
    })
    return c.json({ ok: true })
  })
