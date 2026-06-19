import z from "zod"
import PRESENT_HTML_WIDGET_DESCRIPTION from "./present-html-widget.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectResultSchema,
  formatBuddyObjectRefLines,
  nonEmptyString,
  objectSummaryBaseFromManifest,
  type BuddyObjectResult,
} from "../../../../objects"
import { presentHtmlWidgetObject, type PresentHtmlWidgetObjectResult } from "../service/store"
import { HtmlWidgetViewportPresetSchema } from "../service/types"
import { normalizePresentedMediaPermissionPath } from "../../media-presentations/service/file-media"

const HTML_WIDGET_RUNTIME_VIEW_ID = "runtime" as const
const HTML_WIDGET_AUTO_OPEN_POLICY_ID = "fullscreen-html-widget" as const
const HTML_WIDGET_AUTO_OPEN_EVENT_PREFIX = "fullscreen-html-widget:" as const
const HTML_WIDGET_AUTO_OPEN_VIEWPORT_PRESETS = new Set(["standard_16_10", "wide_16_9"])

const nullableStringField = nonEmptyString.nullable()
const nullableObjectIDField = BuddyObjectIDSchema.nullable()
const nullableViewportPresetField = HtmlWidgetViewportPresetSchema.nullable()

const PresentHtmlWidgetInputSchema = z
  .object({
    action: z
      .enum(["present_path", "present_object"])
      .describe(
        "Choose one exact mode. Use present_path only when you have a real local HTML file or widget folder to adopt for the first presentation. Use present_object only after Buddy returned an html-widget object_id and you want to show that same managed widget again.",
      ),
    path: nullableStringField.describe(
      "For present_path only: local .html/.htm file or widget folder, for example widgets/fraction-builder.html. Prefer workspace-relative paths; absolute paths, file:// URLs, Windows drive paths, and ~/ paths are accepted only when they resolve inside the current workspace. Must be null for present_object. Do not put the widget title or object_id here.",
    ),
    objectID: nullableObjectIDField.describe(
      "For present_object only: the returned 26-character html-widget object_id, supplied here as objectID, copied from a previous successful Buddy tool output. Must be null for present_path. Never invent it; never put the title, filename, path, display name, or description here.",
    ),
    entryPath: nullableStringField.describe(
      "For present_path when path is a folder only: .html/.htm entry file inside that folder, relative to path, for example index.html. Use null when path points directly to an HTML file. Must be null for present_object. Do not pass a workspace-absolute path here.",
    ),
    title: nullableStringField.describe(
      "Required for present_path: learner-facing display title, for example Fraction Builder or Counter Widget. This is where the widget name goes. Must be null for present_object. Never put the title in objectID.",
    ),
    description: nullableStringField.describe(
      "Optional short learner-facing description for present_path. Use null when not needed. Must be null for present_object. Do not use this for path, title, or objectID.",
    ),
    viewportPreset: nullableViewportPresetField.describe(
      "Required for present_path: choose compact_4_3, standard_16_10, wide_16_9, square, or tall_mobile based on the authored layout. Must be null for present_object.",
    ),
  })
  .strict()
  .superRefine(validatePresentHtmlWidgetInput)

type PresentHtmlWidgetInput = z.infer<typeof PresentHtmlWidgetInputSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizePresentHtmlWidgetInput(rawArgs: unknown): unknown {
  if (!isRecord(rawArgs)) return rawArgs

  return {
    action: rawArgs.action,
    path: rawArgs.path ?? null,
    objectID: rawArgs.objectID ?? null,
    entryPath: rawArgs.entryPath ?? null,
    title: rawArgs.title ?? null,
    description: rawArgs.description ?? null,
    viewportPreset: rawArgs.viewportPreset ?? null,
  }
}

function validatePresentHtmlWidgetInput(input: PresentHtmlWidgetInput, ctx: z.RefinementCtx): void {
  if (input.action === "present_path") {
    if (input.path === null) {
      ctx.addIssue({ code: "custom", path: ["path"], message: "path is required." })
    }
    if (input.title === null) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "title is required." })
    }
    if (input.viewportPreset === null) {
      ctx.addIssue({
        code: "custom",
        path: ["viewportPreset"],
        message: "viewportPreset is required.",
      })
    }
    if (input.objectID !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["objectID"],
        message:
          "objectID must be null for present_path. Put the learner-facing display name in title, not objectID.",
      })
    }
    return
  }

  if (input.objectID === null) {
    ctx.addIssue({ code: "custom", path: ["objectID"], message: "objectID is required." })
  }
  for (const key of ["path", "entryPath", "title", "description", "viewportPreset"] as const) {
    if (input[key] !== null) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} must be null for present_object.`,
      })
    }
  }
}

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

function formatPresentHtmlWidgetValidationError(error: z.ZodError): string {
  return [
    `The present_html_widget tool was called with invalid arguments: ${error.message}`,
    "",
    "Use one of these exact shapes:",
    "",
    "First presentation of an HTML file:",
    JSON.stringify(
      {
        action: "present_path",
        path: "widgets/fraction-builder.html",
        objectID: null,
        entryPath: null,
        title: "Fraction Builder",
        description: null,
        viewportPreset: "standard_16_10",
      },
      null,
      2,
    ),
    "",
    "First presentation of a widget folder:",
    JSON.stringify(
      {
        action: "present_path",
        path: "widgets/projectile-sim",
        objectID: null,
        entryPath: "index.html",
        title: "Projectile Motion Simulator",
        description: null,
        viewportPreset: "wide_16_9",
      },
      null,
      2,
    ),
    "",
    "Re-presenting a managed widget after editing source_root/edit_path:",
    JSON.stringify(
      {
        action: "present_object",
        path: null,
        objectID: "01KG1A0KH77HJ9QGAQ5QK0N4BD",
        entryPath: null,
        title: null,
        description: null,
        viewportPreset: null,
      },
      null,
      2,
    ),
    "",
    "For present_path, path may be workspace-relative, absolute, file://, or ~/. It must resolve inside the current workspace; paths outside the workspace are rejected.",
  ].join("\n")
}

function buildHtmlWidgetObjectResult(input: {
  result: PresentHtmlWidgetObjectResult
}): BuddyObjectResult {
  const ref = {
    kind: BUDDY_OBJECT_KINDS.htmlWidget,
    objectID: input.result.manifest.objectID,
    revisionID: null,
    itemID: null,
  }
  const shouldAutoOpen = HTML_WIDGET_AUTO_OPEN_VIEWPORT_PRESETS.has(
    input.result.manifest.summary.viewportPreset,
  )
  return BuddyObjectResultSchema.parse({
    version: 1,
    status: "ok",
    reason: null,
    message: `Presented HTML widget ${input.result.manifest.title}.`,
    primaryRef: ref,
    objects: [
      objectSummaryBaseFromManifest({
        kind: BUDDY_OBJECT_KINDS.htmlWidget,
        objectID: input.result.manifest.objectID,
        title: input.result.manifest.title,
        status: input.result.manifest.status,
        lifecycle: input.result.manifest.lifecycle,
        sourceRoot: input.result.sourceRoot,
      }),
    ],
    presentations: [
      {
        ref,
        viewID: HTML_WIDGET_RUNTIME_VIEW_ID,
        surface: "inline",
        data: input.result.inlineData,
        autoOpen: null,
      },
      ...(shouldAutoOpen
        ? [
            {
              ref,
              viewID: HTML_WIDGET_RUNTIME_VIEW_ID,
              surface: "bench" as const,
              data: null,
              autoOpen: {
                policyID: HTML_WIDGET_AUTO_OPEN_POLICY_ID,
                eventKey: `${HTML_WIDGET_AUTO_OPEN_EVENT_PREFIX}${input.result.manifest.objectID}`,
              },
            },
          ]
        : []),
    ],
  })
}

const presentHtmlWidgetTool = createBuddyTool({
  id: "present_html_widget",
  produces: {
    buddyObjectResult: true,
  },
  description: PRESENT_HTML_WIDGET_DESCRIPTION,
  parameters: PresentHtmlWidgetInputSchema,
  normalizeInput: normalizePresentHtmlWidgetInput,
  formatValidationError: formatPresentHtmlWidgetValidationError,
  async execute(params: PresentHtmlWidgetInput, ctx: BuddyToolContext) {
    if (params.action === "present_path") {
      const permissionPath = normalizePresentedMediaPermissionPath(ctx.directory, params.path ?? "")
      await ctx.ask({
        permission: "present_html_widget",
        patterns: [permissionPath],
        always: [permissionPath],
        metadata: {
          kind: BUDDY_OBJECT_KINDS.htmlWidget,
        },
      })
    }

    const result = await presentHtmlWidgetObject(
      params.action === "present_path"
        ? {
            action: "present_path",
            directory: ctx.directory,
            path: params.path ?? "",
            entryPath: params.entryPath,
            title: params.title ?? "",
            ...(params.description ? { description: params.description } : {}),
            viewportPreset: params.viewportPreset ?? "standard_16_10",
            origin: {
              kind: "tool",
              sessionID: String(ctx.sessionID),
              messageID: String(ctx.messageID),
              callID: createdByCallID(ctx),
            },
          }
        : {
            action: "present_object",
            directory: ctx.directory,
            objectID: params.objectID ?? "",
          },
    )
    const buddyObjectResult = buildHtmlWidgetObjectResult({ result })
    return {
      title: "Presented HTML widget",
      output: [
        buddyObjectResult.message,
        ...formatBuddyObjectRefLines(buddyObjectResult.primaryRef),
        `source_root=${result.sourceRoot}`,
        `entry_path=${result.entryPath}`,
        `edit_path=${result.editPath}`,
        ...(result.originalPath ? [`original_path=${result.originalPath}`] : []),
        ...(result.originalPathStatus ? [`original_path_status=${result.originalPathStatus}`] : []),
        result.originalPathStatus === "moved"
          ? [
              "<buddy_system_reminder>",
              "The HTML widget source has been adopted into Buddy-managed storage. Edit only edit_path or files under source_root. Do not edit or present original_path again.",
              "</buddy_system_reminder>",
            ].join("\n")
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        buddyObjectResult,
        sourceRoot: result.sourceRoot,
        entryPath: result.entryPath,
        editPath: result.editPath,
        originalPath: result.originalPath,
        originalPathStatus: result.originalPathStatus,
      },
    }
  },
})

export { presentHtmlWidgetTool, PresentHtmlWidgetInputSchema }
export type { PresentHtmlWidgetInput }
