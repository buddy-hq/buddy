import { randomUUID } from "node:crypto"
import path from "node:path"
import z from "zod"
import {
  captureTextFileWriteSnapshot,
  writeTextFileAtomicLocked,
} from "@buddy/backend/storage/locked-atomic-file"
import { publishFileSystemChange } from "@buddy/opencode-adapter/global-event"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import { authorizeFileWritePath } from "@buddy/backend/learning/runtime/external-file-authorization"
import RENDER_SVG_DESCRIPTION from "./render-svg.md"
import { SvgSourceFormatSchema, SvgTextSourceSchema } from "../service/contracts"
import { renderSvgSource, sha256Text } from "../service/render-source"
import {
  SVG_AUTO_REPAIR_MAX_RENDER_ATTEMPTS,
  beginSvgAutoRepairRenderAttempt,
  completeSvgAutoRepairRenderAttempt,
  isSvgAutoRepairMessageID,
  readSvgAutoRepairRequest,
  resolveSvgAutoRepairStoragePath,
  scheduleSvgAutoRepairScratchCleanup,
  svgAutoRepairScratchFile,
} from "../service/auto-repair"

const SVG_FILE_EXTENSION = ".svg"
const RENDER_SVG_FILE_PERMISSION = "edit"
const RENDER_SVG_OUTPUT_MAX_LINES = 20
const RENDER_SVG_OUTPUT_MAX_BYTES = 4_096

const SvgFilePathSchema = z
  .string()
  .min(1)
  .refine((filePath) => path.isAbsolute(filePath), "filePath must be an absolute path.")
  .refine(
    (filePath) => path.extname(filePath).toLowerCase() === SVG_FILE_EXTENSION,
    "filePath must end in .svg.",
  )

const RenderSvgInputSchema = z
  .object({
    filePath: SvgFilePathSchema.describe(
      "Absolute path where the generated SVG file must be written. The path must end in .svg. Choose the path based on where the consuming worksheet, presentation, document, or export expects the asset. An existing file is replaced only after rendering and SVG validation succeed.",
    ),
    format: SvgSourceFormatSchema.describe(
      "Exact syntax of source. Use smiles or cxsmiles for molecule line notation, reaction-smiles for reaction line notation, ket for Ketcher documents, or chemfig for chemfig source.",
    ),
    source: SvgTextSourceSchema.describe(
      "Complete chemistry source in the declared format. Pass only the source, without a Markdown code fence, caption, alt text, or surrounding explanation. Buddy preserves the chemical source exactly and does not guess its format or silently repair its meaning.",
    ),
  })
  .strict()

type RenderSvgInput = z.infer<typeof RenderSvgInputSchema>

function parseToolInputString<TValue>(value: TValue): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function renderSvgOutput(filePath: string, warnings: readonly string[]): string {
  return [`Rendered SVG to ${filePath}.`, ...warnings.map((warning) => `Warning: ${warning}`)].join(
    "\n",
  )
}

function currentAutoRepairRequestID(ctx: BuddyToolContext): string | undefined {
  const currentMessageID = String(ctx.messageID)
  if (isSvgAutoRepairMessageID(currentMessageID)) return currentMessageID
  const currentMessage = ctx.messages.find(
    (message) => String(message.info.id) === currentMessageID,
  )
  if (
    currentMessage?.info.role === "assistant" &&
    isSvgAutoRepairMessageID(String(currentMessage.info.parentID))
  ) {
    return String(currentMessage.info.parentID)
  }
  return undefined
}

const renderSvgTool = createBuddyTool({
  id: "render_svg",
  description: RENDER_SVG_DESCRIPTION,
  parameters: RenderSvgInputSchema,
  presentation: {
    archetype: "activity",
    icon: "diagram",
    renderer: "buddy-custom",
    layoutRole: "activity",
    phases: {
      pending: {
        action: "Rendering SVG",
        detail: ({ input }) => {
          const filePath = parseToolInputString(input.filePath)
          return filePath === undefined ? undefined : path.basename(filePath)
        },
      },
      running: {
        action: "Rendering SVG",
        detail: ({ input }) => {
          const filePath = parseToolInputString(input.filePath)
          return filePath === undefined ? undefined : path.basename(filePath)
        },
      },
      completed: {
        action: "Rendered SVG",
        detail: ({ input }) => {
          const filePath = parseToolInputString(input.filePath)
          return filePath === undefined ? undefined : path.basename(filePath)
        },
      },
      error: {
        action: "Failed to render SVG",
        detail: ({ input }) => {
          const filePath = parseToolInputString(input.filePath)
          return filePath === undefined ? undefined : path.basename(filePath)
        },
      },
    },
    summary: {
      category: "render-svg",
      pending: "Rendering SVGs",
      running: "Rendering SVGs",
      completed: "Rendered SVGs",
      error: "Failed to render SVGs",
    },
  },
  output: {
    maxLines: RENDER_SVG_OUTPUT_MAX_LINES,
    maxBytes: RENDER_SVG_OUTPUT_MAX_BYTES,
  },
  async execute(params: RenderSvgInput, ctx: BuddyToolContext) {
    const filePath = path.resolve(params.filePath)
    const repairRequestID = currentAutoRepairRequestID(ctx)
    const repairRequest = repairRequestID
      ? await readSvgAutoRepairRequest(ctx.directory, repairRequestID)
      : undefined
    const repairAttemptID = ctx.callID ? String(ctx.callID) : randomUUID()
    let authorizedTargetPath: string
    if (repairRequest) {
      if (repairRequest.sessionID !== String(ctx.sessionID)) {
        throw new Error("SVG auto-repair request does not belong to the current session.")
      }
      if (params.format !== repairRequest.format) {
        throw new Error(`Use the repair request format exactly: ${repairRequest.format}.`)
      }
      const scratchFile = svgAutoRepairScratchFile(ctx.directory, repairRequest.repairRequestID)
      if (filePath !== scratchFile) {
        throw new Error(`Use the exact temporary filePath from the repair prompt: ${scratchFile}`)
      }
      authorizedTargetPath = await resolveSvgAutoRepairStoragePath(ctx.directory, filePath)
      await beginSvgAutoRepairRenderAttempt({
        attemptID: repairAttemptID,
        directory: ctx.directory,
        requestID: repairRequest.repairRequestID,
      })
    } else {
      authorizedTargetPath = await authorizeFileWritePath(filePath, ctx)
      await ctx.ask({
        permission: RENDER_SVG_FILE_PERMISSION,
        patterns: [authorizedTargetPath],
        always: [authorizedTargetPath],
        metadata: {
          filePath: authorizedTargetPath,
          format: params.format,
        },
      })
    }

    try {
      const writeSnapshot = await captureTextFileWriteSnapshot(filePath)
      if (writeSnapshot.targetPath !== authorizedTargetPath) {
        throw new Error("SVG output path changed after authorization.")
      }
      const fileExisted = writeSnapshot.version !== null
      const rendered = await renderSvgSource({
        directory: ctx.directory,
        format: params.format,
        source: params.source,
        signal: ctx.abort,
      })
      ctx.abort.throwIfAborted()
      await writeTextFileAtomicLocked({
        targetPath: filePath,
        content: rendered.svg,
        expectedSnapshot: writeSnapshot,
      })
      if (repairRequest) {
        await completeSvgAutoRepairRenderAttempt({
          attemptID: repairAttemptID,
          directory: ctx.directory,
          requestID: repairRequest.repairRequestID,
          sourceHash: sha256Text(params.source),
        })
        scheduleSvgAutoRepairScratchCleanup(ctx.directory, repairRequest.repairRequestID)
      }

      if (!repairRequest) {
        publishFileSystemChange({
          directory: ctx.directory,
          filePath,
          event: fileExisted ? "change" : "add",
        })
      }

      return {
        title: `Rendered ${path.basename(filePath)}`,
        output: renderSvgOutput(filePath, rendered.warnings),
        metadata: {
          filePath,
          format: params.format,
        },
      }
    } catch (error) {
      if (!repairRequest) throw error
      const message = error instanceof Error ? error.message : String(error)
      const completed = await completeSvgAutoRepairRenderAttempt({
        attemptID: repairAttemptID,
        directory: ctx.directory,
        requestID: repairRequest.repairRequestID,
        sourceHash: sha256Text(params.source),
        errorMessage: message,
      })
      const exhausted = completed.status === "exhausted"
      throw new Error(
        [
          `SVG render attempt ${completed.renderAttempts} of ${SVG_AUTO_REPAIR_MAX_RENDER_ATTEMPTS} failed: ${message}`,
          exhausted
            ? "No render attempts remain. Do not call render_svg again."
            : "Revise the source from this renderer feedback, then call render_svg again using the same temporary filePath.",
        ].join("\n"),
        { cause: error },
      )
    }
  },
})

export { RenderSvgInputSchema, renderSvgTool }
export type { RenderSvgInput }
