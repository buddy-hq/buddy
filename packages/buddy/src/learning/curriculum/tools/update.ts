import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"

const curriculumUpdateTool = createBuddyTool("curriculum_update", {
  description:
    "Deprecated tool. Curriculum is generated from learner state in this build and is no longer directly editable.",
  parameters: z
    .object({
      markdown: z.string().optional().describe("Deprecated full curriculum markdown payload"),
      oldString: z.string().optional().describe("Deprecated exact text to replace in a generated curriculum view"),
      newString: z.string().optional().describe("Replacement text for oldString"),
      replaceAll: z.boolean().optional().describe("Replace every match of oldString instead of just the first one"),
    })
    .refine(
      (value) =>
        typeof value.markdown === "string" ||
        (typeof value.oldString === "string" && typeof value.newString === "string"),
      {
        message: "Provide either `markdown`, or both `oldString` and `newString`.",
      },
    ),
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "curriculum_update",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        requested: Object.keys(params),
      },
    })

    return {
      title: "learning-plan",
      output:
        "The learning plan is generated from learner state in this build. Update goals, practice, or assessment records instead of editing it directly.",
      metadata: {
        deprecated: true,
      },
    }
  },
})

export { curriculumUpdateTool }
