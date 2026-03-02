import fs from "node:fs/promises"
import z from "zod"
import { CurriculumPath } from "../path.js"
import { CurriculumService } from "../service.js"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import {
  executeEditWithoutPrompt,
  executeWriteWithoutPrompt,
  syncCurriculumMirror,
} from "./tool-helpers.js"

const curriculumUpdateTool = createBuddyTool("curriculum_update", {
  description:
    "Update the project curriculum markdown document. Prefer targeted replacements (`oldString` -> `newString`) for small changes like checking off tasks. Use full `markdown` only when rewriting the whole curriculum.",
  parameters: z
    .object({
      markdown: z.string().optional().describe("Full markdown document for curriculum.md (for complete rewrites)"),
      oldString: z.string().optional().describe("Exact text to replace inside curriculum.md"),
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
    const filepath = CurriculumPath.file(ctx.directory)
    await ctx.ask({
      permission: "curriculum_update",
      patterns: [filepath],
      always: ["*"],
      metadata: {
        path: filepath,
      },
    })

    let output = ""
    let saved: { path: string; markdown: string }

    if (typeof params.markdown === "string") {
      const markdown = params.markdown
      await syncCurriculumMirror(ctx, ctx.directory)
      const writeResult = await executeWriteWithoutPrompt(ctx, {
        filePath: filepath,
        content: markdown,
      })
      saved = await CurriculumService.persist(ctx.directory, markdown)
      output = writeResult.output.replace("Wrote file successfully.", `Updated curriculum at ${saved.path}`)
    } else {
      await syncCurriculumMirror(ctx, ctx.directory)

      const editResult = await executeEditWithoutPrompt(ctx, {
        filePath: filepath,
        oldString: params.oldString!,
        newString: params.newString!,
        replaceAll: params.replaceAll,
      })
      const nextMarkdown = await fs.readFile(filepath, "utf8")
      saved = await CurriculumService.persist(ctx.directory, nextMarkdown)
      output = editResult.output.replace("Edit applied successfully.", `Updated curriculum at ${saved.path}`)
    }

    return {
      title: "curriculum.md",
      output,
      metadata: {
        path: saved.path,
      },
    }
  },
})

export { curriculumUpdateTool }
