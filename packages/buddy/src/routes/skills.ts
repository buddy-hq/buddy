import { Hono } from "hono"
import { AnyObjectSchema, ErrorSchema } from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import {
  createSkill,
  installLibrarySkill,
  loadSkillsCatalog,
  parseCreateSkillPayload,
  parseToggleSkillPayload,
  removeSkill,
  resolveSkillAction,
  shouldRefreshSkillCatalog,
  updateSkill,
} from "./handlers/skills.js"
import { directoryParameters } from "./shared/openapi.js"
import { withJsonBody } from "./shared/route-helpers.js"
import { resolveDirectoryRequestContext } from "./support/directory.js"

export const SkillsRoutes = (): Hono =>
  new Hono()
    .get(
      "/",
      compatibilityRoute({
        operationId: "skills.list",
        summary: "List installed skills and placeholder library entries",
        parameters: directoryParameters,
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
        const contextResult = resolveDirectoryRequestContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const catalogResult = await loadSkillsCatalog({
          directory: contextResult.context.directory,
          refresh: shouldRefreshSkillCatalog(contextResult.context.requestURL.toString()),
        })
        if (!catalogResult.ok) {
          return c.json({ error: catalogResult.error }, catalogResult.status)
        }
        return c.json(catalogResult.catalog)
      },
    )
    .post(
      "/",
      compatibilityRoute({
        operationId: "skills.create",
        summary: "Create a new Buddy-managed custom skill",
        parameters: directoryParameters,
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
          409: {
            description: "Skill already exists",
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
        const contextResult = resolveDirectoryRequestContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const bodyResult = await withJsonBody(c.req.raw)
        if (!bodyResult.ok) return c.json({ error: "Invalid skill payload" }, 400)

        const parsed = parseCreateSkillPayload(bodyResult.value)
        if (!parsed.success) {
          return c.json({ error: "Invalid skill payload" }, 400)
        }

        const createResult = await createSkill({
          directory: contextResult.context.directory,
          payload: parsed.data,
        })
        if (!createResult.ok) {
          return c.json({ error: createResult.error }, createResult.status)
        }
        return c.json({ ok: true, name: createResult.name })
      },
    )
    .post(
      "/library/:skillID/install",
      compatibilityRoute({
        operationId: "skills.library.install",
        summary: "Install a placeholder library skill into Buddy-managed storage",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Installed skill",
            content: {
              "application/json": {
                schema: AnyObjectSchema,
              },
            },
          },
          400: {
            description: "Invalid library item",
            content: {
              "application/json": {
                schema: ErrorSchema,
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
          409: {
            description: "Skill already exists",
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
        const contextResult = resolveDirectoryRequestContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const installResult = await installLibrarySkill({
          directory: contextResult.context.directory,
          skillID: c.req.param("skillID"),
        })
        if (!installResult.ok) {
          return c.json({ error: installResult.error }, installResult.status)
        }
        return c.json({ ok: true, name: installResult.name })
      },
    )
    .patch(
      "/:name",
      compatibilityRoute({
        operationId: "skills.update",
        summary: "Update a skill permission rule for this user",
        parameters: directoryParameters,
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
        const contextResult = resolveDirectoryRequestContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const bodyResult = await withJsonBody(c.req.raw)
        if (!bodyResult.ok) return c.json({ error: "Invalid skill state" }, 400)

        const parsed = parseToggleSkillPayload(bodyResult.value)
        if (!parsed.success) {
          return c.json({ error: "Invalid skill state" }, 400)
        }

        const updateResult = await updateSkill({
          directory: contextResult.context.directory,
          name: c.req.param("name"),
          action: resolveSkillAction(parsed.data),
        })
        if (!updateResult.ok) {
          return c.json({ error: updateResult.error }, updateResult.status)
        }
        return c.json({ ok: true, skill: updateResult.skill, action: updateResult.action })
      },
    )
    .delete(
      "/:name",
      compatibilityRoute({
        operationId: "skills.delete",
        summary: "Remove a Buddy-managed installed skill",
        parameters: directoryParameters,
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
          404: {
            description: "Skill not found",
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
        const contextResult = resolveDirectoryRequestContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const removeResult = await removeSkill({
          directory: contextResult.context.directory,
          name: c.req.param("name"),
        })
        if (!removeResult.ok) {
          return c.json({ error: removeResult.error }, removeResult.status)
        }
        return c.json({ ok: true, name: removeResult.name })
      },
    )
