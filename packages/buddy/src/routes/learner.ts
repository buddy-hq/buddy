import { Hono } from "hono"
import { resolver } from "hono-openapi"
import z from "zod"
import { PERSONA_IDS, TEACHING_INTENT_IDS } from "../learning/runtime/types.js"
import { readTeachingSessionState } from "../learning/runtime/session-state.js"
import { LearnerService } from "../learning/learner/service.js"
import { LearnerStateQuerySchema } from "../learning/learner/types.js"
import { AnyObjectSchema, DirectoryHeader, DirectoryQuery, ErrorSchema } from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import { ensureAllowedDirectory } from "./support.js"

const CurriculumQuerySchema = z.object({
  persona: z.enum(PERSONA_IDS).optional(),
  intent: z.enum(TEACHING_INTENT_IDS).optional(),
  focusGoalIds: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
})

const directoryParameters = [DirectoryHeader, DirectoryQuery]

function invalidJson() {
  return Response.json({ error: "Invalid JSON body" }, { status: 400 })
}

async function readScopedLearnerProjections(directory: string) {
  const goalIds = new Set((await LearnerService.getWorkspaceGoals(directory)).map((goal) => goal.goalId))
  const state = await LearnerService.readState()
  const projections = state.projections.progress.length > 0 ? state.projections : await LearnerService.rebuildProjections()

  return {
    progress: projections.progress.filter((record) => goalIds.has(record.goalId)),
    review: projections.review.filter((record) => goalIds.has(record.goalId)),
  }
}

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
      const directoryResult = ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      const workspace = await LearnerService.ensureWorkspaceContext(directoryResult.directory)
      const stateQuery = LearnerStateQuerySchema.parse({
        workspaceId: c.req.query("workspaceId") ?? workspace.workspaceId,
        goalIds: c.req.query("goalId") ? c.req.queries("goalId") : [],
        conceptTags: c.req.query("conceptTag") ? c.req.queries("conceptTag") : [],
        includeDerived: c.req.query("includeDerived")
          ? c.req.query("includeDerived") !== "false"
          : true,
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
      const directoryResult = ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      const goals = await LearnerService.getWorkspaceGoals(directoryResult.directory)
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
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const projections = await readScopedLearnerProjections(directoryResult.directory)
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
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const projections = await readScopedLearnerProjections(directoryResult.directory)
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
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const params = CurriculumQuerySchema.parse({
          persona: c.req.query("persona") ?? undefined,
          intent: c.req.query("intent") ?? undefined,
          focusGoalIds: c.req.query("goalId") ? c.req.queries("goalId") : undefined,
          sessionId: c.req.query("sessionId") ?? undefined,
        })
        const workspace = await LearnerService.ensureWorkspaceContext(directoryResult.directory)
        const workspaceState = params.sessionId
          ? readTeachingSessionState(directoryResult.directory, params.sessionId)?.workspaceState ?? "chat"
          : "chat"
        const view = await LearnerService.getCurriculumView(directoryResult.directory, {
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
              schema: resolver(
                z.object({
                  label: z.string().optional(),
                  tags: z.array(z.string()).optional(),
                  pinnedGoalIds: z.array(z.string()).optional(),
                  projectConstraints: z.array(z.string()).optional(),
                  localToolAvailability: z.array(z.string()).optional(),
                  preferredSurfaces: z.array(z.enum(["chat", "curriculum", "editor", "figure", "quiz"])).optional(),
                  motivationContext: z.string().optional(),
                  opportunities: z.array(z.string()).optional(),
                  userOverride: z.boolean().optional(),
                  learnerConstraints: z
                    .object({
                      background: z.array(z.string()).optional(),
                      knownPrerequisites: z.array(z.string()).optional(),
                      availableTimePatterns: z.array(z.string()).optional(),
                      toolEnvironmentLimits: z.array(z.string()).optional(),
                      motivationAnchors: z.array(z.string()).optional(),
                      opportunities: z.array(z.string()).optional(),
                      learnerPreferences: z.array(z.string()).optional(),
                    })
                    .optional(),
                }),
              ),
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
      const directoryResult = ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      let body: unknown = {}
      try {
        body = await c.req.json()
      } catch {
        return invalidJson()
      }

      const parsed = z
        .object({
          label: z.string().optional(),
          tags: z.array(z.string()).optional(),
          pinnedGoalIds: z.array(z.string()).optional(),
          projectConstraints: z.array(z.string()).optional(),
          localToolAvailability: z.array(z.string()).optional(),
          preferredSurfaces: z.array(z.enum(["chat", "curriculum", "editor", "figure", "quiz"])).optional(),
          motivationContext: z.string().optional(),
          opportunities: z.array(z.string()).optional(),
          userOverride: z.boolean().optional(),
          learnerConstraints: z
            .object({
              background: z.array(z.string()).optional(),
              knownPrerequisites: z.array(z.string()).optional(),
              availableTimePatterns: z.array(z.string()).optional(),
              toolEnvironmentLimits: z.array(z.string()).optional(),
              motivationAnchors: z.array(z.string()).optional(),
              opportunities: z.array(z.string()).optional(),
              learnerPreferences: z.array(z.string()).optional(),
            })
            .optional(),
        })
        .safeParse(body)

      if (!parsed.success) {
        return c.json({ error: parsed.error.issues.map((issue) => issue.message).join(", ") }, 400)
      }

      const { learnerConstraints, ...workspacePatch } = parsed.data
      const [context, constraints] = await Promise.all([
        LearnerService.updateWorkspaceContext(directoryResult.directory, workspacePatch),
        learnerConstraints ? LearnerService.updateLearnerConstraints(learnerConstraints) : Promise.resolve(undefined),
      ])
      return c.json({
        workspace: context,
        learnerConstraints: constraints,
      })
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
      const directoryResult = ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      const projections = await LearnerService.runSafetySweep()
      return c.json(projections)
      },
    )
