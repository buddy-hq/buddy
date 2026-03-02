import z from "zod"
import { TeachingPath } from "../path.js"
import { TeachingService } from "../service.js"
import { TeachingLanguageSchema, type TeachingLanguage } from "../types.js"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"

const teachingStartLessonTool = createBuddyTool("teaching_start_lesson", {
  description:
    "Create the teaching workspace for this session when the learner explicitly wants to start a hands-on editor lesson. Use this before teaching_set_lesson if no interactive workspace exists yet.",
  parameters: z.object({
    language: TeachingLanguageSchema.optional().describe("Optional language for the initial lesson file, such as rs, js, or ts"),
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
    const checkpointFilePath = TeachingPath.checkpointSnapshotFile(ctx.directory, ctx.sessionID, relativePath)

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
})

export { teachingStartLessonTool }
