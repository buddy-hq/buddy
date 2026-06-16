import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { listRegisteredResources } from "../../../../resources/resource-registry-service"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import {
  BenchContextSnapshotMissingError,
  readCurrentBenchContext,
  type BenchContextTarget,
  type BenchReadContextOutput,
} from "../context"
import { resolveBenchReadingResourceRelpath } from "../reading-resource"

const BenchPresentInputSchema = z
  .object({
    action: z
      .enum(["present_file", "present_resource", "present_whiteboard", "close"])
      .describe(
        "What to show on Bench. Use present_file for a workspace file path, present_resource for a prepared reading resource/book by resource id or alias, present_whiteboard for the current session whiteboard, and close only when the user asks to close Bench.",
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
        "Prepared reading resource id or alias, usually copied from resource inventory or prepare_resource output. Required only for present_resource. Only use resources that expose a Bench reader source, such as bench_reader=<path>. Must be null for every other action. Do not invent resource ids or aliases.",
      ),
  })
  .strict()
  .superRefine(validateBenchPresentInput)

type BenchPresentInput = z.infer<typeof BenchPresentInputSchema>

type BenchPresentStatus = "presented" | "already_presenting" | "closed" | "blocked"

type BenchPresentReason =
  | "presented_file"
  | "presented_resource"
  | "presented_whiteboard"
  | "already_showing_target"
  | "closed_by_request"
  | "file_not_found"
  | "resource_not_found"
  | "unsupported_target"
  | "blocked_by_unsaved_work"
  | "sync_error"

type BenchPresentOutput = {
  status: BenchPresentStatus
  reason: BenchPresentReason
  target: BenchContextTarget | null
  mode: "docked" | "floating" | null
  message: string
}

const HTML_FILE_EXTENSIONS = new Set([".html", ".htm"])

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

function buildFileTarget(input: {
  directory: string
  relativePath: string
  route: string
}): BenchContextTarget {
  const title = path.basename(input.relativePath) || input.relativePath
  const absolutePath = absoluteWorkspacePath({
    directory: input.directory,
    relativePath: input.relativePath,
  })

  return {
    type: isMarkdownPath(input.relativePath) ? "markdown" : "file",
    artifactKind: "none",
    title,
    workspaceRoot: input.directory,
    path: input.relativePath,
    absolutePath,
    resourceID: null,
    artifactID: null,
    itemID: null,
    route: input.route,
    status: "ready",
  }
}

function buildReadingTarget(input: {
  directory: string
  title: string
  sourceRelpath: string
  resourceID: string
  route: string
}): BenchContextTarget {
  return {
    type: "reading",
    artifactKind: "none",
    title: input.title,
    workspaceRoot: input.directory,
    path: input.sourceRelpath,
    absolutePath: absoluteWorkspacePath({
      directory: input.directory,
      relativePath: input.sourceRelpath,
    }),
    resourceID: input.resourceID,
    artifactID: null,
    itemID: null,
    route: input.route,
    status: "ready",
  }
}

function buildWhiteboardTarget(input: { directory: string; route: string }): BenchContextTarget {
  return {
    type: "whiteboard",
    artifactKind: "none",
    title: "Whiteboard",
    workspaceRoot: input.directory,
    path: null,
    absolutePath: null,
    resourceID: null,
    artifactID: null,
    itemID: null,
    route: input.route,
    status: "ready",
  }
}

function isSameBenchContextTarget(
  left: BenchContextTarget,
  right: BenchContextTarget,
): boolean {
  return (
    left.type === right.type &&
    left.artifactKind === right.artifactKind &&
    left.path === right.path &&
    left.resourceID === right.resourceID &&
    left.artifactID === right.artifactID &&
    left.itemID === right.itemID
  )
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
          mode: null,
          message:
            "Bench context has not been synchronized for this session. Try again after the app finishes syncing Bench state.",
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
  nextTarget: BenchContextTarget | null
}): BenchPresentOutput | undefined {
  if (input.current?.status !== "open") {
    return undefined
  }

  if (
    input.nextTarget &&
    isSameBenchContextTarget(input.current.target, input.nextTarget)
  ) {
    return undefined
  }

  if (input.current.target.type !== "markdown") {
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
      mode: null,
      message: "Bench Markdown is still saving. Wait for the save to finish before changing Bench.",
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
      mode: null,
      message: "Bench Markdown has a file conflict. Resolve it before changing Bench.",
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
      mode: null,
      message: "Bench Markdown has a save error. Resolve it before changing Bench.",
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
      mode: null,
      message: "Bench Markdown has unsaved edits. Save or resolve them before changing Bench.",
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
    input.requested.target &&
    isSameBenchContextTarget(input.current.target, input.requested.target)
  ) {
    return {
      status: "already_presenting",
      reason: "already_showing_target",
      target: input.current.target,
      mode: input.requested.mode,
      message: "Bench is already showing that target.",
    }
  }

  const blocked = blockedByCurrentBenchState({
    current: input.current,
    nextTarget: input.requested.target,
  })
  return blocked ?? input.requested
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
      mode: null,
      message: "Bench can present only workspace-relative file paths.",
    }
  }

  if (isHtmlPath(relativePath)) {
    return {
      status: "blocked",
      reason: "unsupported_target",
      target: null,
      mode: null,
      message:
        "HTML files should be presented with present_html_widget so the learner sees the interactive widget, not the source file.",
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
      mode: null,
      message: "Bench can present only files inside the current workspace.",
    }
  }

  const stats = await fs.stat(absolutePath).catch(() => undefined)
  if (!stats?.isFile()) {
    return {
      status: "blocked",
      reason: "file_not_found",
      target: null,
      mode: null,
      message: `File not found: ${relativePath}`,
    }
  }

  const route = isMarkdownPath(relativePath)
    ? `/_bench/markdown?path=${encodeURIComponent(relativePath)}`
    : `/_bench/file?path=${encodeURIComponent(relativePath)}`

  return {
    status: "presented",
    reason: "presented_file",
    target: buildFileTarget({
      directory: input.directory,
      relativePath,
      route,
    }),
    mode: null,
    message: `Requested Bench presentation for ${relativePath}.`,
  }
}

async function presentResource(input: {
  directory: string
  resourceKey: string
}): Promise<BenchPresentOutput> {
  const resources = await listRegisteredResources(input.directory)
  const resource = resources.find(
    (entry) => entry.id === input.resourceKey || entry.alias === input.resourceKey,
  )
  if (!resource) {
    return {
      status: "blocked",
      reason: "resource_not_found",
      target: null,
      mode: null,
      message: `Prepared resource not found: ${input.resourceKey}`,
    }
  }

  const readingResourceRelpath = await resolveBenchReadingResourceRelpath({
    directory: input.directory,
    sourceRelpath: resource.sourceRelpath,
    ...(resource.sourceOriginRelpath
      ? { sourceOriginRelpath: resource.sourceOriginRelpath }
      : {}),
  })
  if (!readingResourceRelpath) {
    return {
      status: "blocked",
      reason: "unsupported_target",
      target: null,
      mode: null,
      message:
        `Resource ${resource.alias} cannot be presented on Bench reading mode because it is not backed by a PDF or EPUB source.`,
    }
  }

  return {
    status: "presented",
    reason: "presented_resource",
    target: buildReadingTarget({
      directory: input.directory,
      title: resource.title ?? resource.alias,
      sourceRelpath: readingResourceRelpath,
      resourceID: resource.id,
      route: `/_bench/read?path=${encodeURIComponent(readingResourceRelpath)}&resource=${encodeURIComponent(resource.id)}`,
    }),
    mode: null,
    message: `Requested Bench presentation for resource ${resource.alias}.`,
  }
}

async function presentOnBench(input: {
  directory: string
  sessionID: string
  action: BenchPresentInput["action"]
  path: string | null
  resourceKey: string | null
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
      mode: null,
      message: "Requested closing Bench.",
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
        resourceKey: input.resourceKey ?? "",
      })
      break
    case "present_whiteboard":
      requested = {
        status: "presented",
        reason: "presented_whiteboard",
        target: buildWhiteboardTarget({
          directory: input.directory,
          route: "/_bench/whiteboard",
        }),
        mode: null,
        message: "Requested Bench presentation for the current whiteboard.",
      }
      break
  }

  return finalizeBenchPresentation({
    current,
    requested,
  })
}

const benchPresentTool = createBuddyTool({
  id: "bench_present",
  description:
    "Present an existing stable target on Bench. Use it for non-HTML workspace files, prepared reading resources/books, the current whiteboard, or closing Bench when the learner asks. Do not use it for .html/.htm teaching widgets; call present_html_widget instead. It cannot create content, choose chat layout, pass artifact ids, resize, minimize, or change user preferences.",
  parameters: BenchPresentInputSchema,
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
    })

    return {
      title: "Bench Presentation",
      output: JSON.stringify(result, null, 2),
      metadata: {
        status: result.status,
        reason: result.reason,
        surface: result.target?.type,
        artifactKind: result.target?.artifactKind,
        path: result.target?.path,
        resourceID: result.target?.resourceID,
      },
    }
  },
})

export { BenchPresentInputSchema, benchPresentTool, presentOnBench }
export type { BenchPresentInput, BenchPresentOutput, BenchPresentReason, BenchPresentStatus }
