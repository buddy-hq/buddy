import PREPARE_RESOURCE_DESCRIPTION from "./prepare-resource.md"
import z from "zod"
import { RESOURCE_PACK_STATUS_PREPARING } from "../../../../../resource-packs"
import {
  addResource,
  getResourceByKey,
  type ResourceRecord,
  type ResourceStatus,
} from "../../../../../resources/resource-registry-service"
import { createBuddyTool } from "../../../../tools/create-buddy-tool"

const PREPARE_RESOURCE_TOOL_ID = "pedagogy_prepare_resource" as const
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
  if (input.status === "ready") return "resource_ready_use_alias_or_id_in_followup_tools"
  if (input.status === "preparing" && input.timedOut) {
    return "resource_still_preparing_wait_then_check_again"
  }
  if (input.status === "stale") return "resource_stale_run_prepare_resource_again_or_rebuild"
  if (input.status === "unsupported")
    return "resource_unsupported_use_supported_format_or_plain_text"
  if (input.status === "error") return "resource_failed_check_warnings_then_retry"
  return "resource_status_recorded"
}

function formatResourcePreparationOutput(input: {
  resource: ResourceRecord
  waitUntilReady: boolean
  timedOut: boolean
  maxWaitMs: number
}) {
  return [
    `<resource_preparation tool="${PREPARE_RESOURCE_TOOL_ID}" completed="${
      input.resource.status !== RESOURCE_PACK_STATUS_PREPARING
    }">`,
    `resource_id=${input.resource.id}`,
    `alias=${input.resource.alias}`,
    `status=${input.resource.status}`,
    `format=${input.resource.format}`,
    `source_relpath=${input.resource.sourceRelpath}`,
    `source_origin_relpath=${input.resource.sourceOriginRelpath ?? "none"}`,
    `warnings=${formatWarnings(input.resource.warnings)}`,
    `prepared_at=${input.resource.preparedAt ?? "none"}`,
    `wait_until_ready=${input.waitUntilReady}`,
    `timed_out=${input.timedOut}`,
    `max_wait_ms=${input.maxWaitMs}`,
    `next_step=${resolveNextStep({ status: input.resource.status, timedOut: input.timedOut })}`,
    "</resource_preparation>",
  ].join("\n")
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function readPreparedResourceByID(
  directory: string,
  resourceID: string,
): Promise<ResourceRecord> {
  const resource = await getResourceByKey(directory, resourceID)
  if (!resource) {
    throw new Error(`Resource not found after registration: ${resourceID}`)
  }
  return resource
}

async function waitForPreparedResource(input: {
  directory: string
  resourceID: string
  maxWaitMs: number
  abort: AbortSignal
}): Promise<ResourcePreparationResult> {
  let current = await readPreparedResourceByID(input.directory, input.resourceID)
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

    current = await readPreparedResourceByID(input.directory, input.resourceID)
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

export const pedagogyPrepareResourceTool = createBuddyTool(PREPARE_RESOURCE_TOOL_ID, {
  description: PREPARE_RESOURCE_DESCRIPTION,
  parameters: ResourcePrepareParameters,
  async execute(params, ctx) {
    await ctx.ask({
      permission: PREPARE_RESOURCE_TOOL_ID,
      patterns: [params.sourcePath],
      always: [params.sourcePath],
      metadata: {
        alias: params.alias ?? null,
      },
    })

    const created = await addResource({
      directory: ctx.directory,
      sourcePath: params.sourcePath,
      alias: params.alias,
    })

    const shouldWait =
      params.waitUntilReady === true && created.status === RESOURCE_PACK_STATUS_PREPARING
    const maxWaitMs = resolveMaxWaitMs(params.maxWaitMs)

    const finalResult = shouldWait
      ? await waitForPreparedResource({
          directory: ctx.directory,
          resourceID: created.id,
          maxWaitMs,
          abort: ctx.abort,
        })
      : {
          resource: created,
          timedOut: false,
        }

    return {
      title: PREPARE_RESOURCE_TOOL_ID,
      output: formatResourcePreparationOutput({
        resource: finalResult.resource,
        waitUntilReady: shouldWait,
        timedOut: finalResult.timedOut,
        maxWaitMs,
      }),
      metadata: {
        resource: finalResult.resource.alias,
        resourceID: finalResult.resource.id,
        status: finalResult.resource.status,
        timedOut: finalResult.timedOut,
        waitUntilReady: shouldWait,
        maxWaitMs,
      },
    }
  },
})
