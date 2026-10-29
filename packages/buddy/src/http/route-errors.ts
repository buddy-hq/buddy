import { randomUUID } from "node:crypto"
import { inspect } from "node:util"
import { redactWidgetFramePasses } from "../learning/features/html-widgets/service/widget-frame-pass"
import { RuntimeError, runtimeErrorStatus } from "@buddy/agent-runtime/errors"
import { Schema, SchemaIssue } from "effect"
import { HTTPException } from "hono/http-exception"
import { ZodError } from "zod"
import { InvalidError, JsonError } from "../config/contract/errors"
import { ConfigSyncError } from "../config/runtime/config-sync-error"
import { FileRenameConflictError } from "../storage/rename-file-without-overwrite"
import { AgentsMdVersionConflictError } from "../agents-md/service"
import {
  BuddyObjectValidationError,
  BuddyObjectNotFoundError,
  BuddyObjectUnavailableError,
  BuddyObjectDuplicateIDError,
  BuddyObjectLoadException,
} from "../objects/errors"
import { NotesError } from "../notes/errors"
import { ChemistryRenderError } from "../chemistry/errors"
import {
  WhiteboardPayloadTooLargeError,
  WhiteboardElementValidationError,
  WhiteboardShareUploadError,
  WhiteboardStaleWriteError,
  WhiteboardStaleLearnerEditError,
} from "../learning/features/whiteboard/errors"
import {
  InvalidMermaidRenderKeyError,
  InvalidMermaidRepairRequestIDError,
  MermaidRenderRecordNotFoundError,
  MermaidRepairRequestNotFoundError,
} from "../learning/features/diagrams/errors"
import { SkillServiceError } from "../learning/skill-management/service/contracts"
import {
  SessionLookupError,
  SessionTransformValidationError,
} from "../session/orchestration/errors"
import { IdempotencyPayloadConflictError } from "./idempotency"
import type { TJsonObject } from "./parse"

export type RouteErrorBody = {
  error: string
  code: string
  errorID?: string
  details?: TJsonObject
}

type ClassifiedRouteError = { status: number; body: RouteErrorBody }
type ConfigErrorDetails = { path?: string; file?: string }
type ErrorContext = {
  config?: boolean
  scope?: "mcp" | "skills.create" | "skills.library" | "skills.byName" | "skills.read"
}

export function routeErrorBody(status: number, error: string, code?: string): RouteErrorBody {
  if (status === 500 && code === undefined) return internalRouteError(new Error(error)).body
  return { error, code: code ?? responseErrorCode(status, error) }
}

function responseErrorCode(status: number, message: string): string {
  if (message.startsWith("Directory not found:")) return "notebook.missing"
  if (message.startsWith("Session not found")) return "session.not_found"
  if (message === "Session is already running") return "session.busy"
  switch (status) {
    case 400:
      return "request.invalid"
    case 401:
      return "request.unauthorized"
    case 403:
      return "request.forbidden"
    case 404:
      return "request.not_found"
    case 409:
      return "request.conflict"
    case 410:
      return "request.gone"
    case 413:
      return "request.too_large"
    case 415:
      return "request.unsupported_media_type"
    case 422:
      return "request.invalid"
    case 429:
      return "request.rate_limited"
    case 502:
      return "request.bad_gateway"
    case 503:
      return "request.unavailable"
    case 504:
      return "request.timeout"
    default:
      return status >= 500 ? "internal" : "request.failed"
  }
}

function known(
  status: number,
  code: string,
  error: string,
  details?: TJsonObject,
): ClassifiedRouteError {
  const body: RouteErrorBody = { error, code }
  if (details !== undefined) body.details = details
  return { status, body }
}

function configFailure(paths: string[], file?: string, message?: string): ClassifiedRouteError {
  const path = paths.filter(Boolean).join("; ")
  const details: ConfigErrorDetails = {}
  if (path) details.path = path
  if (file) details.file = file
  return known(
    400,
    "config.invalid",
    message ?? `Invalid config${file ? `: ${file}` : ""}${path ? ` (${path})` : ""}`,
    details,
  )
}

async function classifyKnownError<TError>(
  error: TError,
  context: ErrorContext,
): Promise<ClassifiedRouteError | undefined> {
  const seen = new Set<unknown>()
  let file: string | undefined
  let config = context.config
  for (
    let cause: unknown = error;
    cause instanceof Error && !seen.has(cause);
    cause = cause.cause
  ) {
    seen.add(cause)
    if (cause instanceof ConfigSyncError) {
      file = cause.file
      config = true
      continue
    }
    if (cause instanceof JsonError) return configFailure([], cause.data.path)
    if (cause instanceof InvalidError) {
      const isFile = /\.jsonc?$/iu.test(cause.data.path)
      const safeMessage =
        cause.message === "Enabled MCP server needs a local command or remote URL" ||
        cause.message === "Config patch payload must be an object" ||
        cause.message === "Config patch payload must resolve to an object"
          ? cause.message
          : undefined
      return configFailure(
        cause.data.issues?.map((issue) => issue.path.join(".")) ??
          (isFile ? [] : [cause.data.path]),
        isFile ? cause.data.path : file,
        safeMessage,
      )
    }
    if (Schema.isSchemaError(cause) && config) {
      const issues = SchemaIssue.makeFormatterStandardSchemaV1({
        leafHook: () => "Invalid setting",
        checkHook: () => "Invalid setting",
      })(cause.issue).issues
      return configFailure(
        issues.map((issue) =>
          (issue.path ?? [])
            .map((part) => (part instanceof Object ? String(part.key) : String(part)))
            .join("."),
        ),
        file,
      )
    }
    if (cause instanceof ZodError) {
      const paths = cause.issues.map((issue) => issue.path.join("."))
      return config
        ? configFailure(paths, file)
        : known(
            400,
            "request.invalid",
            `Invalid request${paths.some(Boolean) ? ` (${paths.filter(Boolean).join("; ")})` : ""}`,
          )
    }
    if (
      context.scope === "mcp" &&
      /dynamic client registration|client registration.*not supported|client[_ ]id.*required/iu.test(
        cause.message,
      )
    ) {
      return known(
        400,
        "McpClientRegistrationRequired",
        "This MCP server requires a pre-registered OAuth client ID.",
      )
    }
    if (cause instanceof RuntimeError) {
      if (cause.kind === "internal") continue
      return known(
        runtimeErrorStatus(cause),
        `${cause.subject ?? "request"}.${cause.kind}`,
        cause.message,
      )
    }
    if (cause instanceof HTTPException && cause.status < 500) {
      const message =
        cause.message === "Malformed JSON in request body"
          ? "Invalid JSON body"
          : cause.message || "Request failed"
      return known(cause.status, responseErrorCode(cause.status, message), message)
    }
    const [
      { ManagedNotebookError },
      { BuddyHomeError },
      { isOpenProjectRegistryError },
      {
        ProjectFilePathEscapeError,
        ProjectFileNotFoundError,
        ProjectFileRenameConflictError,
        ProjectTextFileUnsupportedError,
        ProjectTextFileVersionConflictError,
      },
      { NotesDirectoryError },
      { NotebookUploadError },
      { ResourceValidationError, ResourceNotFoundError },
      { FigureRenderError },
      { FreeformFigureRenderError },
      { HtmlWidgetValidationError },
      { PresentedMediaValidationError, PROJECT_FILE_NOT_FOUND_ERROR },
      { FlashcardCardNotFoundError, FlashcardCardNotQueuedError },
      { BenchContextSnapshotMissingError, BenchContextWriteConflictError },
      { BenchClientLeaseConflictError },
    ] = await Promise.all([
      import("../project/managed-notebook"),
      import("../project/buddy-home"),
      import("../project/open-project-registry"),
      import("../project/project-file-editor-service"),
      import("../notes/settings"),
      import("../notebook-uploads/notebook-upload-service"),
      import("../resources/resource-registry-service"),
      import("../learning/features/figure-rendering/geometry/render-figure"),
      import("../learning/features/figure-rendering/freeform/service/render"),
      import("../learning/features/html-widgets/service/store"),
      import("../learning/features/media-presentations/service/file-media"),
      import("../learning/features/flashcards/storage/review"),
      import("../learning/features/bench/context"),
      import("../learning/features/bench/client-actions"),
    ])
    if (cause instanceof ManagedNotebookError)
      return known(cause.status, "notebook.invalid", cause.message)
    if (cause instanceof BuddyHomeError)
      return known(cause.status, "notebook.home_invalid", cause.message)
    if (isOpenProjectRegistryError(cause))
      return known(cause.status, "notebook.registry_failed", cause.message)
    if (cause instanceof NotesError)
      return known(cause.status, responseErrorCode(cause.status, cause.message), cause.message)
    if (cause instanceof NotesDirectoryError)
      return known(cause.status, "notes.directory_invalid", cause.message)
    if (cause instanceof ChemistryRenderError)
      return known(cause.httpStatus, cause.code, cause.message)
    if (cause instanceof SkillServiceError) {
      let status = 500
      if (context.scope === "skills.create")
        status = cause.code === "conflict" ? 409 : cause.code === "invalid_input" ? 400 : 500
      else if (context.scope === "skills.byName")
        status = cause.code === "not_found" ? 404 : cause.code === "forbidden" ? 403 : 400
      else if (context.scope !== "skills.read")
        status = {
          invalid_input: 400,
          not_found: 404,
          forbidden: 403,
          conflict: 409,
          upstream_failure: 500,
        }[cause.code]
      return known(
        status,
        `skill.${cause.code}`,
        cause.message.trim() ? cause.message : "Skill request failed",
      )
    }
    if (cause instanceof ProjectFilePathEscapeError)
      return known(403, "file.forbidden", cause.message)
    if (cause instanceof ProjectFileNotFoundError)
      return known(404, "file.not_found", cause.message)
    if (
      cause instanceof ProjectFileRenameConflictError ||
      cause instanceof ProjectTextFileVersionConflictError
    )
      return known(409, "file.conflict", cause.message)
    if (cause instanceof FileRenameConflictError)
      return known(409, "file.conflict", "A file with that name already exists.")
    if (cause instanceof ProjectTextFileUnsupportedError)
      return known(415, "file.unsupported", cause.message)
    if (cause instanceof AgentsMdVersionConflictError)
      return known(409, "agents_md.conflict", cause.message)
    if (cause instanceof BuddyObjectValidationError)
      return known(400, "object.invalid", cause.message)
    if (cause instanceof BuddyObjectNotFoundError)
      return known(404, "object.not_found", cause.message)
    if (cause instanceof BuddyObjectUnavailableError)
      return known(410, "object.unavailable", cause.message)
    if (cause instanceof BuddyObjectDuplicateIDError)
      return known(500, "object.duplicate_id", cause.message)
    if (cause instanceof BuddyObjectLoadException)
      return known(500, "object.load_failed", cause.message)
    if (cause instanceof ResourceValidationError)
      return known(400, "resource.invalid", cause.message)
    if (cause instanceof ResourceNotFoundError)
      return known(404, "resource.not_found", cause.message)
    if (cause instanceof NotebookUploadError)
      return known(400, "notebook.upload_invalid", cause.message)
    if (
      cause instanceof WhiteboardPayloadTooLargeError ||
      cause instanceof WhiteboardElementValidationError
    )
      return known(400, "whiteboard.invalid", cause.message)
    if (cause instanceof WhiteboardShareUploadError)
      return known(502, "whiteboard.share_failed", cause.message)
    if (
      cause instanceof WhiteboardStaleWriteError ||
      cause instanceof WhiteboardStaleLearnerEditError
    )
      return known(409, "whiteboard.conflict", cause.message)
    if (
      cause instanceof InvalidMermaidRenderKeyError ||
      cause instanceof InvalidMermaidRepairRequestIDError
    )
      return known(400, "mermaid.invalid", cause.message)
    if (
      cause instanceof MermaidRenderRecordNotFoundError ||
      cause instanceof MermaidRepairRequestNotFoundError
    )
      return known(404, "mermaid.not_found", cause.message)
    if (cause instanceof FigureRenderError || cause instanceof FreeformFigureRenderError)
      return known(400, "figure.invalid", cause.message)
    if (cause instanceof HtmlWidgetValidationError)
      return known(400, "html_widget.invalid", cause.message)
    if (cause instanceof PresentedMediaValidationError)
      return known(
        cause.message === PROJECT_FILE_NOT_FOUND_ERROR ? 404 : 400,
        "media.invalid",
        cause.message,
      )
    if (cause instanceof FlashcardCardNotFoundError)
      return known(404, "flashcard.not_found", cause.message)
    if (cause instanceof FlashcardCardNotQueuedError)
      return known(409, "flashcard.not_queued", cause.message)
    if (cause instanceof BenchContextSnapshotMissingError)
      return known(404, "bench.context_not_found", cause.message)
    if (
      cause instanceof BenchContextWriteConflictError ||
      cause instanceof BenchClientLeaseConflictError
    )
      return known(409, "bench.conflict", cause.message)
    if (cause instanceof IdempotencyPayloadConflictError)
      return known(409, "request.idempotency_conflict", cause.message)
    if (cause instanceof SessionTransformValidationError)
      return known(cause.status, responseErrorCode(cause.status, cause.message), cause.message)
  }
  return undefined
}

function internalRouteError<TError>(
  error: TError,
  logError: (line: string, cause: unknown) => void = console.error,
): ClassifiedRouteError {
  const errorID = randomUUID()
  logError(
    `Unhandled Buddy route error errorID=${errorID}`,
    redactWidgetFramePasses(inspect(error, { depth: null })),
  )
  return { status: 500, body: { error: "Internal server error", code: "internal", errorID } }
}

export async function classifyRouteError<TError>(
  error: TError,
  logError: (line: string, cause: unknown) => void = console.error,
): Promise<ClassifiedRouteError> {
  return (await classifyKnownError(error, {})) ?? internalRouteError(error, logError)
}

export async function mapRouteError<TError>(
  error: TError,
  context: ErrorContext = {},
): Promise<Response | undefined> {
  if (error instanceof SessionLookupError) return error.response
  const classified = await classifyKnownError(error, context)
  return classified ? Response.json(classified.body, { status: classified.status }) : undefined
}

export async function routeErrorResponse<TError>(error: TError): Promise<Response> {
  const classified = await classifyRouteError(error)
  return Response.json(classified.body, { status: classified.status })
}
