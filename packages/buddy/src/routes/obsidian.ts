import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, withDirectoryRoute } from "../http"
import {
  inspectObsidianVault,
  resolveObsidianVaultLinks,
} from "../learning/features/obsidian-vault/service"

const OBSIDIAN_RESOLVE_LINKS_MAX_TARGETS = 500

const obsidianVaultProfileResponseSchema = z.object({
  compatible: z.boolean(),
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

export const ObsidianRoutes = new Hono()
  .get(
    "/profile",
    describeRoute({
      operationId: "obsidian.profile",
      summary: "Inspect Obsidian compatibility for the active notebook",
      responses: {
        200: {
          description: "Obsidian compatibility profile",
          content: {
            "application/json": {
              schema: resolver(obsidianVaultProfileResponseSchema),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => c.json(await inspectObsidianVault(context.directory))),
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
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", obsidianResolveLinksBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        c.json(
          await resolveObsidianVaultLinks({
            directory: context.directory,
            documentPath: c.req.valid("json").documentPath,
            targets: c.req.valid("json").targets,
          }),
        ),
      ),
  )
