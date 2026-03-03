import { Hono } from "hono"
import { z } from "zod"
import { AnyObjectSchema, ErrorSchema } from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import {
  createCustomSkill,
  installPlaceholderLibrarySkill,
  listSkillsCatalog,
  removeManagedSkill,
  setInstalledSkillAction,
} from "../skills/service.js"
import { ensureAllowedDirectory } from "./support.js"

const createSkillBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  examplePrompt: z.string().trim().optional(),
  content: z.string().trim().min(1),
})

const toggleSkillBody = z
  .object({
    action: z.enum(["allow", "deny", "ask", "inherit"]).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => value.action !== undefined || value.enabled !== undefined, {
    message: "action or enabled is required",
  })

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return "Skill request failed"
}

function resolveRequestDirectory(request: Request) {
  const directoryResult = ensureAllowedDirectory(request)
  if (!directoryResult.ok) {
    return directoryResult
  }

  return {
    ok: true as const,
    directory: directoryResult.directory,
  }
}

export const SkillsRoutes = (): Hono =>
  new Hono()
    .get(
      "/",
      compatibilityRoute({
        operationId: "skills.list",
        summary: "List installed skills and placeholder library entries",
        responses: {
          200: {
            description: "Skill catalog",
            content: {
              "application/json": {
                schema: AnyObjectSchema,
              },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": {
                schema: ErrorSchema,
              },
            },
          },
          500: {
            description: "Failed to load skills",
            content: {
              "application/json": {
                schema: ErrorSchema,
              },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = resolveRequestDirectory(c.req.raw)
        if (!directoryResult.ok) {
          return directoryResult.response
        }

        const refreshParam = new URL(c.req.url).searchParams.get("refresh")
        const refresh = refreshParam === "1" || refreshParam === "true"

        try {
          const catalog = await listSkillsCatalog(directoryResult.directory, {
            refresh,
          })
          return c.json(catalog)
        } catch (error) {
          return c.json({ error: errorMessage(error) }, 500)
        }
      },
    )
    .post(
      "/",
      compatibilityRoute({
        operationId: "skills.create",
        summary: "Create a new Buddy-managed custom skill",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: AnyObjectSchema,
            },
          },
        },
        responses: {
          200: {
            description: "Created skill",
            content: {
              "application/json": {
                schema: AnyObjectSchema,
              },
            },
          },
          400: {
            description: "Invalid skill payload",
            content: {
              "application/json": {
                schema: ErrorSchema,
              },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = resolveRequestDirectory(c.req.raw)
        if (!directoryResult.ok) {
          return directoryResult.response
        }

        const payload = await c.req.json().catch(() => undefined)
        const parsed = createSkillBody.safeParse(payload)
        if (!parsed.success) {
          return c.json({ error: "Invalid skill payload" }, 400)
        }

        try {
          const name = await createCustomSkill(parsed.data, directoryResult.directory)
          return c.json({ ok: true, name })
        } catch (error) {
          const message = errorMessage(error)
          const status = /already exists/i.test(message) || /must include/i.test(message) ? 400 : 500
          return c.json({ error: message }, status)
        }
      },
    )
    .post(
      "/library/:skillID/install",
      compatibilityRoute({
        operationId: "skills.library.install",
        summary: "Install a placeholder library skill into Buddy-managed storage",
        responses: {
          200: {
            description: "Installed skill",
            content: {
              "application/json": {
                schema: AnyObjectSchema,
              },
            },
          },
          404: {
            description: "Library item not found",
            content: {
              "application/json": {
                schema: ErrorSchema,
              },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = resolveRequestDirectory(c.req.raw)
        if (!directoryResult.ok) {
          return directoryResult.response
        }

        try {
          const name = await installPlaceholderLibrarySkill(c.req.param("skillID"), directoryResult.directory)
          return c.json({ ok: true, name })
        } catch (error) {
          const message = errorMessage(error)
          const status = /unknown/i.test(message) ? 404 : /already exists|invalid/i.test(message) ? 400 : 500
          return c.json({ error: message }, status)
        }
      },
    )
    .patch(
      "/:name",
      compatibilityRoute({
        operationId: "skills.update",
        summary: "Update a skill permission rule for this user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: AnyObjectSchema,
            },
          },
        },
        responses: {
          200: {
            description: "Updated skill state",
            content: {
              "application/json": {
                schema: AnyObjectSchema,
              },
            },
          },
          400: {
            description: "Invalid skill state",
            content: {
              "application/json": {
                schema: ErrorSchema,
              },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = resolveRequestDirectory(c.req.raw)
        if (!directoryResult.ok) {
          return directoryResult.response
        }

        const payload = await c.req.json().catch(() => undefined)
        const parsed = toggleSkillBody.safeParse(payload)
        if (!parsed.success) {
          return c.json({ error: "Invalid skill state" }, 400)
        }

        const action = parsed.data.action ?? (parsed.data.enabled ? "ask" : "deny")

        try {
          const skill = await setInstalledSkillAction(c.req.param("name"), action, directoryResult.directory)
          return c.json({ ok: true, skill, action })
        } catch (error) {
          return c.json({ error: errorMessage(error) }, 400)
        }
      },
    )
    .delete(
      "/:name",
      compatibilityRoute({
        operationId: "skills.delete",
        summary: "Remove a Buddy-managed installed skill",
        responses: {
          200: {
            description: "Removed skill",
            content: {
              "application/json": {
                schema: AnyObjectSchema,
              },
            },
          },
          400: {
            description: "Skill cannot be removed",
            content: {
              "application/json": {
                schema: ErrorSchema,
              },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": {
                schema: ErrorSchema,
              },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = resolveRequestDirectory(c.req.raw)
        if (!directoryResult.ok) {
          return directoryResult.response
        }

        try {
          const name = await removeManagedSkill(c.req.param("name"), directoryResult.directory)
          return c.json({ ok: true, name })
        } catch (error) {
          const message = errorMessage(error)
          const status = /not found/i.test(message) ? 404 : 400
          return c.json({ error: message }, status)
        }
      },
    )
