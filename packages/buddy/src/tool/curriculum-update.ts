import z from "zod"
import { CurriculumPath } from "../curriculum/curriculum-path.js"
import { CurriculumService } from "../curriculum/curriculum-service.js"
import { Instance } from "../project/instance.js"
import { Tool } from "./tool.js"

export const CurriculumUpdateTool = Tool.define("curriculum_update", {
  description: "Replace the project curriculum markdown document.",
  parameters: z.object({
    markdown: z.string().describe("Full markdown document for curriculum.md"),
  }),
  async execute(params, ctx) {
    const directory = Instance.directory
    const path = CurriculumPath.file(directory)

    await ctx.ask({
      permission: "curriculum_update",
      patterns: [path],
      always: ["*"],
      metadata: {
        path,
      },
    })

    const saved = await CurriculumService.write(directory, params.markdown)
    return {
      title: "curriculum.md",
      output: `Updated curriculum at ${saved.path}`,
      metadata: {
        path: saved.path,
      },
    }
  },
})
