import type z from "zod"
import { Tool } from "@buddy/opencode-adapter/tool"

type BuddyToolMetadata = Record<string, unknown>
type BuddyToolContext<Metadata extends BuddyToolMetadata = BuddyToolMetadata> = Tool.Context<Metadata> & {
  directory: string
}

type BuddyToolInitResult<Parameters extends z.ZodType, Metadata extends BuddyToolMetadata> = Omit<
  Awaited<ReturnType<Tool.Info<Parameters, Metadata>["init"]>>,
  "execute"
> & {
  execute(
    args: z.infer<Parameters>,
    ctx: BuddyToolContext<Metadata>,
  ): ReturnType<Awaited<ReturnType<Tool.Info<Parameters, Metadata>["init"]>>["execute"]>
}

type BuddyToolInit<Parameters extends z.ZodType, Metadata extends BuddyToolMetadata> =
  | BuddyToolInitResult<Parameters, Metadata>
  | ((ctx?: Tool.InitContext) => Promise<BuddyToolInitResult<Parameters, Metadata>> | BuddyToolInitResult<Parameters, Metadata>)

type BuddyTool<Parameters extends z.ZodType = z.ZodType, Metadata extends BuddyToolMetadata = BuddyToolMetadata> = {
  id: string
  toTool(directory: string): Tool.Info<Parameters, Metadata>
}

function createBuddyTool<Parameters extends z.ZodType, Metadata extends BuddyToolMetadata>(
  id: string,
  init: BuddyToolInit<Parameters, Metadata>,
): BuddyTool<Parameters, Metadata> {
  return {
    id,
    toTool(directory: string) {
      return Tool.define<Parameters, Metadata>(id, async (initCtx) => {
        const definition = typeof init === "function" ? await init(initCtx) : init

        return {
          ...definition,
          async execute(args, ctx) {
            const nextCtx: BuddyToolContext<Metadata> = {
              ...ctx,
              directory,
            }

            return definition.execute(args, nextCtx)
          },
        }
      })
    },
  }
}

export {
  createBuddyTool,
}

export type {
  BuddyTool,
  BuddyToolContext,
  BuddyToolInit,
}
