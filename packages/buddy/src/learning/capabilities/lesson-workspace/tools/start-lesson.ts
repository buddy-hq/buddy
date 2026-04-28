import START_LESSON_DESCRIPTION from "./start-lesson.md"
import z from "zod"
import { TeachingPath } from "../paths/path"
import { TeachingService } from "../service/operations"
import { TeachingLanguageSchema, type TeachingLanguage } from "../model/types"
import {
  createBuddyTool,
  EDITOR_PERSONA_SURFACE,
  type BuddyToolContext,
} from "../../../tools/create-buddy-tool"

const teachingStartLessonTool = createBuddyTool({
  id: "teaching_start_lesson",
  description: START_LESSON_DESCRIPTION,
  parameters: z.object({
    language: TeachingLanguageSchema.optional().describe(
      "Optional language for the initial lesson file, such as rs, js, or ts",
    ),
  }),
  async execute(
    params: {
      language?: TeachingLanguage
    },
    ctx: BuddyToolContext,
  ) {
    const language = params.language ?? "ts"
    const relativePath = `lesson${TeachingPath.extension(language)}`
    const lessonFilePath = TeachingPath.workspaceFile(ctx.directory, ctx.sessionID, relativePath)
    const checkpointFilePath = TeachingPath.checkpointSnapshotFile(
      ctx.directory,
      ctx.sessionID,
      relativePath,
    )

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

    const workspace = await TeachingService.ensure(ctx.directory, ctx.sessionID, language)
    return {
      title: "Interactive lesson started",
      output: `Teaching workspace is ready at ${workspace.lessonFilePath}`,
      metadata: workspace,
    }
  },
  capability: {
    surfaces: [EDITOR_PERSONA_SURFACE],
  },
})

export { teachingStartLessonTool }
