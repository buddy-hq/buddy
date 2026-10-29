import type { Context } from "@opencode/plugin/promise/plugin"
import type { SessionContext } from "@opencode/plugin/promise/session"

const worktreeHint =
  "When you create a worktree outside the current working directory and intend to use it as your primary working directory, consider using `execute` to call `tools.opencode.session_move` and make the worktree the session's working directory."

function removeWorktreeHint(event: SessionContext): void {
  event.system = event.system.filter((part) => part.text !== worktreeHint)
}

export async function registerOpenCodeIdentity(
  ctx: Context,
  scope: "runtime" | "catalog",
): Promise<void> {
  await ctx.tool.transform((editor) =>
    editor.namespace({
      name: "opencode",
      description:
        "Tools for managing Buddy itself, such as working with sessions, searching the available models, and reading MCP resources.",
    }),
  )
  if (scope === "catalog") return
  await ctx.session.hook("context", removeWorktreeHint)
  await ctx.session.hook("compaction", removeWorktreeHint)
  await ctx.session.hook("generate", removeWorktreeHint)
}
