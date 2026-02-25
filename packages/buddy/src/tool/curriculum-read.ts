import z from "zod"
import { CurriculumPath } from "../curriculum/curriculum-path.js"
import { CurriculumService } from "../curriculum/curriculum-service.js"
import { Instance } from "../project/instance.js"
import { Tool } from "../opencode/vendor.js"

export const CurriculumReadTool = Tool.define("curriculum_read", {
  description: "Read the current project curriculum markdown document.",
  parameters: z.object({}),
  async execute(_params, ctx) {
    const directory = Instance.directory
    const path = CurriculumPath.file(directory)

    await ctx.ask({
      permission: "curriculum_read",
      patterns: [path],
      always: ["*"],
      metadata: {
        path,
      },
    })

    const current = await CurriculumService.read(directory)

    return {
      title: "curriculum.md",
      output: current.markdown,
      metadata: {
        path: current.path,
      },
    }
  },
})
