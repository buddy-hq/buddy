import { Hono } from "hono"
import { resolver } from "hono-openapi"
import z from "zod"
import { PERSONA_IDS, TEACHING_INTENT_IDS } from "../learning/runtime/types.js"
import { LearnerService } from "../learning/learner/service.js"
import { AnyObjectSchema, ErrorSchema } from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import {
  LearnerArtifactListQuerySchema,
  LearnerWorkspacePatchSchema,
  parseArtifactListQuery,
  parseDecisionPlanRequest,
  parseSnapshotQuery,
  readWorkspaceStateFromSession,
} from "./handlers/learner.js"
import { directoryParameters } from "./shared/openapi.js"
import { zodIssuesResponse } from "./shared/request-json.js"
import { withDirectoryContext, withJsonBody } from "./shared/route-helpers.js"

export const LearnerRoutes = () =>
  new Hono()
    .get(
      "/snapshot",
      compatibilityRoute({
        operationId: "learner.snapshot",
        summary: "Get learner snapshot",
        parameters: [
          ...directoryParameters,
          {
            in: "query",
            name: "persona",
            schema: resolver(z.enum(PERSONA_IDS)),
          },
          {
            in: "query",
            name: "intent",
            schema: resolver(z.enum(TEACHING_INTENT_IDS)),
          },
          {
            in: "query",
            name: "goalId",
            schema: resolver(z.array(z.string())),
          },
          {
            in: "query",
            name: "sessionId",
            schema: resolver(z.string()),
          },
          {
            in: "query",
            name: "workspaceState",
            schema: resolver(z.enum(["chat", "interactive"])),
          },
        ],
        responses: {
          200: {
            description: "Learner snapshot",
            content: { "application/json": { schema: AnyObjectSchema } },
          },
          400: {
            description: "Invalid query parameters",
            content: { "application/json": { schema: ErrorSchema } },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: { "application/json": { schema: ErrorSchema } },
          },
        },
      }),
      async (c) => {
        const contextResult = withDirectoryContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const parsed = parseSnapshotQuery(contextResult.value.requestURL)
        if (!parsed.success) {
          return zodIssuesResponse(parsed.error)
        }

        const snapshot = await LearnerService.getWorkspaceSnapshot({
          directory: contextResult.value.directory,
          query: {
            ...parsed.data,
            workspaceState:
              parsed.data.workspaceState ??
              readWorkspaceStateFromSession({
                directory: contextResult.value.directory,
                sessionId: parsed.data.sessionId,
              }),
          },
        })
        return c.json(snapshot)
      },
    )
    .post(
      "/plan",
      compatibilityRoute({
        operationId: "learner.plan",
        summary: "Create or reuse plan decision",
        parameters: [
          ...directoryParameters,
          {
            in: "query",
            name: "persona",
            schema: resolver(z.enum(PERSONA_IDS)),
          },
          {
            in: "query",
            name: "intent",
            schema: resolver(z.enum(TEACHING_INTENT_IDS)),
          },
          {
            in: "query",
            name: "goalId",
            schema: resolver(z.array(z.string())),
          },
          {
            in: "query",
            name: "sessionId",
            schema: resolver(z.string()),
          },
          {
            in: "query",
            name: "workspaceState",
            schema: resolver(z.enum(["chat", "interactive"])),
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: AnyObjectSchema,
            },
          },
        },
        responses: {
          200: {
            description: "Plan decision",
            content: { "application/json": { schema: AnyObjectSchema } },
          },
          400: {
            description: "Invalid request",
            content: { "application/json": { schema: ErrorSchema } },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: { "application/json": { schema: ErrorSchema } },
          },
        },
      }),
      async (c) => {
        const contextResult = withDirectoryContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const bodyResult = await withJsonBody(c.req.raw, {
          optional: true,
          fallbackBody: {},
        })
        if (!bodyResult.ok) return bodyResult.response

        const parsed = parseDecisionPlanRequest({
          requestURL: contextResult.value.requestURL,
          body: bodyResult.value,
        })
        if (!parsed.success) {
          return zodIssuesResponse(parsed.error)
        }

        const decision = await LearnerService.ensurePlanDecision({
          directory: contextResult.value.directory,
          query: {
            ...parsed.data,
            workspaceState:
              parsed.data.workspaceState ??
              readWorkspaceStateFromSession({
                directory: contextResult.value.directory,
                sessionId: parsed.data.sessionId,
              }),
          },
        })
        return c.json(decision)
      },
    )
    .get(
      "/artifacts",
      compatibilityRoute({
        operationId: "learner.artifacts",
        summary: "List learner artifacts",
        parameters: [
          ...directoryParameters,
          {
            in: "query",
            name: "kind",
            schema: resolver(LearnerArtifactListQuerySchema.shape.kind.unwrap()),
          },
          {
            in: "query",
            name: "goalId",
            schema: resolver(z.string()),
          },
          {
            in: "query",
            name: "status",
            schema: resolver(z.string()),
          },
          {
            in: "query",
            name: "includeRaw",
            schema: resolver(z.boolean()),
          },
        ],
        responses: {
          200: {
            description: "Artifact list",
            content: { "application/json": { schema: AnyObjectSchema } },
          },
          400: {
            description: "Invalid query parameters",
            content: { "application/json": { schema: ErrorSchema } },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: { "application/json": { schema: ErrorSchema } },
          },
        },
      }),
      async (c) => {
        const contextResult = withDirectoryContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const parsed = parseArtifactListQuery(contextResult.value.requestURL)
        if (!parsed.success) {
          return zodIssuesResponse(parsed.error)
        }

        const artifacts = await LearnerService.listArtifacts({
          directory: contextResult.value.directory,
          kind: parsed.data.kind,
          goalId: parsed.data.goalId,
          status: parsed.data.status,
          includeRaw: parsed.data.includeRaw,
        })

        return c.json({ artifacts })
      },
    )
    .patch(
      "/workspace",
      compatibilityRoute({
        operationId: "learner.workspace.patch",
        summary: "Patch learner workspace and profile",
        parameters: directoryParameters,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: resolver(LearnerWorkspacePatchSchema),
            },
          },
        },
        responses: {
          200: {
            description: "Updated workspace/profile",
            content: { "application/json": { schema: AnyObjectSchema } },
          },
          400: {
            description: "Invalid request",
            content: { "application/json": { schema: ErrorSchema } },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: { "application/json": { schema: ErrorSchema } },
          },
        },
      }),
      async (c) => {
        const contextResult = withDirectoryContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const bodyResult = await withJsonBody(c.req.raw)
        if (!bodyResult.ok) return bodyResult.response

        const parsed = LearnerWorkspacePatchSchema.safeParse(bodyResult.value)
        if (!parsed.success) {
          return zodIssuesResponse(parsed.error)
        }

        const patched = await LearnerService.patchWorkspace({
          directory: contextResult.value.directory,
          workspace: parsed.data.workspace,
          profile: parsed.data.profile,
        })

        return c.json(patched)
      },
    )
