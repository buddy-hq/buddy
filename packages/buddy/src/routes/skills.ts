import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { patchProjectConfig } from "@buddy/backend/config/orchestration"
import { HTTP_STATUS, SKILL_ROUTE_CONFIG } from "./skills.constants"
import {
  createSkillBodySchema,
  skillsSettingsBodySchema,
  toggleSkillBodySchema,
} from "./skills.schemas"
import {
  directoryQuerySchema,
  routeErrors,
  runRouteTask,
  SkillIDParamSchema,
  SkillNameParamSchema,
  withDirectoryRoute,
} from "../http"
import {
  createCustomSkill,
  installCuratedLibrarySkill,
  listSkillsCatalog,
  removeManagedSkill,
  setInstalledSkillAction,
} from "../learning/skills"
import {
  createSkillErrorStatus,
  installLibrarySkillErrorStatus,
  notFoundSkillErrorStatus,
  resolveSkillAction,
  shouldRefreshSkillCatalog,
  skillErrorMessage,
} from "./skills.route-helpers"

const installedSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  location: z.string(),
  directory: z.string(),
  content: z.string(),
  examplePrompt: z.string().optional(),
  enabled: z.boolean(),
  permissionAction: z.enum(["allow", "deny", "ask"]),
  permissionSource: z.enum(["explicit", "inherited", "default"]),
  source: z.enum(["custom", "library", "external"]),
  scope: z.enum(["global", "workspace"]),
  managed: z.boolean(),
  removable: z.boolean(),
  libraryID: z.string().optional(),
})

const skillLibraryEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  summary: z.string(),
  examplePrompt: z.string(),
  installed: z.boolean(),
})

const skillsCatalogResponseSchema = z.object({
  directory: z.string(),
  managedRoot: z.string(),
  externalVendorRootsEnabled: z.boolean(),
  installed: z.array(installedSkillSchema),
  library: z.array(skillLibraryEntrySchema),
  librarySyncError: z.string().optional(),
})

const skillCreatedResponseSchema = z.object({
  ok: z.literal(true),
  name: z.string(),
})

const skillUpdatedResponseSchema = z.object({
  ok: z.literal(true),
  skill: installedSkillSchema,
  action: z.enum(["allow", "deny", "ask", "inherit"]),
})

const skillsSettingsResponseSchema = z.object({
  ok: z.literal(true),
  externalVendorRootsEnabled: z.boolean(),
})

const listSkillsQuerySchema = directoryQuerySchema.extend({
  refresh: z.string().optional(),
})

export const SkillsRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "skills.list",
      summary: "List installed skills and curated library entries",
      responses: {
        200: {
          description: "Skill catalog",
          content: {
            "application/json": { schema: resolver(skillsCatalogResponseSchema) },
          },
        },
        ...routeErrors(403, 500),
      },
    }),
    validator("query", listSkillsQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const query = c.req.valid("query")
            const catalog = await listSkillsCatalog(context.directory, {
              refresh: shouldRefreshSkillCatalog(query.refresh),
            })
            return c.json(catalog)
          },
          mapError: (error) =>
            c.json({ error: skillErrorMessage(error) }, HTTP_STATUS.INTERNAL_SERVER_ERROR),
        }),
      ),
  )
  .post(
    "/",
    describeRoute({
      operationId: "skills.create",
      summary: "Create a new Buddy-managed custom skill",
      responses: {
        200: {
          description: "Created skill",
          content: {
            "application/json": { schema: resolver(skillCreatedResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 409, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", createSkillBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const name = await createCustomSkill(c.req.valid("json"), context.directory)
            return c.json({ ok: true, name })
          },
          mapError: (error) =>
            c.json({ error: skillErrorMessage(error) }, createSkillErrorStatus(error)),
        }),
      ),
  )
  .post(
    "/library/:skillID/install",
    describeRoute({
      operationId: "skills.library.install",
      summary: "Install a curated library skill into Buddy-managed storage",
      responses: {
        200: {
          description: "Installed skill",
          content: {
            "application/json": { schema: resolver(skillCreatedResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 409, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SkillIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const name = await installCuratedLibrarySkill(
              c.req.valid("param").skillID,
              context.directory,
            )
            return c.json({ ok: true, name })
          },
          mapError: (error) =>
            c.json({ error: skillErrorMessage(error) }, installLibrarySkillErrorStatus(error)),
        }),
      ),
  )
  .patch(
    "/settings",
    describeRoute({
      operationId: "skills.settings.patch",
      summary: "Update per-project skills settings",
      responses: {
        200: {
          description: "Updated skills settings",
          content: {
            "application/json": { schema: resolver(skillsSettingsResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", skillsSettingsBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const parsed = c.req.valid("json")
            const config = await patchProjectConfig({
              directory: context.directory,
              payload: {
                [SKILL_ROUTE_CONFIG.externalVendorRootsEnabledKey]:
                  parsed.externalVendorRootsEnabled,
              },
            })
            return c.json({
              ok: true,
              externalVendorRootsEnabled: config.skills_external_vendor_roots_enabled === true,
            })
          },
          mapError: (error) =>
            c.json({ error: skillErrorMessage(error) }, HTTP_STATUS.INTERNAL_SERVER_ERROR),
        }),
      ),
  )
  .patch(
    "/:name",
    describeRoute({
      operationId: "skills.update",
      summary: "Update a skill permission rule for this user",
      responses: {
        200: {
          description: "Updated skill state",
          content: {
            "application/json": { schema: resolver(skillUpdatedResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SkillNameParamSchema),
    validator("json", toggleSkillBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const payload = c.req.valid("json")
            const action = resolveSkillAction(payload)
            const skill = await setInstalledSkillAction(
              c.req.valid("param").name,
              action,
              context.directory,
            )
            return c.json({ ok: true, skill, action })
          },
          mapError: (error) =>
            c.json({ error: skillErrorMessage(error) }, notFoundSkillErrorStatus(error)),
        }),
      ),
  )
  .delete(
    "/:name",
    describeRoute({
      operationId: "skills.delete",
      summary: "Remove a Buddy-managed installed skill",
      responses: {
        200: {
          description: "Removed skill",
          content: {
            "application/json": { schema: resolver(skillCreatedResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SkillNameParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const removedSkillName = await removeManagedSkill(
              c.req.valid("param").name,
              context.directory,
            )
            return c.json({ ok: true, name: removedSkillName })
          },
          mapError: (error) =>
            c.json({ error: skillErrorMessage(error) }, notFoundSkillErrorStatus(error)),
        }),
      ),
  )
