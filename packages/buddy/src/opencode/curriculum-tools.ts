import z from "zod"
import { CurriculumPath } from "../curriculum/curriculum-path.js"
import { CurriculumService } from "../curriculum/curriculum-service.js"
import { Tool } from "@buddy/opencode-adapter/tool"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"

const registeredDirectories = new Set<string>()

function curriculumReadTool(directory: string) {
  return Tool.define("curriculum_read", {
    description: "Read the current project curriculum markdown document.",
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
      },
    ) {
      const filepath = CurriculumPath.file(directory)
      await ctx.ask({
        permission: "curriculum_read",
        patterns: [filepath],
        always: ["*"],
        metadata: {
          path: filepath,
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
}

function curriculumUpdateTool(directory: string) {
  return Tool.define("curriculum_update", {
    description: "Replace the project curriculum markdown document.",
    parameters: z.object({
      markdown: z.string().describe("Full markdown document for curriculum.md"),
    }),
    async execute(
      params: { markdown: string },
      ctx: {
        ask(input: {
          permission: string
          patterns: string[]
          always: string[]
          metadata: Record<string, unknown>
        }): Promise<void>
      },
    ) {
      const filepath = CurriculumPath.file(directory)

      await ctx.ask({
        permission: "curriculum_update",
        patterns: [filepath],
        always: ["*"],
        metadata: {
          path: filepath,
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
