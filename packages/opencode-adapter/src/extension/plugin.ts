import type { RuntimeExtension } from "@buddy/agent-runtime/extension"
import { Plugin } from "@opencode/plugin"
import type { OpenCodeHost } from "../host"
import { applyCommandInvocationDisplay } from "./command-display"
import { createPluginSessionAccess, registerExtensionHooks } from "./hooks"
import { registerNotebookConfig, removeSuppressedOpenCodeSkills } from "./notebook"
import { registerOpenCodeIdentity } from "./opencode-identity"
import { stripOpenCodeHeaders } from "./provider-headers"
import { createShellPermissionHook } from "./shell-permission"
import { askBuddyToolPermission, buddyToolToToolInfo } from "./tools"
import { registerToolInputStream } from "./tool-input-stream"
import { registerWebSearchDefault } from "./websearch-default"

export function createRuntimeExtensionPlugin(
  extension: RuntimeExtension,
  getClient: () => Promise<OpenCodeHost>,
  scope: "runtime" | "catalog" = "runtime",
): Plugin.Plugin {
  return Plugin.define({
    id: scope === "catalog" ? "buddy.catalog" : "buddy.runtime",
    async setup(ctx) {
      const cleanupNotebookConfig = await registerNotebookConfig(ctx, extension.notebookPlan)
      try {
        await registerWebSearchDefault(ctx.websearch)
        const directory = ctx.location.directory
        const tools = await extension.tools(ctx.location)
        await ctx.tool.transform((editor) => {
          for (const tool of tools) editor.add(buddyToolToToolInfo(tool, { directory, getClient }))
        })
        await ctx.skill.transform(removeSuppressedOpenCodeSkills)
        await registerOpenCodeIdentity(ctx, scope)
        if (scope === "catalog") return cleanupNotebookConfig
        await registerToolInputStream(ctx, tools)
        await ctx.session.hook("model.request", stripOpenCodeHeaders)
        await registerExtensionHooks(
          ctx,
          extension.hooks(ctx.location, createPluginSessionAccess(ctx)),
          getClient,
        )
        await ctx.tool.hook(
          "execute.before",
          createShellPermissionHook({
            location: ctx.location,
            getClient,
            ask: async (event, request, signal) =>
              askBuddyToolPermission(await getClient(), {
                sessionID: event.sessionID,
                agent: event.agent,
                messageID: event.messageID,
                callID: event.id,
                signal,
                request,
              }),
          }),
        )
        await ctx.session.hook("prompt", applyCommandInvocationDisplay)
        return cleanupNotebookConfig
      } catch (cause) {
        await cleanupNotebookConfig()
        throw cause
      }
    },
  })
}
