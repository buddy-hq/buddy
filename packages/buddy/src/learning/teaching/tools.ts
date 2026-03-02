import z from "zod"
import { Tool, WriteTool } from "@buddy/opencode-adapter/tool"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  TeachingService,
  TeachingWorkspaceFileError,
  TeachingWorkspaceNotFoundError,
} from "./teaching-service.js"
import { TeachingPath } from "./teaching-path.js"
import { TeachingLanguageSchema, type TeachingDiagnostic, type TeachingLanguage, type TeachingWorkspaceResponse } from "./types.js"

const registeredDirectories = new Set<string>()

function formatDiagnostic(diagnostic: TeachingDiagnostic) {
  const code = diagnostic.code === undefined ? "" : ` [${String(diagnostic.code)}]`
  const source = diagnostic.source ? ` (${diagnostic.source})` : ""
  return `${diagnostic.startLine}:${diagnostic.startColumn}-${diagnostic.endLine}:${diagnostic.endColumn} ${diagnostic.severity.toUpperCase()}${code}${source}: ${diagnostic.message}`
}

function appendWorkspaceDiagnostics(output: string, workspace: TeachingWorkspaceResponse) {
  const errors = workspace.diagnostics.filter((diagnostic) => diagnostic.severity === "error")
  if (errors.length === 0) {
    return output
  }

  return `${output}\n\nLSP errors detected in this file, please fix:\n<diagnostics file="${workspace.lessonFilePath}">\n${errors.map(formatDiagnostic).join("\n")}\n</diagnostics>`
}

async function executeWriteWithoutPrompt(
  ctx: Tool.Context,
  input: {
    filePath: string
    content: string
  },
) {
  const write = await WriteTool.init()
  return write.execute(input, {
    ...ctx,
    ask: async () => {},
  })
}

function teachingCheckpointTool(directory: string) {
  return Tool.define("teaching_checkpoint", {
    description: "Copy the active lesson file into its teaching checkpoint file.",
    parameters: z.object({}),
    async execute(
      _params: unknown,
      ctx: {
        ask(input: {
          permission: string
          patterns: string[]
          always: string[]
          metadata: Record<string, unknown>
        }): Promise<void>
        sessionID: string
      },
    ) {
      try {
        const current = await TeachingService.read(directory, ctx.sessionID)
        await ctx.ask({
          permission: "teaching_checkpoint",
          patterns: [current.checkpointFilePath],
          always: ["*"],
          metadata: {
            lessonFilePath: current.lessonFilePath,
            checkpointFilePath: current.checkpointFilePath,
          },
        })

        const checkpoint = await TeachingService.checkpoint(directory, ctx.sessionID)
        return {
          title: "Teaching checkpoint",
          output: `Checkpoint saved to ${checkpoint.checkpointFilePath}`,
          metadata: checkpoint,
        }
      } catch (error) {
        if (error instanceof TeachingWorkspaceNotFoundError) {
          throw new Error("No teaching workspace exists for this session yet")
        }
        throw error
      }
    },
  })
}

function teachingStartLessonTool(directory: string) {
  return Tool.define("teaching_start_lesson", {
    description:
      "Create the teaching workspace for this session when the learner explicitly wants to start a hands-on editor lesson. Use this before teaching_set_lesson if no interactive workspace exists yet.",
    parameters: z.object({
      language: TeachingLanguageSchema.optional().describe("Optional language for the initial lesson file, such as rs, js, or ts"),
    }),
    async execute(
      params: {
        language?: TeachingLanguage
      },
      ctx,
    ) {
      const language = params.language ?? "ts"
      const relativePath = `lesson${TeachingPath.extension(language)}`
      const lessonFilePath = TeachingPath.workspaceFile(directory, ctx.sessionID, relativePath)
      const checkpointFilePath = TeachingPath.checkpointSnapshotFile(directory, ctx.sessionID, relativePath)

      await ctx.ask({
        permission: "teaching_start_lesson",
        patterns: [lessonFilePath, checkpointFilePath],
        always: ["*"],
        metadata: {
          lessonFilePath,
          checkpointFilePath,
          language,
        },
      })

      const workspace = await TeachingService.ensure(directory, ctx.sessionID, language)
      return {
        title: "Interactive lesson started",
        output: `Teaching workspace is ready at ${workspace.lessonFilePath}`,
        metadata: workspace,
      }
    },
  })
}

function teachingSetLessonTool(directory: string) {
  return Tool.define("teaching_set_lesson", {
    description:
      "Replace the active lesson file in-place with a new canonical lesson scaffold and sync the teaching checkpoint to match it. This rewrites the current active teaching file without changing its path or file type. Use teaching_add_file first if you need a different file or extension.",
    parameters: z.object({
      content: z.string().describe("The full lesson content to place into the active editor file"),
    }),
    async execute(params: { content: string }, ctx) {
      try {
        const current = await TeachingService.read(directory, ctx.sessionID)
        await ctx.ask({
          permission: "teaching_set_lesson",
          patterns: [current.lessonFilePath, current.checkpointFilePath],
          always: ["*"],
          metadata: {
            lessonFilePath: current.lessonFilePath,
            checkpointFilePath: current.checkpointFilePath,
            language: current.language,
          },
        })

        const writeResult = await executeWriteWithoutPrompt(ctx, {
          filePath: current.lessonFilePath,
          content: params.content,
        })
        await TeachingService.checkpoint(directory, ctx.sessionID)
        const workspace = await TeachingService.read(directory, ctx.sessionID)
        return {
          title: "Teaching lesson updated",
          output: writeResult.output.replace(
            "Wrote file successfully.",
            `Lesson scaffold synced at ${workspace.lessonFilePath}`,
          ),
          metadata: workspace,
        }
      } catch (error) {
        if (error instanceof TeachingWorkspaceNotFoundError) {
          throw new Error("No teaching workspace exists for this session yet")
        }
        throw error
      }
    },
  })
}

function teachingRestoreCheckpointTool(directory: string) {
  return Tool.define("teaching_restore_checkpoint", {
    description: "Restore the active lesson file from the last accepted teaching checkpoint.",
    parameters: z.object({}),
    async execute(
      _params: unknown,
      ctx: {
        ask(input: {
          permission: string
          patterns: string[]
          always: string[]
          metadata: Record<string, unknown>
        }): Promise<void>
        sessionID: string
      },
    ) {
      try {
        const current = await TeachingService.read(directory, ctx.sessionID)
        await ctx.ask({
          permission: "teaching_restore_checkpoint",
          patterns: [current.lessonFilePath, current.checkpointFilePath],
          always: ["*"],
          metadata: {
            lessonFilePath: current.lessonFilePath,
            checkpointFilePath: current.checkpointFilePath,
          },
        })

        const workspace = await TeachingService.restore(directory, ctx.sessionID)
        return {
          title: "Teaching lesson restored",
          output: `Restored ${workspace.lessonFilePath} from the last accepted checkpoint`,
          metadata: workspace,
        }
      } catch (error) {
        if (error instanceof TeachingWorkspaceNotFoundError) {
          throw new Error("No teaching workspace exists for this session yet")
        }
        throw error
      }
    },
  })
}

function teachingAddFileTool(directory: string) {
  return Tool.define("teaching_add_file", {
    description:
      "Create a new tracked file inside the teaching workspace so lessons can span multiple files. The relativePath should include the intended extension (for example lesson.rs or vite.config.js). Only supply language when the path has no extension and you want Buddy to append one.",
    parameters: z.object({
      relativePath: z.string().describe("Workspace-relative path for the new file, for example helpers/math.ts"),
      content: z.string().optional().describe("Optional starter content for the new file"),
      language: TeachingLanguageSchema.optional().describe("Optional language mode used only when the path omits an extension"),
      activate: z.boolean().optional().describe("Whether the new file should become the active editor file"),
    }),
    async execute(
      params: {
        relativePath: string
        content?: string
        language?: TeachingLanguage
        activate?: boolean
      },
      ctx,
    ) {
      try {
        await TeachingService.read(directory, ctx.sessionID)
        const nextRelativePath = params.language
          ? TeachingPath.normalizeRelativePath(params.relativePath, params.language)
          : TeachingPath.normalizeRelativePath(params.relativePath)
        const filePath = TeachingPath.workspaceFile(directory, ctx.sessionID, nextRelativePath)
        const checkpointFilePath = TeachingPath.checkpointSnapshotFile(directory, ctx.sessionID, nextRelativePath)

        await ctx.ask({
          permission: "teaching_add_file",
          patterns: [filePath, checkpointFilePath],
          always: ["*"],
          metadata: {
            filePath,
            checkpointFilePath,
            activate: params.activate ?? true,
          },
        })

        const writeResult = await executeWriteWithoutPrompt(ctx, {
          filePath,
          content: params.content ?? "",
        })
        const workspace = await TeachingService.trackExistingFile(directory, ctx.sessionID, {
          relativePath: nextRelativePath,
          activate: params.activate,
        })
        return {
          title: "Teaching file created",
          output: writeResult.output.replace(
            "Wrote file successfully.",
            `Added ${nextRelativePath} to the teaching workspace`,
          ),
          metadata: workspace,
        }
      } catch (error) {
        if (error instanceof TeachingWorkspaceNotFoundError) {
          throw new Error("No teaching workspace exists for this session yet")
        }
        if (error instanceof TeachingWorkspaceFileError) {
          throw new Error(error.message)
        }
        throw error
      }
    },
  })
}

export async function ensureTeachingToolsRegistered(directory: string) {
  if (registeredDirectories.has(directory)) return

  await OpenCodeInstance.provide({
    directory,
    async fn() {
      await ToolRegistry.register(teachingStartLessonTool(directory))
      await ToolRegistry.register(teachingCheckpointTool(directory))
      await ToolRegistry.register(teachingAddFileTool(directory))
      await ToolRegistry.register(teachingSetLessonTool(directory))
      await ToolRegistry.register(teachingRestoreCheckpointTool(directory))
    },
  })

  registeredDirectories.add(directory)
}
