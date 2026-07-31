import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { mapConfigRouteError } from "@buddy/backend/config/orchestration"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import {
  detectObsidianVault,
  resolveObsidianVaultLinks,
} from "../learning/features/obsidian-vault/service"

const OBSIDIAN_RESOLVE_LINKS_MAX_TARGETS = 500

const obsidianVaultProfileResponseSchema = z.object({
  detected: z.boolean(),
  connected: z.boolean(),
  configDirectories: z.array(z.string()),
})

const obsidianResolveLinksBodySchema = z.object({
  documentPath: z.string().trim().min(1),
  targets: z.array(z.string().trim().min(1)).max(OBSIDIAN_RESOLVE_LINKS_MAX_TARGETS),
})

const obsidianResolvedLinkSchema = z.object({
  target: z.string(),
  status: z.enum(["resolved", "unresolved"]),
  path: z.string().optional(),
  fragment: z.string().optional(),
  kind: z.enum(["file", "image", "markdown", "media"]).optional(),
})

const obsidianResolveLinksResponseSchema = z.object({
  links: z.array(obsidianResolvedLinkSchema),
  partial: z.boolean(),
})

async function inspectObsidianVaultProfile(directory: string) {
  const [detection, config] = await Promise.all([
    detectObsidianVault(directory),
    readProjectConfig(directory),
  ])

  return {
    ...detection,
    connected: detection.detected && config.obsidian_vault?.connected === true,
  }
}

export const ObsidianRoutes = new Hono()
  .get(
    "/profile",
    describeRoute({
      operationId: "obsidian.profile",
      summary: "Inspect Obsidian detection and connection for the active notebook",
      responses: {
        200: {
          description: "Obsidian detection and connection profile",
          content: {
            "application/json": {
              schema: resolver(obsidianVaultProfileResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => c.json(await inspectObsidianVaultProfile(context.directory)),
          mapError: mapConfigRouteError,
        }),
      ),
  )
  .post(
    "/resolve-links",
    describeRoute({
      operationId: "obsidian.resolveLinks",
      summary: "Resolve Obsidian wikilink targets in the active notebook",
      responses: {
        200: {
          description: "Resolved Obsidian wikilink targets",
          content: {
            "application/json": {
              schema: resolver(obsidianResolveLinksResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", obsidianResolveLinksBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const profile = await inspectObsidianVaultProfile(context.directory)
            if (!profile.connected) {
              return c.json(
                { error: "Connect this Obsidian vault to Buddy before resolving vault links." },
                409,
              )
            }

            return c.json(
              await resolveObsidianVaultLinks({
                directory: context.directory,
                documentPath: c.req.valid("json").documentPath,
                targets: c.req.valid("json").targets,
              }),
            )
          },
          mapError: mapConfigRouteError,
        }),
      ),
  )
