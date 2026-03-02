import fs from "node:fs/promises"
import z from "zod"
import { CurriculumPath } from "./path.js"
import { CurriculumService } from "./service.js"
import { EditTool, FileTime, Tool, WriteTool } from "@buddy/opencode-adapter/tool"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"

const registeredDirectories = new Set<string>()

async function executeWriteWithoutPrompt(
  ctx: Tool.Context,
  input: {
    filePath: string
    content: string
  },
) {
  const write = await WriteTool.init()
  return write.execute(input, {
    ...ctx,
    ask: async () => {},
  })
}

async function executeEditWithoutPrompt(
  ctx: Tool.Context,
  input: {
    filePath: string
    oldString: string
    newString: string
    replaceAll?: boolean
  },
) {
  const edit = await EditTool.init()
  return edit.execute(input, {
    ...ctx,
    ask: async () => {},
  })
}

async function syncCurriculumMirror(
  ctx: Tool.Context,
  directory: string,
) {
  const current = await CurriculumService.read(directory)
  const filepath = current.path
  const existing = await fs.readFile(filepath, "utf8").catch(() => undefined)

  await fs.mkdir(CurriculumPath.directory(directory), { recursive: true })

  if (existing !== current.markdown) {
    await fs.writeFile(filepath, current.markdown, "utf8")
  }

  FileTime.read(ctx.sessionID, filepath)
  return current
}

function curriculumReadTool(directory: string) {
  return Tool.define("curriculum_read", {
    description: "Read the current project curriculum markdown document.",
    parameters: z.object({}),
    async execute(_params: unknown, ctx: Tool.Context) {
      const filepath = CurriculumPath.file(directory)
      await ctx.ask({
        permission: "curriculum_read",
        patterns: [filepath],
        always: ["*"],
        metadata: {
          path: filepath,
        },
      })

      const current = await syncCurriculumMirror(ctx, directory)
      return {
        title: "curriculum.md",
        output: current.markdown,
        metadata: {
          path: current.path,
        },
      }
    },
  })
}

function curriculumUpdateTool(directory: string) {
  return Tool.define("curriculum_update", {
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
    async execute(params, ctx) {
      const filepath = CurriculumPath.file(directory)
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
        await syncCurriculumMirror(ctx, directory)
        const writeResult = await executeWriteWithoutPrompt(ctx, {
          filePath: filepath,
          content: markdown,
        })
        saved = await CurriculumService.persist(directory, markdown)
        output = writeResult.output.replace("Wrote file successfully.", `Updated curriculum at ${saved.path}`)
      } else {
        await syncCurriculumMirror(ctx, directory)

        const editResult = await executeEditWithoutPrompt(ctx, {
          filePath: filepath,
          oldString: params.oldString!,
          newString: params.newString!,
          replaceAll: params.replaceAll,
        })
        const nextMarkdown = await fs.readFile(filepath, "utf8")
        saved = await CurriculumService.persist(directory, nextMarkdown)
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
}

export async function ensureCurriculumToolsRegistered(directory: string) {
  if (registeredDirectories.has(directory)) return

  await OpenCodeInstance.provide({
    directory,
    async fn() {
      await ToolRegistry.register(curriculumReadTool(directory))
      await ToolRegistry.register(curriculumUpdateTool(directory))
    },
  })

  registeredDirectories.add(directory)
}
