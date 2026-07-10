import { Database } from "#sqlite"
import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import z from "zod"
import { LearnerMemoryPath } from "./paths"
import { LearnerMemoryStageOneOutputSchema, type LearnerMemoryStageOneOutput } from "./types"
import { LEARNER_MEMORY_STAGE_ONE_TUNING, MILLISECONDS_PER_DAY } from "./tuning"

const PHASE_TWO_JOB_KEY = `${LEARNER_MEMORY_STAGE_ONE_TUNING.phaseTwoConsolidationJobKind}:${LEARNER_MEMORY_STAGE_ONE_TUNING.phaseTwoGlobalJobSuffix}`
const EMPTY_RAW_MEMORIES_BODY = "# Raw Learner Memories\n\nNo raw learner memories yet.\n"

const StageOneJobRowSchema = z.object({
  job_key: z.string(),
  ownership_token: z.string().nullable(),
  worker_id: z.string().nullable(),
  lease_expires_at_ms: z.number().nullable(),
  last_success_watermark_ms: z.number().nullable(),
  last_success_fingerprint: z.string().nullable(),
  last_success_message_count: z.number().nullable(),
  retry_after_ms: z.number().nullable(),
  attempt_count: z.number(),
  last_failure: z.string().nullable(),
  updated_at_ms: z.number(),
})

const StageOneOutputRowSchema = z.object({
  session_id: z.string(),
  job_key: z.string(),
  source_updated_at_ms: z.number(),
  output_path: z.string(),
  output_json: z.string().nullable(),
  selected_for_consolidation: z.number(),
  selected_source_updated_at_ms: z.number().nullable(),
  usage_count: z.number(),
  last_usage_ms: z.number().nullable(),
  updated_at_ms: z.number(),
})

const PipelineDiagnosticsJobSchema = z.object({
  jobKey: z.string(),
  workerId: z.string().nullable(),
  leaseExpiresAtMs: z.number().nullable(),
  lastSuccessWatermarkMs: z.number().nullable(),
  retryAfterMs: z.number().nullable(),
  attemptCount: z.number(),
  lastFailure: z.string().nullable(),
  updatedAtMs: z.number(),
})

const BudgetCountRowSchema = z.object({
  count: z.number(),
})

type StageOneClaim = {
  jobKey: string
  sessionID: string
  ownershipToken: string
  workerID: string
  sourceUpdatedAt: string
  sourceUpdatedAtMs: number
  sourceFingerprint: string
  sourceMessageCount: number
}

type StageOneClaimOutcome =
  | {
      claimed: true
      claim: StageOneClaim
    }
  | {
      claimed: false
      reason:
        | "stage_one_lease_active"
        | "stage_one_retry_backoff_active"
        | "stage_one_source_not_newer_than_watermark"
    }

type PhaseTwoClaim = {
  jobKey: string
  ownershipToken: string
  workerID: string
  inputWatermarkMs: number
}

type PhaseTwoClaimOutcome =
  | {
      claimed: true
      claim: PhaseTwoClaim
    }
  | {
      claimed: false
      reason:
        | "phase_two_not_dirty"
        | "phase_two_lease_active"
        | "phase_two_retry_backoff_active"
        | "phase_two_no_input"
    }

type StageOneWriteInput = {
  directory: string
  claim: StageOneClaim
  output: LearnerMemoryStageOneOutput
}

type ExtractionBudgetClaimOutcome =
  | { claimed: true; claimID: string }
  | {
      claimed: false
      reason: "session_extraction_budget_exhausted" | "daily_extraction_budget_exhausted"
    }

type StageOneOutputRecord = {
  sessionID: string
  jobKey: string
  sourceUpdatedAtMs: number
  outputPath: string
  selectedForConsolidation: boolean
  selectedSourceUpdatedAtMs?: number
  usageCount: number
  lastUsageMs?: number
  updatedAtMs: number
  output: LearnerMemoryStageOneOutput
}

type StageOneSelectionDiff = {
  addedSessionIds: string[]
  retainedSessionIds: string[]
  removedSessionIds: string[]
}

type StageOneSelection = {
  outputs: LearnerMemoryStageOneOutput[]
  diff: StageOneSelectionDiff
}

type PhaseTwoArtifactSyncResult = {
  rawMemoriesPath: string
  rolloutSummaryPaths: string[]
}

type LearnerMemoryPipelineDiagnostics = {
  memoryRoot: string
  stageOneJobs: Array<z.infer<typeof PipelineDiagnosticsJobSchema>>
  phaseTwoJob?: z.infer<typeof PipelineDiagnosticsJobSchema>
  stageOneOutputs: Array<{
    sessionId: string
    sourceUpdatedAtMs: number
    selectedForConsolidation: boolean
    selectedSourceUpdatedAtMs?: number
    usageCount: number
    lastUsageMs?: number
    updatedAtMs: number
    outputPath: string
    candidateCount: number
    hasRawMemory: boolean
    extractionModel?: {
      providerID: string
      modelID: string
    }
    extractionUsage?: LearnerMemoryStageOneOutput["extractionUsage"]
  }>
  inputWatermarkMs: number
  budget: {
    todayCount: number
    totalCount: number
  }
}

function stageOneJobKey(sessionID: string): string {
  return `${LEARNER_MEMORY_STAGE_ONE_TUNING.stageOneExtractionJobKind}:${sessionID}`
}

function safeArtifactId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "_")
}

function dateToMs(value: string): number {
  return new Date(value).getTime()
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values))
}

async function ensureStageOneLayout(directory: string): Promise<void> {
  await Promise.all([
    fs.mkdir(LearnerMemoryPath.stageOneOutputsDirectory(directory), { recursive: true }),
    fs.mkdir(LearnerMemoryPath.rolloutSummariesDirectory(directory), { recursive: true }),
    fs.mkdir(path.dirname(LearnerMemoryPath.jobLedgerFile(directory)), { recursive: true }),
  ])
}

function openJobLedger(directory: string): Database {
  const db = new Database(LearnerMemoryPath.jobLedgerFile(directory), { create: true })
  db.exec(`PRAGMA busy_timeout = ${LEARNER_MEMORY_STAGE_ONE_TUNING.jobLedgerBusyTimeoutMs}`)
  db.exec(`
CREATE TABLE IF NOT EXISTS stage_one_jobs (
  job_key TEXT PRIMARY KEY,
  ownership_token TEXT,
  worker_id TEXT,
  lease_expires_at_ms INTEGER,
  last_success_watermark_ms INTEGER,
  last_success_fingerprint TEXT,
  last_success_message_count INTEGER,
  retry_after_ms INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_failure TEXT,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stage_one_outputs (
  session_id TEXT PRIMARY KEY,
  job_key TEXT NOT NULL,
  source_updated_at_ms INTEGER NOT NULL,
  output_path TEXT NOT NULL,
  output_json TEXT,
  selected_for_consolidation INTEGER NOT NULL DEFAULT 0,
  selected_source_updated_at_ms INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_usage_ms INTEGER,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stage_one_outputs_updated_at
ON stage_one_outputs(source_updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS extraction_budget_claims (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_extraction_budget_claims_session
ON extraction_budget_claims(session_id);

CREATE INDEX IF NOT EXISTS idx_extraction_budget_claims_day
ON extraction_budget_claims(day_key);
`)
  ensureColumn(db, "stage_one_jobs", "last_success_fingerprint", "TEXT")
  ensureColumn(db, "stage_one_jobs", "last_success_message_count", "INTEGER")
  ensureColumn(db, "stage_one_outputs", "selected_source_updated_at_ms", "INTEGER")
  ensureColumn(db, "stage_one_outputs", "output_json", "TEXT")
  return db
}

function ensureColumn(
  db: Database,
  tableName: string,
  columnName: string,
  columnType: string,
): void {
  const rows = z
    .array(z.object({ name: z.string() }))
    .parse(db.prepare(`PRAGMA table_info(${tableName})`).all())
  if (rows.some((row) => row.name === columnName)) return
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`)
}

function readStageOneJob(db: Database, jobKey: string) {
  return StageOneJobRowSchema.nullable().parse(
    db
      .prepare(
        `SELECT job_key,
                ownership_token,
                worker_id,
                lease_expires_at_ms,
                last_success_watermark_ms,
                last_success_fingerprint,
                last_success_message_count,
                retry_after_ms,
                attempt_count,
                last_failure,
                updated_at_ms
           FROM stage_one_jobs
          WHERE job_key = ?`,
      )
      .get(jobKey),
  )
}

async function tryClaimLearnerMemoryStageOneJob(input: {
  directory: string
  sessionID: string
  workerID: string
  sourceUpdatedAt: string
  sourceFingerprint: string
  sourceMessageCount: number
  force?: boolean
}): Promise<StageOneClaimOutcome> {
  await ensureStageOneLayout(input.directory)
  const db = openJobLedger(input.directory)
  const jobKey = stageOneJobKey(input.sessionID)
  const sourceUpdatedAtMs = dateToMs(input.sourceUpdatedAt)
  const now = Date.now()

  try {
    db.exec("BEGIN IMMEDIATE")
    const existing = readStageOneJob(db, jobKey)
    if (existing?.lease_expires_at_ms && existing.lease_expires_at_ms > now) {
      db.exec("ROLLBACK")
      return { claimed: false, reason: "stage_one_lease_active" }
    }
    if (!input.force && existing?.retry_after_ms && existing.retry_after_ms > now) {
      db.exec("ROLLBACK")
      return { claimed: false, reason: "stage_one_retry_backoff_active" }
    }
    if (
      !input.force &&
      existing?.last_success_watermark_ms &&
      existing.last_success_watermark_ms >= sourceUpdatedAtMs &&
      existing.last_success_fingerprint === input.sourceFingerprint &&
      existing.last_success_message_count === input.sourceMessageCount
    ) {
      db.exec("ROLLBACK")
      return { claimed: false, reason: "stage_one_source_not_newer_than_watermark" }
    }

    const ownershipToken = `lease_${ulid()}`
    db.prepare(
      `INSERT INTO stage_one_jobs (
          job_key,
          ownership_token,
          worker_id,
          lease_expires_at_ms,
          last_success_watermark_ms,
          last_success_fingerprint,
          last_success_message_count,
          retry_after_ms,
          attempt_count,
          last_failure,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, NULL, ?)
        ON CONFLICT(job_key) DO UPDATE SET
          ownership_token = excluded.ownership_token,
          worker_id = excluded.worker_id,
          lease_expires_at_ms = excluded.lease_expires_at_ms,
          retry_after_ms = NULL,
          attempt_count = stage_one_jobs.attempt_count + 1,
          last_failure = NULL,
          updated_at_ms = excluded.updated_at_ms`,
    ).run(
      jobKey,
      ownershipToken,
      input.workerID,
      now + LEARNER_MEMORY_STAGE_ONE_TUNING.stageOneJobLeaseMs,
      existing?.last_success_watermark_ms ?? null,
      existing?.last_success_fingerprint ?? null,
      existing?.last_success_message_count ?? null,
      now,
    )
    db.exec("COMMIT")

    return {
      claimed: true,
      claim: {
        jobKey,
        sessionID: input.sessionID,
        ownershipToken,
        workerID: input.workerID,
        sourceUpdatedAt: input.sourceUpdatedAt,
        sourceUpdatedAtMs,
        sourceFingerprint: input.sourceFingerprint,
        sourceMessageCount: input.sourceMessageCount,
      },
    }
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }
}

function stageOneOutputPath(directory: string, sessionID: string): string {
  return LearnerMemoryPath.stageOneOutputFile(directory, safeArtifactId(sessionID))
}

function stageOneOutputDbUri(sessionID: string): string {
  return `${LEARNER_MEMORY_STAGE_ONE_TUNING.stageOneOutputDbUriPrefix}${safeArtifactId(sessionID)}`
}

function isStageOneOutputDbUri(outputPath: string): boolean {
  return outputPath.startsWith(LEARNER_MEMORY_STAGE_ONE_TUNING.stageOneOutputDbUriPrefix)
}

async function writeRolloutSummaryArtifact(input: {
  directory: string
  output: LearnerMemoryStageOneOutput
}): Promise<string> {
  const summaryPath = LearnerMemoryPath.rolloutSummaryFile(
    input.directory,
    safeArtifactId(input.output.sessionId),
  )
  await fs.writeFile(
    summaryPath,
    [
      `session_id: ${input.output.sessionId}`,
      `updated_at: ${input.output.sourceUpdatedAt}`,
      `project_path: ${input.output.projectPath}`,
      `candidate_count: ${input.output.candidatePatches.length}`,
      "",
      input.output.rolloutSummary.trim() || "No memory summary.",
      "",
    ].join("\n"),
    "utf8",
  )
  return summaryPath
}

async function listLearnerMemoryStageOneOutputs(
  directory: string,
): Promise<LearnerMemoryStageOneOutput[]> {
  const records = await listLearnerMemoryStageOneOutputRecords(directory)
  if (records.length > 0) return records.map((record) => record.output)

  await ensureStageOneLayout(directory)
  const entries = await fs.readdir(LearnerMemoryPath.stageOneOutputsDirectory(directory), {
    withFileTypes: true,
  })
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith(LEARNER_MEMORY_STAGE_ONE_TUNING.jsonFileExtension),
    )
    .map((entry) => path.join(LearnerMemoryPath.stageOneOutputsDirectory(directory), entry.name))
    .toSorted()

  return Promise.all(
    files.map(async (filePath) => {
      const raw: unknown = JSON.parse(await fs.readFile(filePath, "utf8"))
      return LearnerMemoryStageOneOutputSchema.parse(raw)
    }),
  )
}

async function readStageOneOutputFromRow(
  row: z.infer<typeof StageOneOutputRowSchema>,
): Promise<LearnerMemoryStageOneOutput> {
  const raw: unknown =
    row.output_json === null
      ? JSON.parse(await fs.readFile(row.output_path, "utf8"))
      : JSON.parse(row.output_json)
  return LearnerMemoryStageOneOutputSchema.parse(raw)
}

async function listLearnerMemoryStageOneOutputRecords(
  directory: string,
): Promise<StageOneOutputRecord[]> {
  await ensureStageOneLayout(directory)
  const db = openJobLedger(directory)
  const rows = z.array(StageOneOutputRowSchema).parse(
    db
      .prepare(
        `SELECT session_id,
                job_key,
                source_updated_at_ms,
                output_path,
                output_json,
                selected_for_consolidation,
                selected_source_updated_at_ms,
                usage_count,
                last_usage_ms,
                updated_at_ms
           FROM stage_one_outputs
          ORDER BY usage_count DESC,
                   COALESCE(last_usage_ms, source_updated_at_ms) DESC,
                   source_updated_at_ms DESC`,
      )
      .all(),
  )
  db.close()

  return Promise.all(
    rows.map(async (row) => {
      const output = await readStageOneOutputFromRow(row)
      const record: StageOneOutputRecord = {
        sessionID: row.session_id,
        jobKey: row.job_key,
        sourceUpdatedAtMs: row.source_updated_at_ms,
        outputPath: row.output_path,
        selectedForConsolidation: row.selected_for_consolidation === 1,
        usageCount: row.usage_count,
        updatedAtMs: row.updated_at_ms,
        output,
      }

      if (row.selected_source_updated_at_ms !== null) {
        record.selectedSourceUpdatedAtMs = row.selected_source_updated_at_ms
      }

      if (row.last_usage_ms !== null) {
        record.lastUsageMs = row.last_usage_ms
      }

      return record
    }),
  )
}

async function releaseLearnerMemoryStageOneJobSkipped(input: {
  directory: string
  claim: StageOneClaim
}): Promise<void> {
  await ensureStageOneLayout(input.directory)
  const db = openJobLedger(input.directory)
  const now = Date.now()
  try {
    db.exec("BEGIN IMMEDIATE")
    db.prepare(
      `UPDATE stage_one_jobs
          SET ownership_token = NULL,
              worker_id = NULL,
              lease_expires_at_ms = NULL,
              updated_at_ms = ?
        WHERE job_key = ?
          AND ownership_token = ?`,
    ).run(now, input.claim.jobKey, input.claim.ownershipToken)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }
}

function extractionBudgetDayKey(value: Date): string {
  return value.toISOString().slice(0, LEARNER_MEMORY_STAGE_ONE_TUNING.extractionBudgetDayKeyLength)
}

async function tryClaimLearnerMemoryExtractionBudget(input: {
  directory: string
  sessionID: string
  maxExtractionCallsPerSession: number
  maxExtractionCallsPerDay: number
}): Promise<ExtractionBudgetClaimOutcome> {
  await ensureStageOneLayout(input.directory)
  const db = openJobLedger(input.directory)
  const now = Date.now()
  const today = extractionBudgetDayKey(new Date(now))
  const claimID = `budget_${ulid()}`
  try {
    db.exec("BEGIN IMMEDIATE")
    const sessionCount = z
      .object({ count: z.number() })
      .parse(
        db
          .prepare(`SELECT COUNT(*) AS count FROM extraction_budget_claims WHERE session_id = ?`)
          .get(input.sessionID),
      ).count
    if (sessionCount >= input.maxExtractionCallsPerSession) {
      db.exec("ROLLBACK")
      return { claimed: false, reason: "session_extraction_budget_exhausted" }
    }

    const dayCount = z
      .object({ count: z.number() })
      .parse(
        db
          .prepare(`SELECT COUNT(*) AS count FROM extraction_budget_claims WHERE day_key = ?`)
          .get(today),
      ).count
    if (dayCount >= input.maxExtractionCallsPerDay) {
      db.exec("ROLLBACK")
      return { claimed: false, reason: "daily_extraction_budget_exhausted" }
    }

    db.prepare(
      `INSERT INTO extraction_budget_claims (id, session_id, day_key, created_at_ms)
       VALUES (?, ?, ?, ?)`,
    ).run(claimID, input.sessionID, today, now)
    db.exec("COMMIT")
    return { claimed: true, claimID }
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }
}

async function syncLearnerMemoryPhaseTwoArtifacts(input: {
  directory: string
  outputs: readonly LearnerMemoryStageOneOutput[]
}): Promise<PhaseTwoArtifactSyncResult> {
  await ensureStageOneLayout(input.directory)
  const selectedArtifactNames = new Set(
    input.outputs.map(
      (output) =>
        `${safeArtifactId(output.sessionId)}${LEARNER_MEMORY_STAGE_ONE_TUNING.markdownFileExtension}`,
    ),
  )
  const existingRolloutSummaries = await fs.readdir(
    LearnerMemoryPath.rolloutSummariesDirectory(input.directory),
    { withFileTypes: true },
  )
  await Promise.all(
    existingRolloutSummaries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(LEARNER_MEMORY_STAGE_ONE_TUNING.markdownFileExtension) &&
          !selectedArtifactNames.has(entry.name),
      )
      .map((entry) =>
        fs.rm(path.join(LearnerMemoryPath.rolloutSummariesDirectory(input.directory), entry.name), {
          force: true,
        }),
      ),
  )

  if (input.outputs.length === 0) {
    await fs.writeFile(
      LearnerMemoryPath.rawMemoriesFile(input.directory),
      EMPTY_RAW_MEMORIES_BODY,
      "utf8",
    )
    return {
      rawMemoriesPath: LearnerMemoryPath.rawMemoriesFile(input.directory),
      rolloutSummaryPaths: [],
    }
  }

  const rolloutSummaryPaths = await Promise.all(
    input.outputs.map((output) =>
      writeRolloutSummaryArtifact({
        directory: input.directory,
        output,
      }),
    ),
  )
  const body = [
    "# Raw Learner Memories",
    "",
    "Merged selected stage-one memory outputs for phase-two consolidation.",
    "",
    ...input.outputs.flatMap((output) => [
      `## Session ${output.sessionId}`,
      "",
      `updated_at: ${output.sourceUpdatedAt}`,
      `project_path: ${output.projectPath}`,
      `rollout_summary_file: ${safeArtifactId(output.sessionId)}${LEARNER_MEMORY_STAGE_ONE_TUNING.markdownFileExtension}`,
      "",
      output.rawMemory.trim() || "No raw memory.",
      "",
    ]),
  ].join("\n")
  await fs.writeFile(LearnerMemoryPath.rawMemoriesFile(input.directory), body, "utf8")
  return {
    rawMemoriesPath: LearnerMemoryPath.rawMemoriesFile(input.directory),
    rolloutSummaryPaths,
  }
}

async function markLearnerMemoryStageOneJobSucceeded(input: StageOneWriteInput): Promise<void> {
  await ensureStageOneLayout(input.directory)
  const parsed = LearnerMemoryStageOneOutputSchema.parse(input.output)
  const outputPath = stageOneOutputDbUri(input.claim.sessionID)
  const outputJson = JSON.stringify(parsed)
  await fs.rm(stageOneOutputPath(input.directory, input.claim.sessionID), { force: true })

  const db = openJobLedger(input.directory)
  const now = Date.now()
  try {
    db.exec("BEGIN IMMEDIATE")
    db.prepare(
      `UPDATE stage_one_jobs
          SET ownership_token = NULL,
              worker_id = NULL,
              lease_expires_at_ms = NULL,
              last_success_watermark_ms = ?,
              last_success_fingerprint = ?,
              last_success_message_count = ?,
              retry_after_ms = NULL,
              last_failure = NULL,
              updated_at_ms = ?
        WHERE job_key = ?
          AND ownership_token = ?`,
    ).run(
      input.claim.sourceUpdatedAtMs,
      input.claim.sourceFingerprint,
      input.claim.sourceMessageCount,
      now,
      input.claim.jobKey,
      input.claim.ownershipToken,
    )
    db.prepare(
      `INSERT INTO stage_one_outputs (
          session_id,
          job_key,
          source_updated_at_ms,
          output_path,
          output_json,
          selected_for_consolidation,
          selected_source_updated_at_ms,
          usage_count,
          last_usage_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, 0, NULL, 0, NULL, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          source_updated_at_ms = excluded.source_updated_at_ms,
          output_path = excluded.output_path,
          output_json = excluded.output_json,
          updated_at_ms = excluded.updated_at_ms
        WHERE excluded.source_updated_at_ms >= stage_one_outputs.source_updated_at_ms`,
    ).run(
      input.claim.sessionID,
      input.claim.jobKey,
      input.claim.sourceUpdatedAtMs,
      outputPath,
      outputJson,
      now,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }
}

async function markLearnerMemoryStageOneJobSucceededNoOutput(input: {
  directory: string
  claim: StageOneClaim
}): Promise<void> {
  await ensureStageOneLayout(input.directory)
  await fs.rm(stageOneOutputPath(input.directory, input.claim.sessionID), { force: true })
  await fs.rm(
    LearnerMemoryPath.rolloutSummaryFile(input.directory, safeArtifactId(input.claim.sessionID)),
    {
      force: true,
    },
  )

  const db = openJobLedger(input.directory)
  const now = Date.now()
  try {
    db.exec("BEGIN IMMEDIATE")
    db.prepare(
      `UPDATE stage_one_jobs
          SET ownership_token = NULL,
              worker_id = NULL,
              lease_expires_at_ms = NULL,
              last_success_watermark_ms = ?,
              last_success_fingerprint = ?,
              last_success_message_count = ?,
              retry_after_ms = NULL,
              last_failure = NULL,
              updated_at_ms = ?
        WHERE job_key = ?
          AND ownership_token = ?`,
    ).run(
      input.claim.sourceUpdatedAtMs,
      input.claim.sourceFingerprint,
      input.claim.sourceMessageCount,
      now,
      input.claim.jobKey,
      input.claim.ownershipToken,
    )
    db.prepare("DELETE FROM stage_one_outputs WHERE session_id = ?").run(input.claim.sessionID)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }
}

async function markLearnerMemoryStageOneJobFailed(input: {
  directory: string
  claim: StageOneClaim
  error: unknown
}): Promise<void> {
  await ensureStageOneLayout(input.directory)
  const db = openJobLedger(input.directory)
  const now = Date.now()
  const message = input.error instanceof Error ? input.error.message : String(input.error)
  try {
    db.exec("BEGIN IMMEDIATE")
    db.prepare(
      `UPDATE stage_one_jobs
          SET ownership_token = NULL,
              worker_id = NULL,
              lease_expires_at_ms = NULL,
              retry_after_ms = ?,
              last_failure = ?,
              updated_at_ms = ?
        WHERE job_key = ?
          AND ownership_token = ?`,
    ).run(
      now + LEARNER_MEMORY_STAGE_ONE_TUNING.stageOneJobRetryDelayMs,
      message,
      now,
      input.claim.jobKey,
      input.claim.ownershipToken,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }
}

async function getLearnerMemoryStageOneInputWatermark(directory: string): Promise<number> {
  await ensureStageOneLayout(directory)
  const db = openJobLedger(directory)
  try {
    const row = z.object({ input_watermark_ms: z.number().nullable() }).parse(
      db
        .prepare(
          `SELECT MAX(source_updated_at_ms) AS input_watermark_ms
               FROM stage_one_outputs`,
        )
        .get(),
    )
    return row.input_watermark_ms ?? 0
  } finally {
    db.close()
  }
}

function nonEmptyStageOneOutput(output: LearnerMemoryStageOneOutput): boolean {
  return (
    output.candidatePatches.length > 0 ||
    output.rawMemory.trim().length > 0 ||
    output.rolloutSummary.trim().length > 0
  )
}

async function selectLearnerMemoryStageOneOutputsForConsolidation(input: {
  directory: string
  limit: number
}): Promise<StageOneSelection> {
  const records = (await listLearnerMemoryStageOneOutputRecords(input.directory)).filter((record) =>
    nonEmptyStageOneOutput(record.output),
  )
  const selectedRecords = records.slice(0, input.limit)
  const selectedSessionIds = new Set(selectedRecords.map((record) => record.sessionID))

  return {
    outputs: selectedRecords.map((record) => record.output),
    diff: {
      addedSessionIds: selectedRecords
        .filter(
          (record) =>
            !record.selectedForConsolidation ||
            record.selectedSourceUpdatedAtMs !== record.sourceUpdatedAtMs,
        )
        .map((record) => record.sessionID),
      retainedSessionIds: selectedRecords
        .filter(
          (record) =>
            record.selectedForConsolidation &&
            record.selectedSourceUpdatedAtMs === record.sourceUpdatedAtMs,
        )
        .map((record) => record.sessionID),
      removedSessionIds: records
        .filter(
          (record) => record.selectedForConsolidation && !selectedSessionIds.has(record.sessionID),
        )
        .map((record) => record.sessionID),
    },
  }
}

async function pruneLearnerMemoryStageOneOutputs(input: {
  directory: string
  maxUnusedDays: number
}): Promise<string[]> {
  await ensureStageOneLayout(input.directory)
  const records = await listLearnerMemoryStageOneOutputRecords(input.directory)
  const cutoffMs = Date.now() - input.maxUnusedDays * MILLISECONDS_PER_DAY
  const pruned = records.filter(
    (record) => !record.selectedForConsolidation && record.updatedAtMs < cutoffMs,
  )
  if (pruned.length === 0) return []

  const db = openJobLedger(input.directory)
  try {
    db.exec("BEGIN IMMEDIATE")
    const remove = db.prepare("DELETE FROM stage_one_outputs WHERE session_id = ?")
    for (const record of pruned) {
      remove.run(record.sessionID)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }

  await Promise.all(pruned.map((record) => removeStageOneOutputArtifacts(input.directory, record)))
  return pruned.map((record) => record.sessionID)
}

async function removeStageOneOutputArtifacts(
  directory: string,
  record: Pick<StageOneOutputRecord, "sessionID" | "outputPath">,
): Promise<void> {
  const outputArtifacts = isStageOneOutputDbUri(record.outputPath)
    ? [stageOneOutputPath(directory, record.sessionID)]
    : uniqueStrings([record.outputPath, stageOneOutputPath(directory, record.sessionID)])
  await Promise.all([
    ...outputArtifacts.map((artifactPath) => fs.rm(artifactPath, { force: true })),
    fs.rm(LearnerMemoryPath.rolloutSummaryFile(directory, safeArtifactId(record.sessionID)), {
      force: true,
    }),
  ])
}

function diagnosticsJobFromRow(row: z.infer<typeof StageOneJobRowSchema>) {
  return PipelineDiagnosticsJobSchema.parse({
    jobKey: row.job_key,
    workerId: row.worker_id,
    leaseExpiresAtMs: row.lease_expires_at_ms,
    lastSuccessWatermarkMs: row.last_success_watermark_ms,
    retryAfterMs: row.retry_after_ms,
    attemptCount: row.attempt_count,
    lastFailure: row.last_failure,
    updatedAtMs: row.updated_at_ms,
  })
}

async function getLearnerMemoryPipelineDiagnostics(
  directory: string,
): Promise<LearnerMemoryPipelineDiagnostics> {
  await ensureStageOneLayout(directory)
  const db = openJobLedger(directory)
  let jobRows: z.infer<typeof StageOneJobRowSchema>[] = []
  let todayCount = 0
  let totalCount = 0
  try {
    jobRows = z.array(StageOneJobRowSchema).parse(
      db
        .prepare(
          `SELECT job_key,
                  ownership_token,
                  worker_id,
                  lease_expires_at_ms,
                  last_success_watermark_ms,
                  last_success_fingerprint,
                  last_success_message_count,
                  retry_after_ms,
                  attempt_count,
                  last_failure,
                  updated_at_ms
             FROM stage_one_jobs
            ORDER BY updated_at_ms DESC`,
        )
        .all(),
    )
    const today = extractionBudgetDayKey(new Date())
    todayCount = BudgetCountRowSchema.parse(
      db
        .prepare(`SELECT COUNT(*) AS count FROM extraction_budget_claims WHERE day_key = ?`)
        .get(today),
    ).count
    totalCount = BudgetCountRowSchema.parse(
      db.prepare(`SELECT COUNT(*) AS count FROM extraction_budget_claims`).get(),
    ).count
  } finally {
    db.close()
  }

  const records = await listLearnerMemoryStageOneOutputRecords(directory)
  const phaseTwoRow = jobRows.find((row) => row.job_key === PHASE_TWO_JOB_KEY)
  return {
    memoryRoot: LearnerMemoryPath.root(directory),
    stageOneJobs: jobRows
      .filter((row) => row.job_key !== PHASE_TWO_JOB_KEY)
      .map(diagnosticsJobFromRow),
    ...(phaseTwoRow ? { phaseTwoJob: diagnosticsJobFromRow(phaseTwoRow) } : {}),
    stageOneOutputs: records.map((record) => ({
      sessionId: record.sessionID,
      sourceUpdatedAtMs: record.sourceUpdatedAtMs,
      selectedForConsolidation: record.selectedForConsolidation,
      ...(record.selectedSourceUpdatedAtMs !== undefined
        ? { selectedSourceUpdatedAtMs: record.selectedSourceUpdatedAtMs }
        : {}),
      usageCount: record.usageCount,
      ...(record.lastUsageMs !== undefined ? { lastUsageMs: record.lastUsageMs } : {}),
      updatedAtMs: record.updatedAtMs,
      outputPath: record.outputPath,
      candidateCount: record.output.candidatePatches.length,
      hasRawMemory: record.output.rawMemory.trim().length > 0,
      ...(record.output.extractionModel ? { extractionModel: record.output.extractionModel } : {}),
      ...(record.output.extractionUsage ? { extractionUsage: record.output.extractionUsage } : {}),
    })),
    inputWatermarkMs: Math.max(0, ...records.map((record) => record.sourceUpdatedAtMs)),
    budget: {
      todayCount,
      totalCount,
    },
  }
}

async function tryClaimLearnerMemoryPhaseTwoJob(input: {
  directory: string
  workerID: string
  force?: boolean
}): Promise<PhaseTwoClaimOutcome> {
  await ensureStageOneLayout(input.directory)
  const inputWatermarkMs = await getLearnerMemoryStageOneInputWatermark(input.directory)
  if (inputWatermarkMs === 0) {
    return { claimed: false, reason: "phase_two_no_input" }
  }

  const db = openJobLedger(input.directory)
  const now = Date.now()
  try {
    db.exec("BEGIN IMMEDIATE")
    const existing = readStageOneJob(db, PHASE_TWO_JOB_KEY)
    if (existing?.lease_expires_at_ms && existing.lease_expires_at_ms > now) {
      db.exec("ROLLBACK")
      return { claimed: false, reason: "phase_two_lease_active" }
    }
    if (!input.force && existing?.retry_after_ms && existing.retry_after_ms > now) {
      db.exec("ROLLBACK")
      return { claimed: false, reason: "phase_two_retry_backoff_active" }
    }
    if (
      !input.force &&
      existing?.last_success_watermark_ms &&
      existing.last_success_watermark_ms >= inputWatermarkMs
    ) {
      db.exec("ROLLBACK")
      return { claimed: false, reason: "phase_two_not_dirty" }
    }

    const ownershipToken = `lease_${ulid()}`
    db.prepare(
      `INSERT INTO stage_one_jobs (
          job_key,
          ownership_token,
          worker_id,
          lease_expires_at_ms,
          last_success_watermark_ms,
          last_success_fingerprint,
          last_success_message_count,
          retry_after_ms,
          attempt_count,
          last_failure,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 1, NULL, ?)
        ON CONFLICT(job_key) DO UPDATE SET
          ownership_token = excluded.ownership_token,
          worker_id = excluded.worker_id,
          lease_expires_at_ms = excluded.lease_expires_at_ms,
          retry_after_ms = NULL,
          attempt_count = stage_one_jobs.attempt_count + 1,
          last_failure = NULL,
          updated_at_ms = excluded.updated_at_ms`,
    ).run(
      PHASE_TWO_JOB_KEY,
      ownershipToken,
      input.workerID,
      now + LEARNER_MEMORY_STAGE_ONE_TUNING.phaseTwoJobLeaseMs,
      existing?.last_success_watermark_ms ?? null,
      now,
    )
    db.exec("COMMIT")

    return {
      claimed: true,
      claim: {
        jobKey: PHASE_TWO_JOB_KEY,
        ownershipToken,
        workerID: input.workerID,
        inputWatermarkMs,
      },
    }
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }
}

async function markLearnerMemoryPhaseTwoJobSucceeded(input: {
  directory: string
  claim: PhaseTwoClaim
  selectedSessionIds: readonly string[]
}): Promise<void> {
  await ensureStageOneLayout(input.directory)
  const db = openJobLedger(input.directory)
  const now = Date.now()
  try {
    db.exec("BEGIN IMMEDIATE")
    db.prepare(
      `UPDATE stage_one_jobs
          SET ownership_token = NULL,
              worker_id = NULL,
              lease_expires_at_ms = NULL,
              last_success_watermark_ms = ?,
              retry_after_ms = NULL,
              last_failure = NULL,
              updated_at_ms = ?
        WHERE job_key = ?
          AND ownership_token = ?`,
    ).run(input.claim.inputWatermarkMs, now, input.claim.jobKey, input.claim.ownershipToken)

    db.prepare(
      `UPDATE stage_one_outputs
          SET selected_for_consolidation = 0,
              selected_source_updated_at_ms = NULL,
              updated_at_ms = ?`,
    ).run(now)

    const markSelected = db.prepare(
      `UPDATE stage_one_outputs
          SET selected_for_consolidation = 1,
              selected_source_updated_at_ms = source_updated_at_ms,
              updated_at_ms = ?
        WHERE session_id = ?`,
    )
    for (const sessionID of input.selectedSessionIds) {
      markSelected.run(now, sessionID)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }
}

async function heartbeatLearnerMemoryPhaseTwoJob(input: {
  directory: string
  claim: PhaseTwoClaim
}): Promise<boolean> {
  await ensureStageOneLayout(input.directory)
  const db = openJobLedger(input.directory)
  const now = Date.now()
  try {
    const result = db
      .prepare(
        `UPDATE stage_one_jobs
            SET lease_expires_at_ms = ?,
                updated_at_ms = ?
          WHERE job_key = ?
            AND ownership_token = ?`,
      )
      .run(
        now + LEARNER_MEMORY_STAGE_ONE_TUNING.phaseTwoHeartbeatLeaseMs,
        now,
        input.claim.jobKey,
        input.claim.ownershipToken,
      )
    return result.changes > 0
  } finally {
    db.close()
  }
}

async function recordLearnerMemoryStageOneUsage(input: {
  directory: string
  sessionID: string
}): Promise<void> {
  await ensureStageOneLayout(input.directory)
  const db = openJobLedger(input.directory)
  const now = Date.now()
  try {
    db.prepare(
      `UPDATE stage_one_outputs
          SET usage_count = usage_count + 1,
              last_usage_ms = ?,
              updated_at_ms = ?
        WHERE session_id = ?`,
    ).run(now, now, input.sessionID)
  } finally {
    db.close()
  }
}

async function recordLearnerMemoryStageOneUsageForCandidateIds(input: {
  directory: string
  candidateIds: readonly string[]
}): Promise<void> {
  const candidateIds = new Set(input.candidateIds)
  if (candidateIds.size === 0) return

  const records = await listLearnerMemoryStageOneOutputRecords(input.directory)
  const sessionIds = uniqueStrings(
    records
      .filter((record) =>
        record.output.candidatePatches.some((candidate) => candidateIds.has(candidate.id)),
      )
      .map((record) => record.sessionID),
  )
  await Promise.all(
    sessionIds.map((sessionID) =>
      recordLearnerMemoryStageOneUsage({
        directory: input.directory,
        sessionID,
      }),
    ),
  )
}

async function markLearnerMemoryPhaseTwoJobFailed(input: {
  directory: string
  claim: PhaseTwoClaim
  error: unknown
}): Promise<void> {
  await ensureStageOneLayout(input.directory)
  const db = openJobLedger(input.directory)
  const now = Date.now()
  const message = input.error instanceof Error ? input.error.message : String(input.error)
  try {
    db.exec("BEGIN IMMEDIATE")
    db.prepare(
      `UPDATE stage_one_jobs
          SET ownership_token = NULL,
              worker_id = NULL,
              lease_expires_at_ms = NULL,
              retry_after_ms = ?,
              last_failure = ?,
              updated_at_ms = ?
        WHERE job_key = ?
          AND ownership_token = ?`,
    ).run(
      now + LEARNER_MEMORY_STAGE_ONE_TUNING.phaseTwoJobRetryDelayMs,
      message,
      now,
      input.claim.jobKey,
      input.claim.ownershipToken,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }
}

export {
  getLearnerMemoryStageOneInputWatermark,
  getLearnerMemoryPipelineDiagnostics,
  heartbeatLearnerMemoryPhaseTwoJob,
  listLearnerMemoryStageOneOutputs,
  markLearnerMemoryStageOneJobFailed,
  markLearnerMemoryStageOneJobSucceeded,
  markLearnerMemoryStageOneJobSucceededNoOutput,
  recordLearnerMemoryStageOneUsage,
  recordLearnerMemoryStageOneUsageForCandidateIds,
  releaseLearnerMemoryStageOneJobSkipped,
  markLearnerMemoryPhaseTwoJobFailed,
  markLearnerMemoryPhaseTwoJobSucceeded,
  pruneLearnerMemoryStageOneOutputs,
  selectLearnerMemoryStageOneOutputsForConsolidation,
  syncLearnerMemoryPhaseTwoArtifacts,
  tryClaimLearnerMemoryPhaseTwoJob,
  tryClaimLearnerMemoryExtractionBudget,
  tryClaimLearnerMemoryStageOneJob,
}
export type {
  ExtractionBudgetClaimOutcome,
  LearnerMemoryPipelineDiagnostics,
  PhaseTwoClaim,
  PhaseTwoClaimOutcome,
  StageOneClaim,
  StageOneClaimOutcome,
  StageOneSelection,
  StageOneSelectionDiff,
  PhaseTwoArtifactSyncResult,
}
