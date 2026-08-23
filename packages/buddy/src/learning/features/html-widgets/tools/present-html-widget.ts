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
import { dispatchBestEffortBenchPresent } from "../../bench/auto-open"

const HTML_WIDGET_RUNTIME_VIEW_ID = "runtime" as const
const HTML_WIDGET_AUTO_OPEN_POLICY_ID = "fullscreen-html-widget" as const
const HTML_WIDGET_AUTO_OPEN_EVENT_PREFIX = "fullscreen-html-widget" as const
const HTML_WIDGET_AUTO_OPEN_EVENT_KEY_SEPARATOR = ":" as const
const HTML_WIDGET_AUTO_OPEN_MISSING_CALL_ID = "no-call" as const
// Temporarily auto-open every viewport preset on Bench until we find a better
// pattern for which widgets stay inline-only vs open on Bench.
const HTML_WIDGET_AUTO_OPEN_VIEWPORT_PRESETS = new Set([
  "compact_4_3",
  "standard_16_10",
  "wide_16_9",
  "square",
  "tall_mobile",
])

const PresentHtmlWidgetInputSchema = z
  .object({
    action: z
      .enum(["present_path", "present_object"])
      .describe(
        "Choose one exact mode. Use present_path only when you have a real local HTML file or widget folder to adopt for the first presentation. Use present_object only after Buddy returned an html-widget object_id and you want to show that same managed widget again.",
      ),
    path: nonEmptyString.optional().describe(
      "For present_path only: local .html/.htm file or widget folder, for example widgets/fraction-builder.html. Prefer workspace-relative paths; absolute paths, file:// URLs, Windows drive paths, and ~/ paths are accepted only when they resolve inside the current workspace. Omit for present_object. Do not put the widget title or object_id here.",
    ),
    objectID: BuddyObjectIDSchema.optional().describe(
      "For present_object only: the returned 26-character html-widget object_id, supplied here as objectID, copied from a previous successful Buddy tool output. Omit for present_path. Never invent it; never put the title, filename, path, display name, or description here.",
    ),
    entryPath: nonEmptyString.optional().describe(
      "For present_path when path is a folder only: .html/.htm entry file inside that folder, relative to path, for example index.html. Omit when path points directly to an HTML file and for present_object. Do not pass a workspace-absolute path here.",
    ),
    title: nonEmptyString.optional().describe(
      "Required for present_path: learner-facing display title, for example Fraction Builder or Counter Widget. This is where the widget name goes. Omit for present_object. Never put the title in objectID.",
    ),
    description: nonEmptyString.optional().describe(
      "Optional short learner-facing description for present_path. Omit when not needed and for present_object. Do not use this for path, title, or objectID.",
    ),
    viewportPreset: HtmlWidgetViewportPresetSchema.optional().describe(
      "Required for present_path: choose compact_4_3, standard_16_10, wide_16_9, square, or tall_mobile based on the authored layout. Omit for present_object.",
    ),
  })
  .strict()
  .superRefine(validatePresentHtmlWidgetInput)

type PresentHtmlWidgetInput = z.infer<typeof PresentHtmlWidgetInputSchema>
function parseToolInputString<TValue>(value: TValue): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function validatePresentHtmlWidgetInput(input: PresentHtmlWidgetInput, ctx: z.RefinementCtx): void {
  if (input.action === "present_path") {
    if (input.path === undefined) {
      ctx.addIssue({ code: "custom", path: ["path"], message: "path is required." })
    }
    if (input.title === undefined) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "title is required." })
    }
    if (input.viewportPreset === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["viewportPreset"],
        message: "viewportPreset is required.",
      })
    }
    if (input.objectID !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["objectID"],
        message:
          "objectID must be omitted for present_path. Put the learner-facing display name in title, not objectID.",
      })
    }
    return
  }

  if (input.objectID === undefined) {
    ctx.addIssue({ code: "custom", path: ["objectID"], message: "objectID is required." })
  }
  for (const key of ["path", "entryPath", "title", "description", "viewportPreset"] as const) {
    if (input[key] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} must be omitted for present_object.`,
      })
    }
  }
}

function createdByCallID(ctx: BuddyToolContext): string {
  const callID = ctx.callID
  if (callID !== undefined && callID.trim().length > 0) return callID
  return "unknown"
}

function nullableCallID(ctx: BuddyToolContext): string | null {
  const callID = ctx.callID
  if (callID !== undefined && callID.trim().length > 0) return callID
  return null
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
        title: "Fraction Builder",
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
        entryPath: "index.html",
        title: "Projectile Motion Simulator",
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
        objectID: "01KG1A0KH77HJ9QGAQ5QK0N4BD",
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
  autoOpenEventKey: string
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
                eventKey: input.autoOpenEventKey,
              },
            },
          ]
        : []),
    ],
  })
}

function htmlWidgetAutoOpenEventKey(input: {
  objectID: string
  sessionID: string
  messageID: string
  callID: string | null
}): string {
  return [
    HTML_WIDGET_AUTO_OPEN_EVENT_PREFIX,
    input.objectID,
    input.sessionID,
    input.messageID,
    input.callID ?? HTML_WIDGET_AUTO_OPEN_MISSING_CALL_ID,
  ].join(HTML_WIDGET_AUTO_OPEN_EVENT_KEY_SEPARATOR)
}

const presentHtmlWidgetTool = createBuddyTool({
  id: "present_html_widget",
  produces: {
    buddyObjectResult: true,
  },
  description: PRESENT_HTML_WIDGET_DESCRIPTION,
  parameters: PresentHtmlWidgetInputSchema,
  presentation: {
    archetype: "inline-output",
    icon: "widget",
    renderer: "html-widget",
    layoutRole: "media-output",
    phases: {
      pending: {
        action: "Preparing widget",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      running: {
        action: "Presenting widget",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      completed: {
        action: "Presented widget",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      error: {
        action: "Failed to present widget",
        detail: ({ input }) => parseToolInputString(input.title),
      },
    },
  },
  formatValidationError: formatPresentHtmlWidgetValidationError,
  async execute(params: PresentHtmlWidgetInput, ctx: BuddyToolContext) {
    const sessionID = String(ctx.sessionID)
    const messageID = String(ctx.messageID)
    const callID = nullableCallID(ctx)
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
        ? Object.assign(
            {
              action: "present_path" as const,
              directory: ctx.directory,
              path: params.path ?? "",
              entryPath: params.entryPath ?? null,
              title: params.title ?? "",
              viewportPreset: params.viewportPreset ?? "standard_16_10",
              origin: {
                kind: "tool" as const,
                sessionID,
                messageID,
                callID: createdByCallID(ctx),
              },
            },
            params.description ? { description: params.description } : undefined,
          )
        : {
            action: "present_object" as const,
            directory: ctx.directory,
            objectID: params.objectID ?? "",
          },
    )
    const autoOpenEventKey = htmlWidgetAutoOpenEventKey({
      objectID: result.manifest.objectID,
      sessionID,
      messageID,
      callID,
    })
    const buddyObjectResult = buildHtmlWidgetObjectResult({ result, autoOpenEventKey })
    const shouldAutoOpen = HTML_WIDGET_AUTO_OPEN_VIEWPORT_PRESETS.has(
      result.manifest.summary.viewportPreset,
    )
    if (shouldAutoOpen) {
      dispatchBestEffortBenchPresent({
        directory: ctx.directory,
        sessionID,
        messageID,
        callID,
        autoOpen: {
          policyID: HTML_WIDGET_AUTO_OPEN_POLICY_ID,
          eventKey: autoOpenEventKey,
        },
        target: {
          type: "object",
          ref: {
            kind: BUDDY_OBJECT_KINDS.htmlWidget,
            objectID: result.manifest.objectID,
            revisionID: null,
            itemID: null,
          },
          viewID: HTML_WIDGET_RUNTIME_VIEW_ID,
        },
      })
    }
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

export { presentHtmlWidgetTool, PresentHtmlWidgetInputSchema, htmlWidgetAutoOpenEventKey }
export type { PresentHtmlWidgetInput }
