import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import {
  ResourceNotFoundError,
  resolveResourceObjectByKey,
} from "../../../../resources/resource-registry-service"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectNotFoundError,
  BuddyObjectResultSchema,
  BuddyObjectUnavailableError,
  formatBuddyObjectRefLines,
  objectSummaryBaseFromManifest,
  requireBuddyObjectKindDefinition,
  resolveObjectByID,
  type BuddyObjectKind,
  type BuddyObjectManifest,
  type BuddyObjectRef,
  type BuddyObjectResult,
} from "../../../../objects"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import {
  BenchContextSnapshotMissingError,
  BenchTargetSchema,
  benchTargetFromContextTarget,
  readCurrentBenchContext,
  type BenchContextTarget,
  type BenchReadContextOutput,
  type BenchTarget,
  type ObjectBenchTarget,
  type WorkspaceFileBenchTarget,
} from "../context"
import {
  ensureWhiteboardObjectForSession,
  WHITEBOARD_CURRENT_VIEW_ID,
} from "../../whiteboard/service/store"

const BenchPresentActionSchema = z.enum([
  "present_object",
  "present_file",
  "present_resource",
  "present_whiteboard",
  "close",
])

const BenchPresentStatusSchema = z.enum([
  "presented",
  "already_presenting",
  "closed",
  "blocked",
  "error",
])

const BenchPresentReasonSchema = z.enum([
  "presented_file",
  "presented_resource",
  "presented_object",
  "presented_whiteboard",
  "already_showing_target",
  "closed_by_request",
  "file_not_found",
  "resource_not_found",
  "object_not_found",
  "object_unavailable",
  "unsupported_target",
  "blocked_by_unsaved_work",
  "sync_error",
])

const BenchPresentInputSchema = z
  .object({
    action: BenchPresentActionSchema.describe(
      "What to show on Bench. Use present_file for a workspace file path, present_resource for a prepared reading resource by object id or alias, present_object for an existing Buddy object id, present_whiteboard for the current session whiteboard, and close only when the user asks to close Bench.",
    ),
    path: z
      .string()
      .min(1)
      .nullable()
      .describe(
        "Workspace-relative file path. Required only for present_file. Must be null for every other action. Do not invent paths. Do not use this for .html or .htm teaching widgets; use present_html_widget for those.",
      ),
    resourceKey: z
      .string()
      .min(1)
      .nullable()
      .describe(
        "Prepared reading resource object id or alias, usually copied from resource inventory or prepare_resource output. Required only for present_resource. Only use resources that expose a Bench reader source, such as bench_reader=<path>. Must be null for every other action. Do not invent resource ids or aliases.",
      ),
    objectID: BuddyObjectIDSchema.nullable().describe(
      "Buddy object id copied from a prior tool result. Required only for present_object. Must be null for every other action.",
    ),
  })
  .strict()
  .superRefine(validateBenchPresentInput)

const BenchPresentToolMetadataSchema = z
  .object({
    benchAction: BenchPresentActionSchema,
    benchStatus: BenchPresentStatusSchema,
    reason: BenchPresentReasonSchema.nullable(),
    benchTarget: BenchTargetSchema.nullable(),
    buddyObjectResult: BuddyObjectResultSchema.optional(),
  })
  .strict()

type BenchPresentInput = z.infer<typeof BenchPresentInputSchema>
type BenchPresentAction = z.infer<typeof BenchPresentActionSchema>
type BenchPresentStatus = z.infer<typeof BenchPresentStatusSchema>
type BenchPresentReason = z.infer<typeof BenchPresentReasonSchema>
type BenchPresentToolMetadata = z.infer<typeof BenchPresentToolMetadataSchema>

type BenchPresentOutput = {
  status: BenchPresentStatus
  reason: BenchPresentReason
  target: BenchContextTarget | null
  benchTarget: BenchTarget | null
  mode: "docked" | "floating" | null
  message: string
  objectResult: BuddyObjectResult | null
}

const HTML_FILE_EXTENSIONS = new Set([".html", ".htm"])

const DEFAULT_BENCH_VIEW_BY_KIND = {
  [BUDDY_OBJECT_KINDS.resource]: "reader",
  [BUDDY_OBJECT_KINDS.whiteboard]: WHITEBOARD_CURRENT_VIEW_ID,
  [BUDDY_OBJECT_KINDS.htmlWidget]: "runtime",
  [BUDDY_OBJECT_KINDS.mermaid]: "rendered",
  [BUDDY_OBJECT_KINDS.figure]: "rendered",
  [BUDDY_OBJECT_KINDS.freeformFigure]: "rendered",
  [BUDDY_OBJECT_KINDS.mediaPresentation]: "gallery",
  [BUDDY_OBJECT_KINDS.questionSet]: "practice",
  [BUDDY_OBJECT_KINDS.flashcardDeck]: "review",
} satisfies Record<BuddyObjectKind, string>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeBenchPresentInput(rawArgs: unknown): unknown {
  if (!isRecord(rawArgs)) return rawArgs

  return {
    action: rawArgs.action,
    path: rawArgs.path ?? null,
    resourceKey: rawArgs.resourceKey ?? null,
    objectID: rawArgs.objectID ?? null,
  }
}

function formatBenchPresentValidationError(error: z.ZodError): string {
  return [
    `The bench_present tool was called with invalid arguments: ${error.message}`,
    "",
    "Use one of these exact shapes:",
    "",
    "Open a workspace file:",
    JSON.stringify(
      {
        action: "present_file",
        path: "notes/derivatives.md",
        resourceKey: null,
        objectID: null,
      },
      null,
      2,
    ),
    "",
    "Open a prepared resource by object_id or alias:",
    JSON.stringify(
      {
        action: "present_resource",
        path: null,
        resourceKey: "calculus",
        objectID: null,
      },
      null,
      2,
    ),
    "",
    "Open an existing Buddy object:",
    JSON.stringify(
      {
        action: "present_object",
        path: null,
        resourceKey: null,
        objectID: "01KG1A0KH77HJ9QGAQ5QK0N4BD",
      },
      null,
      2,
    ),
    "",
    "Open the current whiteboard:",
    JSON.stringify(
      {
        action: "present_whiteboard",
        path: null,
        resourceKey: null,
        objectID: null,
      },
      null,
      2,
    ),
    "",
    "Close Bench:",
    JSON.stringify(
      {
        action: "close",
        path: null,
        resourceKey: null,
        objectID: null,
      },
      null,
      2,
    ),
  ].join("\n")
}

function validateBenchPresentInput(input: BenchPresentInput, ctx: z.RefinementCtx): void {
  if (input.action === "present_file") {
    if (input.path === null) {
      ctx.addIssue({
        code: "custom",
        path: ["path"],
        message: "path is required when action is present_file.",
      })
    }
    if (input.resourceKey !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["resourceKey"],
        message: "resourceKey must be null when action is present_file.",
      })
    }
    if (input.objectID !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["objectID"],
        message: "objectID must be null when action is present_file.",
      })
    }
    return
  }

  if (input.action === "present_resource") {
    if (input.resourceKey === null) {
      ctx.addIssue({
        code: "custom",
        path: ["resourceKey"],
        message: "resourceKey is required when action is present_resource.",
      })
    }
    if (input.path !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["path"],
        message: "path must be null when action is present_resource.",
      })
    }
    if (input.objectID !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["objectID"],
        message: "objectID must be null when action is present_resource.",
      })
    }
    return
  }

  if (input.action === "present_object") {
    if (input.objectID === null) {
      ctx.addIssue({
        code: "custom",
        path: ["objectID"],
        message: "objectID is required when action is present_object.",
      })
    }
    if (input.path !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["path"],
        message: "path must be null when action is present_object.",
      })
    }
    if (input.resourceKey !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["resourceKey"],
        message: "resourceKey must be null when action is present_object.",
      })
    }
    return
  }

  if (input.path !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["path"],
      message: "path must be null unless action is present_file.",
    })
  }
  if (input.resourceKey !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["resourceKey"],
      message: "resourceKey must be null unless action is present_resource.",
    })
  }
  if (input.objectID !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["objectID"],
      message: "objectID must be null unless action is present_object.",
    })
  }
}

function normalizeWorkspaceRelativePath(filepath: string): string | undefined {
  const normalized = filepath.replaceAll("\\", "/").replace(/^\.\//u, "").trim()
  if (!normalized || path.isAbsolute(normalized) || normalized.startsWith("../")) {
    return undefined
  }
  return normalized
}

function absoluteWorkspacePath(input: { directory: string; relativePath: string }): string {
  return path.resolve(input.directory, input.relativePath)
}

function isMarkdownPath(filepath: string): boolean {
  return filepath.toLowerCase().endsWith(".md")
}

function isHtmlPath(filepath: string): boolean {
  return HTML_FILE_EXTENSIONS.has(path.extname(filepath).toLowerCase())
}

function viewerForWorkspacePath(filepath: string): WorkspaceFileBenchTarget["viewer"] {
  return isMarkdownPath(filepath) ? "markdown" : "file"
}

function workspaceFileRoute(target: WorkspaceFileBenchTarget): string {
  const routePrefix = target.viewer === "markdown" ? "/_bench/markdown" : "/_bench/file"
  return `${routePrefix}?path=${encodeURIComponent(target.path)}`
}

function objectRoute(target: ObjectBenchTarget): string {
  const query = new URLSearchParams({ view: target.viewID })
  if (target.ref.revisionID) query.set("revision", target.ref.revisionID)
  if (target.ref.itemID) query.set("item", target.ref.itemID)
  return `/_bench/objects/${target.ref.kind}/${target.ref.objectID}?${query.toString()}`
}

function buildWorkspaceFileBenchTarget(input: { relativePath: string }): WorkspaceFileBenchTarget {
  return {
    type: "workspace-file",
    path: input.relativePath,
    viewer: viewerForWorkspacePath(input.relativePath),
  }
}

function buildPublishedWorkspaceFileTarget(input: {
  directory: string
  target: WorkspaceFileBenchTarget
}): BenchContextTarget {
  const absolutePath = absoluteWorkspacePath({
    directory: input.directory,
    relativePath: input.target.path,
  })
  return {
    type: "workspace-file",
    title: path.basename(input.target.path) || input.target.path,
    workspaceRoot: input.directory,
    path: input.target.path,
    absolutePath,
    route: workspaceFileRoute(input.target),
    status: "ready",
  }
}

function buildPublishedObjectTarget(input: {
  directory: string
  title: string
  target: ObjectBenchTarget
}): BenchContextTarget {
  return {
    type: "object",
    title: input.title,
    workspaceRoot: input.directory,
    ref: input.target.ref,
    viewID: input.target.viewID,
    route: objectRoute(input.target),
    status: "ready",
  }
}

function objectRefFromManifest(manifest: BuddyObjectManifest): BuddyObjectRef {
  return {
    kind: manifest.kind,
    objectID: manifest.objectID,
    revisionID: manifest.currentRevisionID ?? null,
    itemID: null,
  }
}

function isSameBenchTarget(left: BenchTarget, right: BenchTarget): boolean {
  if (left.type !== right.type) return false
  if (left.type === "workspace-file" && right.type === "workspace-file") {
    return left.path === right.path && left.viewer === right.viewer
  }
  if (left.type === "object" && right.type === "object") {
    return (
      left.ref.kind === right.ref.kind &&
      left.ref.objectID === right.ref.objectID &&
      left.ref.revisionID === right.ref.revisionID &&
      left.ref.itemID === right.ref.itemID &&
      left.viewID === right.viewID
    )
  }
  return false
}

function readCurrentBenchContextForPresentation(input: {
  directory: string
  sessionID: string
}):
  | {
      status: "ready"
      value: BenchReadContextOutput
    }
  | {
      status: "sync_error"
      result: BenchPresentOutput
    } {
  try {
    return {
      status: "ready",
      value: readCurrentBenchContext(input),
    }
  } catch (error) {
    if (error instanceof BenchContextSnapshotMissingError) {
      return {
        status: "sync_error",
        result: {
          status: "blocked",
          reason: "sync_error",
          target: null,
          benchTarget: null,
          mode: null,
          message:
            "Bench context has not been synchronized for this session. Try again after the app finishes syncing Bench state.",
          objectResult: null,
        },
      }
    }
    throw error
  }
}

function metadataIncludes(input: {
  metadata: string[]
  prefix: string
  value: string
}): boolean {
  return input.metadata.some((entry) => entry.trim() === `${input.prefix}: ${input.value}`)
}

function blockedByCurrentBenchState(input: {
  current: BenchReadContextOutput | undefined
  nextTarget: BenchTarget | null
}): BenchPresentOutput | undefined {
  if (input.current?.status !== "open") {
    return undefined
  }

  const currentTarget = benchTargetFromContextTarget(input.current.target)
  if (input.nextTarget && isSameBenchTarget(currentTarget, input.nextTarget)) {
    return undefined
  }

  if (currentTarget.type !== "workspace-file" || currentTarget.viewer !== "markdown") {
    return undefined
  }

  if (metadataIncludes({
    metadata: input.current.metadata,
    prefix: "save_state",
    value: "saving",
  })) {
    return {
      status: "blocked",
      reason: "blocked_by_unsaved_work",
      target: input.current.target,
      benchTarget: currentTarget,
      mode: null,
      message: "Bench Markdown is still saving. Wait for the save to finish before changing Bench.",
      objectResult: null,
    }
  }

  if (metadataIncludes({
    metadata: input.current.metadata,
    prefix: "save_state",
    value: "conflict",
  })) {
    return {
      status: "blocked",
      reason: "blocked_by_unsaved_work",
      target: input.current.target,
      benchTarget: currentTarget,
      mode: null,
      message: "Bench Markdown has a file conflict. Resolve it before changing Bench.",
      objectResult: null,
    }
  }

  if (metadataIncludes({
    metadata: input.current.metadata,
    prefix: "save_state",
    value: "error",
  })) {
    return {
      status: "blocked",
      reason: "blocked_by_unsaved_work",
      target: input.current.target,
      benchTarget: currentTarget,
      mode: null,
      message: "Bench Markdown has a save error. Resolve it before changing Bench.",
      objectResult: null,
    }
  }

  if (
    input.current.target.status === "dirty" ||
    metadataIncludes({
      metadata: input.current.metadata,
      prefix: "dirty",
      value: "true",
    })
  ) {
    return {
      status: "blocked",
      reason: "blocked_by_unsaved_work",
      target: input.current.target,
      benchTarget: currentTarget,
      mode: null,
      message: "Bench Markdown has unsaved edits. Save or resolve them before changing Bench.",
      objectResult: null,
    }
  }

  return undefined
}

function finalizeBenchPresentation(input: {
  current: BenchReadContextOutput | undefined
  requested: BenchPresentOutput
}): BenchPresentOutput {
  if (input.requested.status !== "presented") {
    return input.requested
  }

  if (
    input.current?.status === "open" &&
    input.requested.benchTarget &&
    isSameBenchTarget(benchTargetFromContextTarget(input.current.target), input.requested.benchTarget)
  ) {
    return {
      status: "already_presenting",
      reason: "already_showing_target",
      target: input.current.target,
      benchTarget: benchTargetFromContextTarget(input.current.target),
      mode: input.requested.mode,
      message: "Bench is already showing that target.",
      objectResult: input.requested.objectResult,
    }
  }

  const blocked = blockedByCurrentBenchState({
    current: input.current,
    nextTarget: input.requested.benchTarget,
  })
  return blocked ?? input.requested
}

function buildObjectResult(input: {
  manifest: BuddyObjectManifest
  target: ObjectBenchTarget
  message: string
}): BuddyObjectResult {
  return BuddyObjectResultSchema.parse({
    version: 1,
    status: "ok",
    reason: null,
    message: input.message,
    primaryRef: input.target.ref,
    objects: [
      objectSummaryBaseFromManifest({
        kind: input.manifest.kind,
        objectID: input.manifest.objectID,
        title: input.manifest.title,
        status: input.manifest.status,
        lifecycle: input.manifest.lifecycle,
        sourceRoot: null,
      }),
    ],
    presentations: [
      {
        ref: input.target.ref,
        viewID: input.target.viewID,
        surface: "bench",
        data: null,
        autoOpen: null,
      },
    ],
  })
}

async function buildPublishedTargetFromBenchTarget(input: {
  directory: string
  target: BenchTarget
  manifest?: BuddyObjectManifest
}): Promise<BenchContextTarget> {
  if (input.target.type === "workspace-file") {
    return buildPublishedWorkspaceFileTarget({
      directory: input.directory,
      target: input.target,
    })
  }
  const manifest =
    input.manifest?.objectID === input.target.ref.objectID
      ? input.manifest
      : await readReadyObjectManifest({
          directory: input.directory,
          objectID: input.target.ref.objectID,
        })
  return buildPublishedObjectTarget({
    directory: input.directory,
    title: manifest.title,
    target: input.target,
  })
}

async function readReadyObjectManifest(input: {
  directory: string
  objectID: string
}): Promise<BuddyObjectManifest> {
  const resolved = await resolveObjectByID({
    directory: input.directory,
    objectID: input.objectID,
  })
  if (resolved.status === "ready") {
    return resolved.manifest
  }
  if (resolved.status === "not_found") {
    throw new Error(`Buddy object not found: ${input.objectID}`)
  }
  throw new Error(`Buddy object is unavailable: ${input.objectID}`)
}

async function presentResolvedObject(input: {
  directory: string
  sessionID: string
  manifest: BuddyObjectManifest
  reason: Extract<BenchPresentReason, "presented_object" | "presented_resource" | "presented_whiteboard">
  message: string
}): Promise<BenchPresentOutput> {
  const viewID = DEFAULT_BENCH_VIEW_BY_KIND[input.manifest.kind]
  const definition = requireBuddyObjectKindDefinition(input.manifest.kind)
  const resolved = await definition.resolveBenchView({
    directory: input.directory,
    sessionID: input.sessionID,
    ref: objectRefFromManifest(input.manifest),
    viewID,
  })
  if (resolved.status !== "ready") {
    return {
      status: "blocked",
      reason: resolved.status === "unavailable" ? "object_unavailable" : "unsupported_target",
      target: null,
      benchTarget: null,
      mode: null,
      message: resolved.message,
      objectResult: null,
    }
  }

  const benchTarget = BenchTargetSchema.parse(resolved.target)
  const target = await buildPublishedTargetFromBenchTarget({
    directory: input.directory,
    target: benchTarget,
    manifest: input.manifest,
  })
  const objectResult =
    benchTarget.type === "object"
      ? buildObjectResult({
          manifest: input.manifest,
          target: benchTarget,
          message: input.message,
        })
      : null

  return {
    status: "presented",
    reason: input.reason,
    target,
    benchTarget,
    mode: null,
    message: input.message,
    objectResult,
  }
}

async function presentFile(input: {
  directory: string
  path: string
}): Promise<BenchPresentOutput> {
  const relativePath = normalizeWorkspaceRelativePath(input.path)
  if (!relativePath) {
    return {
      status: "blocked",
      reason: "unsupported_target",
      target: null,
      benchTarget: null,
      mode: null,
      message: "Bench can present only workspace-relative file paths.",
      objectResult: null,
    }
  }

  if (isHtmlPath(relativePath)) {
    return {
      status: "blocked",
      reason: "unsupported_target",
      target: null,
      benchTarget: null,
      mode: null,
      message:
        "HTML files should be presented with present_html_widget so the learner sees the interactive widget, not the source file.",
      objectResult: null,
    }
  }

  const absolutePath = absoluteWorkspacePath({
    directory: input.directory,
    relativePath,
  })
  const workspaceRoot = path.resolve(input.directory)
  const relativeFromRoot = path.relative(workspaceRoot, absolutePath)
  if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
    return {
      status: "blocked",
      reason: "unsupported_target",
      target: null,
      benchTarget: null,
      mode: null,
      message: "Bench can present only files inside the current workspace.",
      objectResult: null,
    }
  }

  const stats = await fs.stat(absolutePath).catch(() => undefined)
  if (!stats?.isFile()) {
    return {
      status: "blocked",
      reason: "file_not_found",
      target: null,
      benchTarget: null,
      mode: null,
      message: `File not found: ${relativePath}`,
      objectResult: null,
    }
  }

  const benchTarget = buildWorkspaceFileBenchTarget({ relativePath })

  return {
    status: "presented",
    reason: "presented_file",
    target: buildPublishedWorkspaceFileTarget({
      directory: input.directory,
      target: benchTarget,
    }),
    benchTarget,
    mode: null,
    message: `Requested Bench presentation for ${relativePath}.`,
    objectResult: null,
  }
}

async function presentResource(input: {
  directory: string
  sessionID: string
  resourceKey: string
}): Promise<BenchPresentOutput> {
  let resource: Awaited<ReturnType<typeof resolveResourceObjectByKey>>
  try {
    resource = await resolveResourceObjectByKey({
      directory: input.directory,
      resourceKey: input.resourceKey,
    })
  } catch (error) {
    if (error instanceof BuddyObjectUnavailableError) {
      return {
        status: "blocked",
        reason: "object_unavailable",
        target: null,
        benchTarget: null,
        mode: null,
        message: `Buddy object is unavailable: ${input.resourceKey}`,
        objectResult: null,
      }
    }
    if (error instanceof ResourceNotFoundError || error instanceof BuddyObjectNotFoundError) {
      return {
        status: "blocked",
        reason: "resource_not_found",
        target: null,
        benchTarget: null,
        mode: null,
        message: `Prepared resource not found: ${input.resourceKey}`,
        objectResult: null,
      }
    }
    throw error
  }

  const resolved = await resolveObjectByID({
    directory: input.directory,
    objectID: resource.objectID,
  })
  if (resolved.status === "not_found") {
    return {
      status: "blocked",
      reason: "resource_not_found",
      target: null,
      benchTarget: null,
      mode: null,
      message: `Prepared resource not found: ${input.resourceKey}`,
      objectResult: null,
    }
  }
  if (resolved.status === "unavailable" || resolved.status === "error") {
    return {
      status: "blocked",
      reason: "object_unavailable",
      target: null,
      benchTarget: null,
      mode: null,
      message: `Buddy object is unavailable: ${resource.objectID}`,
      objectResult: null,
    }
  }

  return presentResolvedObject({
    directory: input.directory,
    sessionID: input.sessionID,
    manifest: resolved.manifest,
    reason: "presented_resource",
    message: `Requested Bench presentation for resource ${resource.alias}.`,
  })
}

async function presentObject(input: {
  directory: string
  sessionID: string
  objectID: string
}): Promise<BenchPresentOutput> {
  const resolved = await resolveObjectByID({
    directory: input.directory,
    objectID: input.objectID,
  })
  if (resolved.status === "not_found") {
    return {
      status: "blocked",
      reason: "object_not_found",
      target: null,
      benchTarget: null,
      mode: null,
      message: `Buddy object not found: ${input.objectID}`,
      objectResult: null,
    }
  }
  if (resolved.status === "unavailable" || resolved.status === "error") {
    return {
      status: "blocked",
      reason: "object_unavailable",
      target: null,
      benchTarget: null,
      mode: null,
      message: `Buddy object is unavailable: ${input.objectID}`,
      objectResult: null,
    }
  }

  return presentResolvedObject({
    directory: input.directory,
    sessionID: input.sessionID,
    manifest: resolved.manifest,
    reason: "presented_object",
    message: `Requested Bench presentation for object ${resolved.manifest.objectID}.`,
  })
}

async function presentWhiteboard(input: {
  directory: string
  sessionID: string
}): Promise<BenchPresentOutput> {
  const manifest = await ensureWhiteboardObjectForSession({
    directory: input.directory,
    sessionID: input.sessionID,
  })
  return presentResolvedObject({
    directory: input.directory,
    sessionID: input.sessionID,
    manifest,
    reason: "presented_whiteboard",
    message: "Requested Bench presentation for the current whiteboard.",
  })
}

async function presentOnBench(input: {
  directory: string
  sessionID: string
  action: BenchPresentInput["action"]
  path: string | null
  resourceKey: string | null
  objectID: string | null
}): Promise<BenchPresentOutput> {
  const currentRead = readCurrentBenchContextForPresentation({
    directory: input.directory,
    sessionID: input.sessionID,
  })
  if (currentRead.status === "sync_error") {
    return currentRead.result
  }
  const current = currentRead.value

  if (input.action === "close") {
    const blocked = blockedByCurrentBenchState({
      current,
      nextTarget: null,
    })
    if (blocked) {
      return blocked
    }

    return {
      status: "closed",
      reason: "closed_by_request",
      target: null,
      benchTarget: null,
      mode: null,
      message: "Requested closing Bench.",
      objectResult: null,
    }
  }

  let requested: BenchPresentOutput
  switch (input.action) {
    case "present_file":
      requested = await presentFile({
        directory: input.directory,
        path: input.path ?? "",
      })
      break
    case "present_resource":
      requested = await presentResource({
        directory: input.directory,
        sessionID: input.sessionID,
        resourceKey: input.resourceKey ?? "",
      })
      break
    case "present_object":
      requested = await presentObject({
        directory: input.directory,
        sessionID: input.sessionID,
        objectID: input.objectID ?? "",
      })
      break
    case "present_whiteboard":
      requested = await presentWhiteboard({
        directory: input.directory,
        sessionID: input.sessionID,
      })
      break
  }

  return finalizeBenchPresentation({
    current,
    requested,
  })
}

function buildBenchPresentToolMetadata(input: {
  action: BenchPresentAction
  result: BenchPresentOutput
}): BenchPresentToolMetadata {
  return BenchPresentToolMetadataSchema.parse({
    benchAction: input.action,
    benchStatus: input.result.status,
    reason: input.result.reason,
    benchTarget: input.result.benchTarget,
    ...(input.result.objectResult ? { buddyObjectResult: input.result.objectResult } : {}),
  })
}

const benchPresentTool = createBuddyTool({
  id: "bench_present",
  description: [
    "Present an existing stable target on Bench, or close Bench.",
    "",
    "Use this tool when the learner asks to focus a raw workspace file, prepared resource, existing Buddy object, or the current whiteboard on Bench.",
    "",
    "For Buddy objects, pass only objectID copied from a prior tool result. Do not pass object kind, revision id, item id, view id, routes, layout pixels, or user preferences.",
    "",
    "Do not use this tool to create content, render media inline, create an HTML widget, edit a whiteboard, choose layout pixels, change user preferences, or build routes.",
  ].join("\n"),
  parameters: BenchPresentInputSchema,
  normalizeInput: normalizeBenchPresentInput,
  formatValidationError: formatBenchPresentValidationError,
  ui: {
    presentation: "hidden-summary",
    labels: {
      running: "Presenting on Bench",
      idle: "Presented on Bench",
    },
  },
  async execute(params, ctx) {
    const result = await presentOnBench({
      directory: ctx.directory,
      sessionID: String(ctx.sessionID),
      action: params.action,
      path: params.path,
      resourceKey: params.resourceKey,
      objectID: params.objectID,
    })
    const metadata = buildBenchPresentToolMetadata({
      action: params.action,
      result,
    })

    return {
      title: "Bench Presentation",
      output: result.objectResult
        ? [
            result.objectResult.message,
            ...formatBuddyObjectRefLines(result.objectResult.primaryRef),
          ].join("\n")
        : result.message,
      metadata,
    }
  },
})

export {
  BenchPresentInputSchema,
  BenchPresentToolMetadataSchema,
  benchPresentTool,
  presentOnBench,
}
export type {
  BenchPresentAction,
  BenchPresentInput,
  BenchPresentOutput,
  BenchPresentReason,
  BenchPresentStatus,
  BenchPresentToolMetadata,
}
