import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/tools/create-buddy-tool"
import { QuestionSetService } from "../service"
import {
  RenderSavedQuestionSetInputSchema,
  RenderSavedQuestionSetOutputSchema,
  type RenderSavedQuestionSetInput,
  type RenderSavedQuestionSetOutput,
} from "../types"

const renderSavedQuestionSetTool = createBuddyTool("render_saved_question_set", {
  description:
    "Render a previously saved question set by artifact id for inline chat display and sidebar indexing.",
  parameters: RenderSavedQuestionSetInputSchema,
  async execute(params: RenderSavedQuestionSetInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "render_saved_question_set",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        artifactID: params.artifactID,
      },
    })

    const parsed = RenderSavedQuestionSetInputSchema.parse(params)
    const artifact = await QuestionSetService.read(ctx.directory, parsed.artifactID)

    const output: RenderSavedQuestionSetOutput = RenderSavedQuestionSetOutputSchema.parse({
      artifactID: artifact.artifactID,
      kind: artifact.kind,
      groupType: artifact.groupType,
      title: artifact.title,
      questionCount: artifact.questions.length,
      artifactUrl: QuestionSetService.buildArtifactUrl(ctx.directory, artifact.artifactID),
    })

    return {
      title: "Rendered saved question set",
      output: JSON.stringify(output, null, 2),
      metadata: {
        artifact: "RenderSavedQuestionSetOutput",
        value: output,
      },
    }
  },
})

export { renderSavedQuestionSetTool }
