import { Hono } from "hono"
import z from "zod"
import {
  configErrorMessage,
  isConfigValidationError,
  readProjectConfig,
} from "../config/compatibility.js"
import {
  TeachingWorkspaceFileError,
  TeachingRevisionConflictError,
  TeachingService,
  TeachingWorkspaceNotFoundError,
} from "../learning/teaching/service.js"
import {
  TeachingWorkspaceActivateFileRequestSchema,
  TeachingWorkspaceCreateFileRequestSchema,
  TeachingLanguageSchema,
  TeachingWorkspaceUpdateRequestSchema,
} from "../learning/teaching/types.js"
import { getBuddyMode, getDefaultBuddyMode } from "../modes/catalog.js"
import { isBuddyModeID } from "../modes/types.js"
import { isJsonContentType } from "./support.js"
import type { EnsureAllowedDirectory } from "./support.js"

const ProvisionRequestSchema = z.object({
  language: TeachingLanguageSchema.optional(),
  mode: z.string().optional(),
})

function invalidJson() {
  return Response.json({ error: "Invalid JSON body" }, { status: 400 })
}

function zodError(error: z.ZodError) {
  return Response.json({ error: error.issues.map((issue) => issue.message).join(", ") }, { status: 400 })
}

export const TeachingRoutes = (input: { ensureAllowedDirectory: EnsureAllowedDirectory }) =>
  new Hono()
    .post("/session/:sessionID/workspace", async (c) => {
      const directoryResult = input.ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      let body: unknown = {}
      try {
        if (isJsonContentType(c.req.header("content-type"))) {
          body = await c.req.json()
        }
      } catch {
        return invalidJson()
      }

      const parsed = ProvisionRequestSchema.safeParse(body)
      if (!parsed.success) {
        return zodError(parsed.error)
      }

      let config: Awaited<ReturnType<typeof readProjectConfig>>
      try {
        config = await readProjectConfig(directoryResult.directory)
      } catch (error) {
        if (isConfigValidationError(error)) {
          return c.json({ error: configErrorMessage(error) }, 400)
        }
        throw error
      }

      const mode = (() => {
        if (parsed.data.mode) {
          if (!isBuddyModeID(parsed.data.mode)) {
            return undefined
          }

          const explicitMode = getBuddyMode(parsed.data.mode, config.modes)
          if (explicitMode.hidden) {
            return undefined
          }

          return explicitMode
        }

        return getDefaultBuddyMode({
          defaultMode: config.default_mode,
          overrides: config.modes,
        })
      })()

      if (!mode) {
        return c.json({ error: "Unknown Buddy mode" }, 400)
      }

      if (!mode.surfaces.includes("editor")) {
        return c.json({ error: `Buddy mode "${mode.id}" cannot start an interactive lesson` }, 400)
      }

      const workspace = await TeachingService.ensure(
        directoryResult.directory,
        c.req.param("sessionID"),
        parsed.data.language ?? "ts",
      )
      return c.json(workspace)
    })
    .get("/session/:sessionID/workspace", async (c) => {
      const directoryResult = input.ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      try {
        const workspace = await TeachingService.read(directoryResult.directory, c.req.param("sessionID"))
        return c.json(workspace)
      } catch (error) {
        if (error instanceof TeachingWorkspaceNotFoundError) {
          return c.json({ error: error.message }, 404)
        }
        throw error
      }
    })
    .put("/session/:sessionID/workspace", async (c) => {
      const directoryResult = input.ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return invalidJson()
      }

      const parsed = TeachingWorkspaceUpdateRequestSchema.safeParse(body)
      if (!parsed.success) {
        return zodError(parsed.error)
      }

      try {
        const workspace = await TeachingService.save(directoryResult.directory, c.req.param("sessionID"), parsed.data)
        return c.json(workspace)
      } catch (error) {
        if (error instanceof TeachingWorkspaceNotFoundError) {
          return c.json({ error: error.message }, 404)
        }
        if (error instanceof TeachingWorkspaceFileError) {
          return c.json({ error: error.message }, 400)
        }
        if (error instanceof TeachingRevisionConflictError) {
          return c.json(
            {
              error: error.message,
              ...error.response,
            },
            409,
          )
        }
        throw error
      }
    })
    .post("/session/:sessionID/file", async (c) => {
      const directoryResult = input.ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return invalidJson()
      }

      const parsed = TeachingWorkspaceCreateFileRequestSchema.safeParse(body)
      if (!parsed.success) {
        return zodError(parsed.error)
      }

      try {
        const workspace = await TeachingService.addFile(
          directoryResult.directory,
          c.req.param("sessionID"),
          parsed.data,
        )
        return c.json(workspace)
      } catch (error) {
        if (error instanceof TeachingWorkspaceNotFoundError) {
          return c.json({ error: error.message }, 404)
        }
        if (error instanceof TeachingWorkspaceFileError) {
          return c.json({ error: error.message }, 400)
        }
        throw error
      }
    })
    .post("/session/:sessionID/active-file", async (c) => {
      const directoryResult = input.ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return invalidJson()
      }

      const parsed = TeachingWorkspaceActivateFileRequestSchema.safeParse(body)
      if (!parsed.success) {
        return zodError(parsed.error)
      }

      try {
        const workspace = await TeachingService.activateFile(
          directoryResult.directory,
          c.req.param("sessionID"),
          parsed.data.relativePath,
        )
        return c.json(workspace)
      } catch (error) {
        if (error instanceof TeachingWorkspaceNotFoundError) {
          return c.json({ error: error.message }, 404)
        }
        if (error instanceof TeachingWorkspaceFileError) {
          return c.json({ error: error.message }, 400)
        }
        throw error
      }
    })
    .post("/session/:sessionID/checkpoint", async (c) => {
      const directoryResult = input.ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      try {
        const checkpoint = await TeachingService.checkpoint(directoryResult.directory, c.req.param("sessionID"))
        return c.json({
          revision: checkpoint.revision,
          lessonFilePath: checkpoint.lessonFilePath,
          checkpointFilePath: checkpoint.checkpointFilePath,
        })
      } catch (error) {
        if (error instanceof TeachingWorkspaceNotFoundError) {
          return c.json({ error: error.message }, 404)
        }
        throw error
      }
    })
    .post("/session/:sessionID/restore", async (c) => {
      const directoryResult = input.ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      try {
        const workspace = await TeachingService.restore(directoryResult.directory, c.req.param("sessionID"))
        return c.json(workspace)
      } catch (error) {
        if (error instanceof TeachingWorkspaceNotFoundError) {
          return c.json({ error: error.message }, 404)
        }
        throw error
      }
    })
