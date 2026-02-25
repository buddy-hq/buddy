import path from "node:path"
import type { ToolContext } from "../opencode/vendor.js"
import { Instance } from "../project/instance.js"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
}

export async function assertExternalDirectory(ctx: ToolContext, target?: string, options?: Options) {
  if (!target) return
  if (options?.bypass) return

  const normalized = path.resolve(target)
  if (Instance.containsPath(normalized)) {
    return
  }

  const kind = options?.kind ?? "file"
  const parentDir = kind === "directory" ? normalized : path.dirname(normalized)
  const pattern = path.join(parentDir, "*")

  await ctx.ask({
    permission: "external_directory",
    patterns: [pattern],
    always: [pattern],
    metadata: {
      filepath: normalized,
      parentDir,
    },
  })
}
