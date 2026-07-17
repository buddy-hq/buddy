import path from "node:path"
import PREPARE_RESOURCE_DESCRIPTION from "./prepare-resource.md"
import z from "zod"
import { RESOURCE_PACK_STATUS_PREPARING } from "../../../../resource-packs"
import {
  addResource,
  getResourceByKey,
  resolveResourceSourcePath,
  ResourceValidationError,
  type ResourceRecord,
  type ResourceStatus,
} from "../../../../resources/resource-registry-service"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectResultSchema,
  formatBuddyObjectRefLines,
  objectSummaryBaseFromManifest,
  type BuddyObjectResult,
} from "../../../../objects"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import { authorizeFileReadPath } from "../../../runtime/external-file-authorization"

const PREPARE_RESOURCE_TOOL_ID = "prepare_resource" as const
const RESOURCE_PREPARATION_POLL_INTERVAL_MS = 500
const RESOURCE_PREPARATION_DEFAULT_MAX_WAIT_MS = 120_000
const RESOURCE_PREPARATION_MIN_MAX_WAIT_MS = RESOURCE_PREPARATION_POLL_INTERVAL_MS
const RESOURCE_PREPARATION_MAX_WAIT_MS = 600_000

const ResourcePrepareParameters = z.object({
  sourcePath: z
    .string()
    .min(1)
    .describe(
      "Absolute path or workspace-relative path to the source file to register and prepare.",
    ),
  alias: z
    .string()
    .min(1)
    .optional()
    .describe("Optional resource alias. When omitted, Buddy derives one from the source filename."),
  waitUntilReady: z
    .boolean()
    .default(true)
    .optional()
    .describe(
      "When true, waits for preparation to finish (status leaves `preparing`) before returning.",
    ),
  maxWaitMs: z
    .number()
    .int()
    .min(RESOURCE_PREPARATION_MIN_MAX_WAIT_MS)
    .max(RESOURCE_PREPARATION_MAX_WAIT_MS)
    .optional()
    .describe("Maximum wait duration in milliseconds when waitUntilReady is true."),
})

type ResourcePreparationResult = {
  resource: ResourceRecord
  timedOut: boolean
}

function resolveMaxWaitMs(value: number | undefined) {
  return value ?? RESOURCE_PREPARATION_DEFAULT_MAX_WAIT_MS
}

function formatWarnings(warnings: string[]) {
  if (warnings.length === 0) return "none"
  return warnings.join(" | ")
}

function resolveNextStep(input: { status: ResourceStatus; timedOut: boolean }) {
  if (input.status === "ready") return "resource_ready_use_alias_or_object_id_in_followup_tools"
  if (input.status === "preparing" && input.timedOut) {
    return "resource_still_preparing_wait_then_check_again"
  }
  if (input.status === "stale") return "resource_stale_run_prepare_resource_again_or_rebuild"
  if (input.status === "unsupported")
    return "resource_unsupported_use_supported_format_or_plain_text"
  if (input.status === "error") return "resource_failed_check_warnings_then_retry"
  return "resource_status_recorded"
}

function promptAbsolutePath(input: {
  directory: string
  pathText: string | null | undefined
}): string {
  const trimmed = input.pathText?.trim()
  if (!trimmed) return "none"
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(input.directory, trimmed)
}

function formatResourcePreparationOutput(input: {
  directory: string
  resource: ResourceRecord
  waitUntilReady: boolean
  timedOut: boolean
  maxWaitMs: number
  buddyObjectResult: BuddyObjectResult
}) {
  const primaryRef = input.buddyObjectResult.primaryRef
  return [
    input.buddyObjectResult.message,
    ...formatBuddyObjectRefLines(primaryRef),
    `alias=${input.resource.alias}`,
    `status=${input.resource.status}`,
    `format=${input.resource.format}`,
    `source_validity=${input.resource.sourceValidity}`,
    `extraction_status=${input.resource.extractionStatus}`,
    `managed_source=${promptAbsolutePath({
      directory: input.directory,
      pathText: input.resource.sourceRelpath,
    })}`,
    `bench_reader=${promptAbsolutePath({
      directory: input.directory,
      pathText: input.resource.readerPath,
    })}`,
    `pack=${promptAbsolutePath({
      directory: input.directory,
      pathText: input.resource.packPath,
    })}`,
    `full_text=${promptAbsolutePath({
      directory: input.directory,
      pathText: input.resource.fullTextPath,
    })}`,
    ...(input.resource.fullTextEstimatedTokens !== undefined
      ? [`full_text_est_tokens=${input.resource.fullTextEstimatedTokens}`]
      : []),
    ...(input.resource.fullTextCharacters !== undefined
      ? [`full_text_chars=${input.resource.fullTextCharacters}`]
      : []),
    `warnings=${formatWarnings(input.resource.warnings)}`,
    `prepared_at=${input.resource.preparedAt ?? "none"}`,
    `wait_until_ready=${input.waitUntilReady}`,
    `timed_out=${input.timedOut}`,
    `max_wait_ms=${input.maxWaitMs}`,
    `next_step=${resolveNextStep({ status: input.resource.status, timedOut: input.timedOut })}`,
  ].join("\n")
}

function buildPrepareResourceObjectResult(input: {
  resource: ResourceRecord
  timedOut: boolean
}): BuddyObjectResult {
  const ref = {
    kind: BUDDY_OBJECT_KINDS.resource,
    objectID: input.resource.objectID,
    revisionID: null,
    itemID: null,
  }
  const blocked =
    (input.resource.status === RESOURCE_PACK_STATUS_PREPARING && input.timedOut) ||
    input.resource.status === "unsupported" ||
    input.resource.status === "error"
  const status = blocked ? "blocked" : "ok"
  const reason = input.timedOut
    ? "resource_still_preparing"
    : input.resource.status === "unsupported"
      ? "resource_extraction_unsupported"
      : input.resource.status === "error"
        ? "resource_preparation_failed"
        : null
  return BuddyObjectResultSchema.parse({
    version: 1,
    status,
    reason,
    message: blocked
      ? `Resource ${input.resource.alias} could not be prepared.`
      : `Prepared resource ${input.resource.alias}.`,
    primaryRef: ref,
    objects: [
      objectSummaryBaseFromManifest({
        kind: BUDDY_OBJECT_KINDS.resource,
        objectID: input.resource.objectID,
        title: input.resource.title ?? input.resource.alias,
        status: input.resource.status,
        lifecycle: "imported",
        sourceRoot: input.resource.sourceRelpath,
      }),
    ],
    presentations: [],
  })
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function readPreparedResourceByID(
  directory: string,
  objectID: string,
): Promise<ResourceRecord> {
  const resource = await getResourceByKey(directory, objectID)
  if (!resource) {
    throw new Error(`Resource not found after registration: ${objectID}`)
  }
  return resource
}

async function waitForPreparedResource(input: {
  directory: string
  objectID: string
  maxWaitMs: number
  abort: AbortSignal
}): Promise<ResourcePreparationResult> {
  let current = await readPreparedResourceByID(input.directory, input.objectID)
  if (current.status !== RESOURCE_PACK_STATUS_PREPARING) {
    return {
      resource: current,
      timedOut: false,
    }
  }

  const deadlineMs = Date.now() + input.maxWaitMs
  while (Date.now() < deadlineMs) {
    input.abort.throwIfAborted()
    await sleep(RESOURCE_PREPARATION_POLL_INTERVAL_MS)
    input.abort.throwIfAborted()

    current = await readPreparedResourceByID(input.directory, input.objectID)
    if (current.status !== RESOURCE_PACK_STATUS_PREPARING) {
      return {
        resource: current,
        timedOut: false,
      }
    }
  }

  return {
    resource: current,
    timedOut: current.status === RESOURCE_PACK_STATUS_PREPARING,
  }
}

export const prepareResourceTool = createBuddyTool({
  id: PREPARE_RESOURCE_TOOL_ID,
  produces: {
    buddyObjectResult: true,
  },
  description: PREPARE_RESOURCE_DESCRIPTION,
  parameters: ResourcePrepareParameters,
  async execute(params, ctx) {
    const sourcePath = await authorizeFileReadPath(
      resolveResourceSourcePath(ctx.directory, params.sourcePath),
      ctx,
    )
    await ctx.ask({
      permission: PREPARE_RESOURCE_TOOL_ID,
      patterns: [sourcePath],
      always: [sourcePath],
      metadata: {
        alias: params.alias ?? null,
      },
    })

    let created: ResourceRecord
    try {
      created = await addResource({
        directory: ctx.directory,
        sourcePath,
        alias: params.alias,
      })
    } catch (error) {
      if (!(error instanceof ResourceValidationError)) throw error
      const buddyObjectResult = BuddyObjectResultSchema.parse({
        version: 1,
        status: "blocked",
        reason: "invalid_resource_source",
        message: `Resource source is invalid: ${error.message}`,
        primaryRef: null,
        objects: [],
        presentations: [],
      })
      return {
        title: PREPARE_RESOURCE_TOOL_ID,
        output: [
          buddyObjectResult.message,
          `source=${promptAbsolutePath({ directory: ctx.directory, pathText: params.sourcePath })}`,
          "source_validity=invalid",
          "extraction_status=error",
          "bench_reader=none",
          "next_step=download_a_valid_source_file_then_run_prepare_resource_again",
        ].join("\n"),
        metadata: {
          buddyObjectResult,
          resource: params.alias ?? null,
          objectID: null,
          status: "error",
          sourceValidity: "invalid",
          extractionStatus: "error",
          managedSourcePath: null,
          benchReaderPath: null,
          packPath: null,
          fullTextPath: null,
          warnings: [error.message],
          nextStep: "download_a_valid_source_file_then_run_prepare_resource_again",
          timedOut: false,
          waitUntilReady: false,
          maxWaitMs: resolveMaxWaitMs(params.maxWaitMs),
        },
      }
    }

    const shouldWait =
      params.waitUntilReady === true && created.status === RESOURCE_PACK_STATUS_PREPARING
    const maxWaitMs = resolveMaxWaitMs(params.maxWaitMs)

    const finalResult = shouldWait
      ? await waitForPreparedResource({
          directory: ctx.directory,
          objectID: created.objectID,
          maxWaitMs,
          abort: ctx.abort,
        })
      : {
          resource: created,
          timedOut: false,
        }

    const buddyObjectResult = buildPrepareResourceObjectResult({
      resource: finalResult.resource,
      timedOut: finalResult.timedOut,
    })

    return {
      title: PREPARE_RESOURCE_TOOL_ID,
      output: formatResourcePreparationOutput({
        directory: ctx.directory,
        resource: finalResult.resource,
        waitUntilReady: shouldWait,
        timedOut: finalResult.timedOut,
        maxWaitMs,
        buddyObjectResult,
      }),
      metadata: {
        buddyObjectResult,
        resource: finalResult.resource.alias,
        objectID: finalResult.resource.objectID,
        status: finalResult.resource.status,
        sourceValidity: finalResult.resource.sourceValidity,
        extractionStatus: finalResult.resource.extractionStatus,
        format: finalResult.resource.format,
        managedSourcePath: finalResult.resource.sourceRelpath,
        benchReaderPath: finalResult.resource.readerPath ?? null,
        packPath: finalResult.resource.packPath ?? null,
        fullTextPath: finalResult.resource.fullTextPath ?? null,
        warnings: finalResult.resource.warnings,
        nextStep: resolveNextStep({
          status: finalResult.resource.status,
          timedOut: finalResult.timedOut,
        }),
        timedOut: finalResult.timedOut,
        waitUntilReady: shouldWait,
        maxWaitMs,
      },
    }
  },
})
