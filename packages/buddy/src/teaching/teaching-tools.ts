import z from "zod"
import { Tool } from "@buddy/opencode-adapter/tool"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  TeachingService,
  TeachingWorkspaceNotFoundError,
} from "./teaching-service.js"

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

export async function ensureTeachingToolsRegistered(directory: string) {
  if (registeredDirectories.has(directory)) return

  await OpenCodeInstance.provide({
    directory,
    async fn() {
      await ToolRegistry.register(teachingCheckpointTool(directory))
      await ToolRegistry.register(teachingSetLessonTool(directory))
      await ToolRegistry.register(teachingRestoreCheckpointTool(directory))
    },
  })

  registeredDirectories.add(directory)
}
