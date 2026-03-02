import z from "zod"
import { CurriculumPath } from "../path.js"
import { syncCurriculumMirror } from "./tool-helpers.js"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"

const curriculumReadTool = createBuddyTool("curriculum_read", {
  description: "Read the current project curriculum markdown document.",
  parameters: z.object({}),
  async execute(_params: unknown, ctx: BuddyToolContext) {
    const filepath = CurriculumPath.file(ctx.directory)
    await ctx.ask({
      permission: "curriculum_read",
      patterns: [filepath],
      always: ["*"],
      metadata: {
        path: filepath,
      },
    })

    const current = await syncCurriculumMirror(ctx, ctx.directory)
    return {
      title: "curriculum.md",
      output: current.markdown,
      metadata: {
        path: current.path,
      },
    }
  },
})

export { curriculumReadTool }
