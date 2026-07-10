import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { readProjectConfig } from "../config/runtime"
import { directoryQuerySchema, routeErrors, withDirectoryRoute } from "../http"
import {
  EvaluationReportSchema,
  LearnerMemorySourcePointerSchema,
  LearnerMemorySchema,
  LearnerMemoryPath,
  buildLearnerMemorySourcePointers,
  buildLearnerRuntimeSnapshot,
  deleteLearnerMemory,
  editLearnerMemory,
  extractLearnerMemoryFromSession,
  findLearnerMemory,
  getLearnerMemoryLabRunState,
  getLearnerMemoryPipelineDiagnostics,
  regenerateLearnerMemoryMarkdown,
  hideLearnerMemory,
  listLearnerMemories,
  pinLearnerMemory,
  rebuildLearnerMemoryIndex,
  rejectLearnerMemory,
  resetLearnerMemory,
  resolveLearnerMemory,
  runLearnerMemoryLab,
  runLearnerMemoryMaintenance,
  runLearnerMemoryEvaluation,
  searchLearnerMemory,
  startLearnerMemoryLabRun,
} from "../learning/features/memory"
import { readLearnerMemorySettings } from "../learning/features/memory/settings"
import { buildLearnerContextView } from "../learning/shared/learner-context-delivery"
import { Config } from "../config"
import { EXPERIMENTAL_FEATURE_ID } from "../experimental-features/catalog"
import { experimentalFeatureIsEnabled } from "../experimental-features/service"

const learnerMemorySearchQuerySchema = directoryQuerySchema.extend({
  query: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).optional(),
  projectPath: z.string().optional(),
})

const learnerMemoryEvaluationQuerySchema = directoryQuerySchema.extend({
  extractionMode: z.enum(["model", "deterministic"]).optional(),
})

const learnerMemoryLabSelectionSchema = z.object({
  deterministicHarness: z.boolean(),
  modelHarness: z.boolean(),
  startupSweep: z.boolean(),
  currentSessionExtraction: z.boolean(),
  currentSessionExtractionForce: z.boolean(),
  searchProbe: z.boolean(),
})

const learnerMemoryLabSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  autoExtract: z.boolean().optional(),
  minUserMessages: z.number().int().positive().optional(),
  minSessionSpanMs: z.number().int().positive().optional(),
  activeBurstGapMs: z.number().int().positive().optional(),
  minActiveBurstMessages: z.number().int().positive().optional(),
  minAssistantOutputTokens: z.number().int().positive().optional(),
  attentionThreshold: z.number().int().positive().optional(),
  maxExtractionCallsPerSession: z.number().int().positive().optional(),
  maxExtractionCallsPerDay: z.number().int().positive().optional(),
  defaultContextMemoryLimit: z.number().int().positive().optional(),
  extractModel: z.string().optional(),
  consolidationModel: z.string().optional(),
  minStartupIdleMs: z.number().int().positive().optional(),
  maxStartupSessionAgeMs: z.number().int().positive().optional(),
  maxSessionsPerStartup: z.number().int().positive().optional(),
  startupConcurrency: z.number().int().positive().optional(),
  maxRawMemoriesForConsolidation: z.number().int().positive().optional(),
  maxUnusedStageOneDays: z.number().int().positive().optional(),
})

const learnerMemoryLabRunBodySchema = z.object({
  sessionID: z.string().min(1).optional(),
  probeQuery: z.string().optional(),
  selection: learnerMemoryLabSelectionSchema,
  settings: learnerMemoryLabSettingsSchema,
})

const learnerMemoryLabStatusQuerySchema = directoryQuerySchema.extend({
  runID: z.string().min(1),
})

const learnerMemorySessionExtractBodySchema = z.object({
  sessionID: z.string().min(1),
  force: z.boolean().optional(),
})

const learnerMemoryHideBodySchema = z.object({
  memoryId: z.string().min(1),
  reason: z.string().min(1),
})

const learnerMemoryRejectBodySchema = learnerMemoryHideBodySchema

const learnerMemoryResolveBodySchema = learnerMemoryHideBodySchema

const learnerMemoryPinBodySchema = z.object({
  memoryId: z.string().min(1),
  pinned: z.boolean(),
  reason: z.string().min(1),
})

const learnerMemoryEditBodySchema = z.object({
  memoryId: z.string().min(1),
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  projectPath: z.string().min(1).optional(),
  reason: z.string().min(1),
})

const learnerMemoryDeleteBodySchema = learnerMemoryHideBodySchema

const learnerMemoryResetBodySchema = z.object({
  reason: z.string().min(1),
})

const learnerMemoryListResponseSchema = z.object({
  memories: z.array(LearnerMemorySchema),
})

const learnerMemoryDigestResponseSchema = z.object({
  fingerprint: z.string(),
  itemCount: z.number().int().nonnegative(),
})

const learnerMemorySourcesResponseSchema = z.object({
  memoryId: z.string(),
  sources: z.array(LearnerMemorySourcePointerSchema),
})

const learnerMemorySearchResponseSchema = z.object({
  results: z.array(
    z.object({
      memory: LearnerMemorySchema,
      score: z.number(),
      reasons: z.array(z.string()),
    }),
  ),
})

const learnerMemorySettingsResponseSchema = z.object({
  enabled: z.boolean(),
  autoExtract: z.boolean(),
  minUserMessages: z.number().int().positive(),
  minSessionSpanMs: z.number().int().positive(),
  activeBurstGapMs: z.number().int().positive(),
  minActiveBurstMessages: z.number().int().positive(),
  minAssistantOutputTokens: z.number().int().positive(),
  attentionThreshold: z.number().int().positive(),
  maxExtractionCallsPerSession: z.number().int().positive(),
  maxExtractionCallsPerDay: z.number().int().positive(),
  defaultContextMemoryLimit: z.number().int().positive(),
  extractModel: z.string().optional(),
  consolidationModel: z.string().optional(),
  minStartupIdleMs: z.number().int().positive(),
  maxStartupSessionAgeMs: z.number().int().positive(),
  maxSessionsPerStartup: z.number().int().positive(),
  startupConcurrency: z.number().int().positive(),
  maxRawMemoriesForConsolidation: z.number().int().positive(),
  maxUnusedStageOneDays: z.number().int().positive(),
})

const learnerMemorySessionExtractResponseSchema = z.object({
  enabled: z.boolean(),
  sessionID: z.string(),
  decision: z
    .object({
      fixtureId: z.string(),
      decision: z.enum(["skip", "extract"]),
      score: z.number(),
      reasons: z.array(z.string()),
    })
    .optional(),
  candidateCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  memoryIds: z.array(z.string()),
  skippedReason: z.string().optional(),
  consolidationError: z.string().optional(),
})

const learnerMemoryHideResponseSchema = z.object({
  memory: LearnerMemorySchema.optional(),
})

const learnerMemoryDeleteResponseSchema = z.object({
  deleted: z.boolean(),
})

const learnerMemoryResetResponseSchema = z.object({
  reset: z.literal(true),
})

const learnerMemoryIndexRebuildResponseSchema = z.object({
  indexPath: z.string(),
  memoryCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
})

const learnerMemoryMaintenanceResponseSchema = z.object({
  decayedMemoryIds: z.array(z.string()),
  staleMemoryIds: z.array(z.string()),
  supersededMemoryIds: z.array(z.string()),
  repairedFiles: z.array(z.string()),
  indexPath: z.string(),
  workingSummaryPath: z.string(),
  workingMemoryPath: z.string(),
})

const learnerMemoryPipelineDiagnosticsResponseSchema = z.object({
  memoryRoot: z.string(),
  stageOneJobs: z.array(
    z.object({
      jobKey: z.string(),
      workerId: z.string().nullable(),
      leaseExpiresAtMs: z.number().nullable(),
      lastSuccessWatermarkMs: z.number().nullable(),
      retryAfterMs: z.number().nullable(),
      attemptCount: z.number(),
      lastFailure: z.string().nullable(),
      updatedAtMs: z.number(),
    }),
  ),
  phaseTwoJob: z
    .object({
      jobKey: z.string(),
      workerId: z.string().nullable(),
      leaseExpiresAtMs: z.number().nullable(),
      lastSuccessWatermarkMs: z.number().nullable(),
      retryAfterMs: z.number().nullable(),
      attemptCount: z.number(),
      lastFailure: z.string().nullable(),
      updatedAtMs: z.number(),
    })
    .optional(),
  stageOneOutputs: z.array(
    z.object({
      sessionId: z.string(),
      sourceUpdatedAtMs: z.number(),
      selectedForConsolidation: z.boolean(),
      selectedSourceUpdatedAtMs: z.number().optional(),
      usageCount: z.number(),
      lastUsageMs: z.number().optional(),
      updatedAtMs: z.number(),
      outputPath: z.string(),
      candidateCount: z.number(),
      hasRawMemory: z.boolean(),
      extractionModel: z
        .object({
          providerID: z.string(),
          modelID: z.string(),
        })
        .optional(),
      extractionUsage: z
        .object({
          cost: z.number(),
          tokens: z.object({
            total: z.number().optional(),
            input: z.number(),
            output: z.number(),
            reasoning: z.number(),
            cache: z.object({
              read: z.number(),
              write: z.number(),
            }),
          }),
        })
        .optional(),
    }),
  ),
  inputWatermarkMs: z.number(),
  budget: z.object({
    todayCount: z.number(),
    totalCount: z.number(),
  }),
})

const learnerMemoryArtifactSchema = z.object({
  key: z.string(),
  label: z.string(),
  path: z.string(),
  exists: z.boolean(),
  content: z.string().optional(),
})

const learnerMemoryArtifactsResponseSchema = z.object({
  artifacts: z.array(learnerMemoryArtifactSchema),
  rolloutSummaries: z.array(learnerMemoryArtifactSchema),
})

const learnerMemoryStartupSessionResultSchema = z.object({
  sessionID: z.string(),
  title: z.string().optional(),
  updatedAtMs: z.number(),
  extraction: learnerMemorySessionExtractResponseSchema.optional(),
  error: z.string().optional(),
})

const learnerMemoryStartupResultSchema = z.object({
  scanned: z.number().int().nonnegative(),
  eligible: z.number().int().nonnegative(),
  attempted: z.number().int().nonnegative(),
  skippedReason: z.string().optional(),
  sessions: z.array(learnerMemoryStartupSessionResultSchema),
})

const learnerMemoryLabRunResponseSchema = z.object({
  runID: z.string().min(1),
  memoryRoot: z.string().min(1),
  ranAt: z.string().datetime(),
  deterministicReport: EvaluationReportSchema.optional(),
  modelReport: EvaluationReportSchema.optional(),
  startupPipeline: learnerMemoryStartupResultSchema.optional(),
  sessionExtraction: learnerMemorySessionExtractResponseSchema.optional(),
  searchResults: z
    .array(
      z.object({
        memory: LearnerMemorySchema,
        score: z.number(),
        reasons: z.array(z.string()),
      }),
    )
    .optional(),
})

const learnerMemoryLabStepTraceSchema = z.object({
  key: z.enum([
    "currentSessionExtraction",
    "startupSweep",
    "deterministicHarness",
    "modelHarness",
    "searchProbe",
  ]),
  label: z.string().min(1),
  status: z.enum(["pending", "running", "completed", "skipped", "failed"]),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  summary: z.string().optional(),
})

const learnerMemoryLabTraceEventSchema = z.object({
  id: z.string().min(1),
  at: z.string().datetime(),
  level: z.enum(["info", "warn", "error"]),
  step: learnerMemoryLabStepTraceSchema.shape.key.optional(),
  sessionID: z.string().min(1).optional(),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
})

const learnerMemoryLabSessionTraceSchema = z.object({
  scope: z.enum(["current_session", "startup_sweep"]),
  sessionID: z.string().min(1),
  title: z.string().optional(),
  updatedAtMs: z.number().optional(),
  status: z.enum(["pending", "running", "completed", "skipped", "failed"]),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  candidateCount: z.number().int().nonnegative().optional(),
  approvedCount: z.number().int().nonnegative().optional(),
  skippedReason: z.string().optional(),
  error: z.string().optional(),
  decision: learnerMemorySessionExtractResponseSchema.shape.decision.optional(),
})

const learnerMemoryLabProgressSchema = z.object({
  totalSteps: z.number().int().nonnegative(),
  completedSteps: z.number().int().nonnegative(),
  totalSessions: z.number().int().nonnegative(),
  completedSessions: z.number().int().nonnegative(),
  runningSessions: z.number().int().nonnegative(),
  skippedSessions: z.number().int().nonnegative(),
  failedSessions: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
})

const learnerMemoryLabStatusResponseSchema = z.object({
  runID: z.string().min(1),
  directory: z.string().min(1),
  memoryRoot: z.string().min(1),
  statusPath: z.string().min(1),
  tracePath: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  status: z.enum(["running", "completed", "failed"]),
  selection: learnerMemoryLabSelectionSchema,
  settingsOverride: learnerMemoryLabSettingsSchema,
  sessionID: z.string().min(1).optional(),
  probeQuery: z.string().optional(),
  steps: z.array(learnerMemoryLabStepTraceSchema),
  progress: learnerMemoryLabProgressSchema,
  trace: z.array(learnerMemoryLabTraceEventSchema),
  sessions: z.array(learnerMemoryLabSessionTraceSchema),
  result: learnerMemoryLabRunResponseSchema.optional(),
  error: z.string().optional(),
})

async function readTextArtifact(input: {
  key: string
  label: string
  filePath: string
}): Promise<z.infer<typeof learnerMemoryArtifactSchema>> {
  const content = await fs.readFile(input.filePath, "utf8").catch(() => undefined)
  return {
    key: input.key,
    label: input.label,
    path: input.filePath,
    exists: content !== undefined,
    ...(content !== undefined ? { content } : {}),
  }
}

export const LearnerRoutes = new Hono()
  .use("*", async (c, next) => {
    const config = await Config.getGlobal()
    if (!experimentalFeatureIsEnabled(config, EXPERIMENTAL_FEATURE_ID.learnerMemory)) {
      return c.json({ error: "Memory is an experimental feature that is not enabled" }, 403)
    }
    await next()
  })
  .get(
    "/memory/digest",
    describeRoute({
      operationId: "learner.memory.digest",
      summary: "Read the current learner-context digest",
      responses: {
        200: {
          description: "Current learner-context digest",
          content: { "application/json": { schema: resolver(learnerMemoryDigestResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const snapshot = await buildLearnerRuntimeSnapshot(context.directory)
        const digest = buildLearnerContextView(snapshot)
        return c.json({
          fingerprint: digest.fingerprint,
          itemCount: digest.items.length,
        })
      }),
  )
  .post(
    "/memory/evaluation/run",
    describeRoute({
      operationId: "learner.memory.evaluation.run",
      summary: "Run the learner memory evaluation harness",
      responses: {
        200: {
          description: "Learner memory evaluation report",
          content: { "application/json": { schema: resolver(EvaluationReportSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", learnerMemoryEvaluationQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const query = c.req.valid("query")
        const report = await runLearnerMemoryEvaluation({
          directory: context.directory,
          extractionMode: query.extractionMode,
        })
        return c.json(report)
      }),
  )
  .get(
    "/memory/settings",
    describeRoute({
      operationId: "learner.memory.settings",
      summary: "Read effective learner memory settings",
      responses: {
        200: {
          description: "Effective learner memory settings",
          content: {
            "application/json": { schema: resolver(learnerMemorySettingsResponseSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const settings = readLearnerMemorySettings(await readProjectConfig(context.directory))
        return c.json(settings)
      }),
  )
  .post(
    "/memory/lab/start",
    describeRoute({
      operationId: "learner.memory.lab.start",
      summary: "Start learner-memory test lab in isolated storage",
      responses: {
        200: {
          description: "Started learner memory lab run",
          content: {
            "application/json": { schema: resolver(learnerMemoryLabStatusResponseSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", learnerMemoryLabRunBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const body = c.req.valid("json")
        const result = await startLearnerMemoryLabRun({
          directory: context.directory,
          sessionID: body.sessionID,
          probeQuery: body.probeQuery,
          selection: body.selection,
          settingsOverride: body.settings,
        })
        return c.json(result)
      }),
  )
  .get(
    "/memory/lab/status",
    describeRoute({
      operationId: "learner.memory.lab.status",
      summary: "Read learner-memory test lab run status and trace",
      responses: {
        200: {
          description: "Learner memory lab run status",
          content: {
            "application/json": { schema: resolver(learnerMemoryLabStatusResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", learnerMemoryLabStatusQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const query = c.req.valid("query")
        const result = getLearnerMemoryLabRunState(query.runID)
        if (!result || result.directory !== context.directory) {
          return c.json({ message: "Memory lab run not found." }, 404)
        }
        return c.json(result)
      }),
  )
  .post(
    "/memory/lab/run",
    describeRoute({
      operationId: "learner.memory.lab.run",
      summary: "Run learner-memory test lab in isolated storage",
      responses: {
        200: {
          description: "Isolated learner memory lab run result",
          content: { "application/json": { schema: resolver(learnerMemoryLabRunResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", learnerMemoryLabRunBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const body = c.req.valid("json")
        const result = await runLearnerMemoryLab({
          directory: context.directory,
          sessionID: body.sessionID,
          probeQuery: body.probeQuery,
          selection: body.selection,
          settingsOverride: body.settings,
        })
        return c.json(result)
      }),
  )
  .get(
    "/memory/pipeline/diagnostics",
    describeRoute({
      operationId: "learner.memory.pipeline.diagnostics",
      summary: "Read learner memory pipeline diagnostics",
      responses: {
        200: {
          description: "Learner memory pipeline diagnostics",
          content: {
            "application/json": {
              schema: resolver(learnerMemoryPipelineDiagnosticsResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        c.json(await getLearnerMemoryPipelineDiagnostics(context.directory)),
      ),
  )
  .get(
    "/memory/artifacts",
    describeRoute({
      operationId: "learner.memory.artifacts",
      summary: "Read learner memory artifact files for diagnostics",
      responses: {
        200: {
          description: "Learner memory artifacts",
          content: {
            "application/json": { schema: resolver(learnerMemoryArtifactsResponseSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const rolloutDirectory = LearnerMemoryPath.rolloutSummariesDirectory(context.directory)
        const rolloutEntries = await fs
          .readdir(rolloutDirectory, { withFileTypes: true })
          .catch(() => [])
        const rolloutSummaryPaths = rolloutEntries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
          .map((entry) => path.join(rolloutDirectory, entry.name))
          .toSorted()
          .slice(0, 8)
        return c.json({
          artifacts: await Promise.all([
            readTextArtifact({
              key: "raw_memories",
              label: "Raw Memories",
              filePath: LearnerMemoryPath.rawMemoriesFile(context.directory),
            }),
            readTextArtifact({
              key: "memory_registry",
              label: "Consolidated Registry",
              filePath: LearnerMemoryPath.memoryRegistryFile(context.directory),
            }),
            readTextArtifact({
              key: "summary",
              label: "Consolidated Summary",
              filePath: LearnerMemoryPath.summaryFile(context.directory),
            }),
            readTextArtifact({
              key: "working_memory",
              label: "Working Memory",
              filePath: LearnerMemoryPath.workingMemoryFile(context.directory),
            }),
            readTextArtifact({
              key: "working_summary",
              label: "Working Summary",
              filePath: LearnerMemoryPath.workingSummaryFile(context.directory),
            }),
          ]),
          rolloutSummaries: await Promise.all(
            rolloutSummaryPaths.map((filePath) =>
              readTextArtifact({
                key: path.basename(filePath),
                label: path.basename(filePath),
                filePath,
              }),
            ),
          ),
        })
      }),
  )
  .post(
    "/memory/session/extract",
    describeRoute({
      operationId: "learner.memory.session.extract",
      summary: "Extract learner memory candidates from a real Buddy session",
      responses: {
        200: {
          description: "Session learner memory extraction result",
          content: {
            "application/json": { schema: resolver(learnerMemorySessionExtractResponseSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", learnerMemorySessionExtractBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const body = c.req.valid("json")
        const result = await extractLearnerMemoryFromSession({
          directory: context.directory,
          sessionID: body.sessionID,
          force: body.force,
        })
        return c.json(result)
      }),
  )
  .get(
    "/memory",
    describeRoute({
      operationId: "learner.memory.list",
      summary: "List learner memory records",
      responses: {
        200: {
          description: "Learner memory records",
          content: { "application/json": { schema: resolver(learnerMemoryListResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const memories = await listLearnerMemories(context.directory)
        return c.json({ memories })
      }),
  )
  .get(
    "/memory/:memoryId/sources",
    describeRoute({
      operationId: "learner.memory.sources",
      summary: "List source pointers for a learner memory record",
      responses: {
        200: {
          description: "Learner memory source pointers",
          content: { "application/json": { schema: resolver(learnerMemorySourcesResponseSchema) } },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", z.object({ memoryId: z.string().min(1) })),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const memory = await findLearnerMemory({
          directory: context.directory,
          memoryId: c.req.valid("param").memoryId,
        })
        if (!memory) {
          return c.json({ error: "Memory not found" }, 404)
        }
        const sources = await buildLearnerMemorySourcePointers({
          directory: context.directory,
          memory,
        })
        return c.json({ memoryId: memory.id, sources })
      }),
  )
  .get(
    "/memory/search",
    describeRoute({
      operationId: "learner.memory.search",
      summary: "Search learner memory records",
      responses: {
        200: {
          description: "Learner memory search results",
          content: { "application/json": { schema: resolver(learnerMemorySearchResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", learnerMemorySearchQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const query = c.req.valid("query")
        const results = await searchLearnerMemory({
          directory: context.directory,
          query: query.query,
          limit: query.limit,
          projectPath: query.projectPath ?? context.directory,
          recordUsage: true,
        })
        return c.json({ results })
      }),
  )
  .patch(
    "/memory/hide",
    describeRoute({
      operationId: "learner.memory.hide",
      summary: "Hide a learner memory record",
      responses: {
        200: {
          description: "Hidden learner memory",
          content: { "application/json": { schema: resolver(learnerMemoryHideResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", learnerMemoryHideBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const body = c.req.valid("json")
        const memory = await hideLearnerMemory({
          directory: context.directory,
          memoryId: body.memoryId,
          reason: body.reason,
        })
        await regenerateLearnerMemoryMarkdown(context.directory)
        return c.json(memory ? { memory } : {})
      }),
  )
  .patch(
    "/memory/reject",
    describeRoute({
      operationId: "learner.memory.reject",
      summary: "Reject an incorrect learner memory record",
      responses: {
        200: {
          description: "Rejected learner memory",
          content: { "application/json": { schema: resolver(learnerMemoryHideResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", learnerMemoryRejectBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const body = c.req.valid("json")
        const memory = await rejectLearnerMemory({
          directory: context.directory,
          memoryId: body.memoryId,
          reason: body.reason,
        })
        await regenerateLearnerMemoryMarkdown(context.directory)
        return c.json(memory ? { memory } : {})
      }),
  )
  .patch(
    "/memory/resolve",
    describeRoute({
      operationId: "learner.memory.resolve",
      summary: "Resolve a learner memory record",
      responses: {
        200: {
          description: "Resolved learner memory",
          content: { "application/json": { schema: resolver(learnerMemoryHideResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", learnerMemoryResolveBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const body = c.req.valid("json")
        const memory = await resolveLearnerMemory({
          directory: context.directory,
          memoryId: body.memoryId,
          reason: body.reason,
        })
        await regenerateLearnerMemoryMarkdown(context.directory)
        return c.json(memory ? { memory } : {})
      }),
  )
  .patch(
    "/memory/pin",
    describeRoute({
      operationId: "learner.memory.pin",
      summary: "Pin or unpin a learner memory record",
      responses: {
        200: {
          description: "Pinned learner memory",
          content: { "application/json": { schema: resolver(learnerMemoryHideResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", learnerMemoryPinBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const body = c.req.valid("json")
        const memory = await pinLearnerMemory({
          directory: context.directory,
          memoryId: body.memoryId,
          pinned: body.pinned,
          reason: body.reason,
        })
        await regenerateLearnerMemoryMarkdown(context.directory)
        return c.json(memory ? { memory } : {})
      }),
  )
  .patch(
    "/memory/edit",
    describeRoute({
      operationId: "learner.memory.edit",
      summary: "Edit a learner memory record",
      responses: {
        200: {
          description: "Edited learner memory",
          content: { "application/json": { schema: resolver(learnerMemoryHideResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", learnerMemoryEditBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const body = c.req.valid("json")
        const memory = await editLearnerMemory({
          directory: context.directory,
          memoryId: body.memoryId,
          ...(body.title ? { title: body.title } : {}),
          ...(body.body ? { body: body.body } : {}),
          ...(body.tags ? { tags: body.tags } : {}),
          ...(body.projectPath ? { projectPath: body.projectPath } : {}),
          reason: body.reason,
        })
        await regenerateLearnerMemoryMarkdown(context.directory)
        return c.json(memory ? { memory } : {})
      }),
  )
  .delete(
    "/memory",
    describeRoute({
      operationId: "learner.memory.delete",
      summary: "Delete a learner memory record",
      responses: {
        200: {
          description: "Delete result",
          content: { "application/json": { schema: resolver(learnerMemoryDeleteResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", learnerMemoryDeleteBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const body = c.req.valid("json")
        const deleted = await deleteLearnerMemory({
          directory: context.directory,
          memoryId: body.memoryId,
          reason: body.reason,
        })
        await regenerateLearnerMemoryMarkdown(context.directory)
        return c.json({ deleted })
      }),
  )
  .post(
    "/memory/index/rebuild",
    describeRoute({
      operationId: "learner.memory.index.rebuild",
      summary: "Rebuild the learner-memory SQLite index from canonical files",
      responses: {
        200: {
          description: "Rebuilt learner-memory index",
          content: {
            "application/json": { schema: resolver(learnerMemoryIndexRebuildResponseSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        c.json(await rebuildLearnerMemoryIndex(context.directory)),
      ),
  )
  .post(
    "/memory/maintenance/run",
    describeRoute({
      operationId: "learner.memory.maintenance.run",
      summary: "Run learner memory maintenance",
      responses: {
        200: {
          description: "Learner memory maintenance report",
          content: {
            "application/json": { schema: resolver(learnerMemoryMaintenanceResponseSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        c.json(await runLearnerMemoryMaintenance(context.directory)),
      ),
  )
  .post(
    "/memory/reset",
    describeRoute({
      operationId: "learner.memory.reset",
      summary: "Reset learner memory records",
      responses: {
        200: {
          description: "Reset result",
          content: { "application/json": { schema: resolver(learnerMemoryResetResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", learnerMemoryResetBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const body = c.req.valid("json")
        await resetLearnerMemory({
          directory: context.directory,
          reason: body.reason,
        })
        await regenerateLearnerMemoryMarkdown(context.directory)
        return c.json({ reset: true as const })
      }),
  )
