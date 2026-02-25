import z from "zod"
import { CurriculumPath } from "../curriculum/curriculum-path.js"
import { CurriculumService } from "../curriculum/curriculum-service.js"

const registeredDirectories = new Set<string>()

type OpenCodeToolRegistry = {
  register(tool: unknown): Promise<void>
}

type OpenCodeToolNamespace = {
  define(
    id: string,
    init:
      | {
          description: string
          parameters: z.ZodTypeAny
          execute(
            args: any,
            ctx: {
              ask(input: {
                permission: string
                patterns: string[]
                always: string[]
                metadata: Record<string, unknown>
              }): Promise<void>
            },
          ): Promise<{
            title: string
            output: string
            metadata: Record<string, unknown>
          }>
        }
      | ((
          initCtx: unknown,
        ) => Promise<{
          description: string
          parameters: z.ZodTypeAny
          execute(
            args: any,
            ctx: {
              ask(input: {
                permission: string
                patterns: string[]
                always: string[]
                metadata: Record<string, unknown>
              }): Promise<void>
            },
          ): Promise<{
            title: string
            output: string
            metadata: Record<string, unknown>
          }>
        }>)
  ): unknown
}

type OpenCodeInstance = {
  provide<T>(input: { directory: string; fn: () => Promise<T> | T }): Promise<T>
}

async function modules() {
  const registryMod = (await (0, eval)(
    'import("../../../../vendor/opencode-core/src/tool/registry.ts")',
  )) as {
    ToolRegistry: OpenCodeToolRegistry
  }
  const toolMod = (await (0, eval)(
    'import("../../../../vendor/opencode-core/src/tool/tool.ts")',
  )) as {
    Tool: OpenCodeToolNamespace
  }
  const instanceMod = (await (0, eval)(
    'import("../../../../vendor/opencode-core/src/project/instance.ts")',
  )) as {
    Instance: OpenCodeInstance
  }

  return {
    ToolRegistry: registryMod.ToolRegistry,
    Tool: toolMod.Tool,
    Instance: instanceMod.Instance,
  }
}

function curriculumReadTool(Tool: OpenCodeToolNamespace, directory: string) {
  return Tool.define("curriculum_read", {
    description: "Read the current project curriculum markdown document.",
    parameters: z.object({}),
    async execute(_params, ctx) {
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

function curriculumUpdateTool(Tool: OpenCodeToolNamespace, directory: string) {
  return Tool.define("curriculum_update", {
    description: "Replace the project curriculum markdown document.",
    parameters: z.object({
      markdown: z.string().describe("Full markdown document for curriculum.md"),
    }),
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

  const { ToolRegistry, Tool, Instance } = await modules()
  await Instance.provide({
    directory,
    async fn() {
      await ToolRegistry.register(curriculumReadTool(Tool, directory))
      await ToolRegistry.register(curriculumUpdateTool(Tool, directory))
    },
  })

  registeredDirectories.add(directory)
}
