import { Hono } from "hono"
import { resolver } from "hono-openapi"
import z from "zod"
import { PERSONA_IDS, TEACHING_INTENT_IDS } from "../learning/runtime/types.js"
import { LearnerService } from "../learning/learner/service.js"
import { AnyObjectSchema, ErrorSchema } from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import {
  buildLearnerStateQueryFromRequest,
  LearnerContextPatchSchema,
  parseCurriculumViewQuery,
  patchWorkspaceLearnerContext,
  readScopedLearnerProjections,
  readWorkspaceStateFromSession,
} from "./handlers/learner.js"
import { directoryParameters } from "./shared/openapi.js"
import { zodIssuesResponse } from "./shared/request-json.js"
import { withDirectoryContext, withJsonBody } from "./shared/route-helpers.js"

export const LearnerRoutes = () =>
  new Hono()
    .get(
      "/state",
      compatibilityRoute({
        operationId: "learner.state",
        summary: "Get learner state",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Learner state",
            content: { "application/json": { schema: AnyObjectSchema } },
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

        const workspace = await LearnerService.ensureWorkspaceContext(contextResult.value.directory)
        const stateQuery = buildLearnerStateQueryFromRequest({
          requestURL: contextResult.value.requestURL,
          workspaceId: workspace.workspaceId,
        })
        const state = await LearnerService.queryState(stateQuery)
        return c.json({
          workspace,
          ...state,
        })
      },
    )
    .get(
      "/goals",
      compatibilityRoute({
        operationId: "learner.goals",
        summary: "Get relevant learner goals",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Relevant learner goals",
            content: { "application/json": { schema: AnyObjectSchema } },
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

        const goals = await LearnerService.getWorkspaceGoals(contextResult.value.directory)
        return c.json({ goals })
      },
    )
    .get(
      "/progress",
      compatibilityRoute({
        operationId: "learner.progress",
        summary: "Get learner progress projection",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Learner progress projection",
            content: { "application/json": { schema: AnyObjectSchema } },
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

        const projections = await readScopedLearnerProjections(contextResult.value.directory)
        return c.json({ progress: projections.progress })
      },
    )
    .get(
      "/review",
      compatibilityRoute({
        operationId: "learner.review",
        summary: "Get learner review projection",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Learner review projection",
            content: { "application/json": { schema: AnyObjectSchema } },
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

        const projections = await readScopedLearnerProjections(contextResult.value.directory)
        return c.json({ review: projections.review })
      },
    )
    .get(
      "/curriculum-view",
      compatibilityRoute({
        operationId: "learner.curriculumView",
        summary: "Get generated learning-plan view",
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
            schema: resolver(z.string()),
          },
          {
            in: "query",
            name: "sessionId",
            schema: resolver(z.string()),
          },
        ],
        responses: {
          200: {
            description: "Generated learning-plan view",
            content: { "application/json": { schema: AnyObjectSchema } },
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

        const params = parseCurriculumViewQuery(contextResult.value.requestURL)
        const workspace = await LearnerService.ensureWorkspaceContext(contextResult.value.directory)
        const workspaceState = readWorkspaceStateFromSession({
          directory: contextResult.value.directory,
          sessionId: params.sessionId,
        })
        const view = await LearnerService.getCurriculumView(contextResult.value.directory, {
          workspaceId: workspace.workspaceId,
          persona: params.persona ?? "buddy",
          intent: params.intent,
          focusGoalIds: params.focusGoalIds ?? [],
          tokenBudget: 1200,
          workspaceState,
        })
        return c.json(view)
      },
    )
    .post(
      "/context",
      compatibilityRoute({
        operationId: "learner.context",
        summary: "Update workspace learner context",
        parameters: directoryParameters,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: resolver(LearnerContextPatchSchema),
            },
          },
        },
        responses: {
          200: {
            description: "Updated workspace context",
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

        const parsed = LearnerContextPatchSchema.safeParse(bodyResult.value)
        if (!parsed.success) {
          return zodIssuesResponse(parsed.error)
        }

        const contextPatch = await patchWorkspaceLearnerContext({
          directory: contextResult.value.directory,
          patch: parsed.data,
        })
        return c.json(contextPatch)
      },
    )
    .post(
      "/rebuild",
      compatibilityRoute({
        operationId: "learner.rebuild",
        summary: "Rebuild learner projections",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Rebuilt learner projections",
            content: { "application/json": { schema: AnyObjectSchema } },
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

        const projections = await LearnerService.runSafetySweep()
        return c.json(projections)
      },
    )
