import z from "zod"
import { Tool } from "@buddy/opencode-adapter/tool"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  TeachingService,
  TeachingWorkspaceFileError,
  TeachingWorkspaceNotFoundError,
} from "./teaching-service.js"
import { TeachingPath } from "./teaching-path.js"

const registeredDirectories = new Set<string>()

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

function teachingSetLessonTool(directory: string) {
  return Tool.define("teaching_set_lesson", {
    description:
      "Replace the active lesson file with a new canonical lesson scaffold and sync the teaching checkpoint to match it. Use this when introducing or switching to a new exercise.",
    parameters: z.object({
      content: z.string().describe("The full lesson content to place into the active editor file"),
      language: z.enum(["ts", "tsx"]).optional().describe("Optional language mode for the lesson file"),
    }),
    async execute(
      params: {
        content: string
        language?: "ts" | "tsx"
      },
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
          permission: "teaching_set_lesson",
          patterns: [current.lessonFilePath, current.checkpointFilePath],
          always: ["*"],
          metadata: {
            lessonFilePath: current.lessonFilePath,
            checkpointFilePath: current.checkpointFilePath,
            language: params.language ?? current.language,
          },
        })

        const workspace = await TeachingService.setLesson(directory, ctx.sessionID, params)
        return {
          title: "Teaching lesson updated",
          output: `Lesson scaffold synced at ${workspace.lessonFilePath}`,
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
      "Create a new tracked file inside the teaching workspace so lessons can span multiple files. Use this before editing a file that does not exist yet.",
    parameters: z.object({
      relativePath: z.string().describe("Workspace-relative path for the new file, for example helpers/math.ts"),
      content: z.string().optional().describe("Optional starter content for the new file"),
      language: z.enum(["ts", "tsx"]).optional().describe("Optional language mode used to infer the file extension"),
      activate: z.boolean().optional().describe("Whether the new file should become the active editor file"),
    }),
    async execute(
      params: {
        relativePath: string
        content?: string
        language?: "ts" | "tsx"
        activate?: boolean
      },
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
        await TeachingService.read(directory, ctx.sessionID)
        const nextRelativePath = TeachingPath.normalizeRelativePath(params.relativePath, params.language ?? "ts")
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

        const workspace = await TeachingService.addFile(directory, ctx.sessionID, params)
        return {
          title: "Teaching file created",
          output: `Added ${nextRelativePath} to the teaching workspace`,
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
      await ToolRegistry.register(teachingCheckpointTool(directory))
      await ToolRegistry.register(teachingAddFileTool(directory))
      await ToolRegistry.register(teachingSetLessonTool(directory))
      await ToolRegistry.register(teachingRestoreCheckpointTool(directory))
    },
  })

  registeredDirectories.add(directory)
}
