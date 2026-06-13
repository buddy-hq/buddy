import z from "zod"
import PRESENT_HTML_WIDGET_DESCRIPTION from "./present-html-widget.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import { nonEmptyString } from "../../../../artifacts"
import {
  buildHtmlWidgetRuntimeUrl,
  buildHtmlWidgetSourceUrl,
  createHtmlWidgetArtifact,
} from "../service/store"
import {
  HTML_WIDGET_KIND,
  HtmlWidgetViewportPresetSchema,
  PresentHtmlWidgetOutputSchema,
  type PresentHtmlWidgetOutput,
} from "../service/types"
import {
  normalizePresentedMediaPermissionPath,
} from "../../media-presentations/service/file-media"

const PresentHtmlWidgetInputSchema = z
  .object({
    path: nonEmptyString.describe(
      "Path to an existing local .html or .htm file that Buddy should snapshot and show now. May be workspace-relative, absolute, file://, or ~/ home-relative. Do not put HTML source code here.",
    ),
    title: nonEmptyString.describe(
      "Short learner-facing title for the widget, such as 'Fraction Builder' or 'Projectile Motion Simulator'.",
    ),
    description: nonEmptyString
      .optional()
      .describe(
        "Optional one-sentence learner-facing description. Include this only when it helps the learner know what to do with the widget.",
      ),
    viewportPreset: HtmlWidgetViewportPresetSchema.describe(
      "Choose the closest viewport the HTML was designed for. Use standard_16_10 for most lessons, wide_16_9 for wide simulations or canvas scenes, square for centered manipulatives, compact_4_3 for small quizzes or controls, and tall_mobile only for phone-shaped widgets.",
    ),
  })
  .strict()

type PresentHtmlWidgetInput = z.infer<typeof PresentHtmlWidgetInputSchema>

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

const presentHtmlWidgetTool = createBuddyTool({
  id: "present_html_widget",
  description: PRESENT_HTML_WIDGET_DESCRIPTION,
  parameters: PresentHtmlWidgetInputSchema,
  async execute(params: PresentHtmlWidgetInput, ctx: BuddyToolContext) {
    const permissionPath = normalizePresentedMediaPermissionPath(ctx.directory, params.path)
    await ctx.ask({
      permission: "present_html_widget",
      patterns: [permissionPath],
      always: [permissionPath],
      metadata: {
        kind: HTML_WIDGET_KIND,
      },
    })

    const widget = await createHtmlWidgetArtifact({
      directory: ctx.directory,
      path: params.path,
      title: params.title,
      ...(params.description ? { description: params.description } : {}),
      viewportPreset: params.viewportPreset,
      origin: {
        kind: "tool",
        sessionID: String(ctx.sessionID),
        messageID: String(ctx.messageID),
        callID: createdByCallID(ctx),
      },
    })
    const runtimeUrl = buildHtmlWidgetRuntimeUrl({
      directory: ctx.directory,
      artifactID: widget.artifactID,
    })
    const sourceUrl = buildHtmlWidgetSourceUrl({
      directory: ctx.directory,
      artifactID: widget.artifactID,
    })

    const output: PresentHtmlWidgetOutput = PresentHtmlWidgetOutputSchema.parse({
      artifactID: widget.artifactID,
      kind: widget.kind,
      title: widget.title,
      ...(widget.description ? { description: widget.description } : {}),
      viewport: widget.summary.viewport,
      runtimeUrl,
      sourceUrl,
      sourceHash: widget.sourceHash,
      ...(widget.summary.sourcePath ? { sourcePath: widget.summary.sourcePath } : {}),
      warnings: widget.summary.warnings,
    })

    return {
      title: "Presented HTML widget",
      output: [
        `Presented HTML widget "${output.title}".`,
        ...(output.warnings.length > 0
          ? [
              "",
              `Runtime policy warnings (${output.warnings.length}):`,
              ...output.warnings.map((warning) => `- ${warning.message}`),
            ]
          : []),
      ].join("\n"),
      metadata: {
        artifact: "PresentHtmlWidgetOutput",
        value: output,
      },
    }
  },
})

export { presentHtmlWidgetTool, PresentHtmlWidgetInputSchema }
export type { PresentHtmlWidgetInput }
