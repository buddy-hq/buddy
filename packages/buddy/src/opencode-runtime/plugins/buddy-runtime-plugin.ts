import { Plugin, type SessionContext } from "@buddy/opencode-adapter/plugin"
import { registerNotebookConfig } from "../../config/runtime/notebook-config-plugin"
import { PRODUCTION_PERSONAS } from "../../learning/shared/teaching-vocabulary"
import { captureSessionSystemPrompt } from "../system-prompt-capture"
import { removeSuppressedOpenCodeSkills } from "../hidden-opencode-skills"
import { applyCommandInvocationDisplay } from "../command-display"
import { allBuddyPluginTools, type BuddyToolRuntime } from "../buddy-tool-shim"
import { readTeachingSessionState } from "../../learning/agent-execution/state/session-state"
import { resolveConciseResponses } from "../../learning/shared/concise-responses"
import { stripConciseResponseInstructions } from "../../learning/personas/prompts/concise-response-control"
import { cleanupBenchCapturesForSession } from "../../learning/features/bench/captures"
import { registerBuddySubagentHooks } from "./buddy-subagents"
import { applyBuddyPromptContext } from "../../learning/agent-execution/transforms/prompt-context"

const PRODUCTION_PERSONA_IDS = new Set<string>(PRODUCTION_PERSONAS)

type TextVerbosityOptions = SessionContext["options"]

export function applyConciseResponseTextVerbosity(input: {
  agent: string
  conciseResponses: boolean
  options: TextVerbosityOptions
}): void {
  if (!PRODUCTION_PERSONA_IDS.has(input.agent) || input.conciseResponses) return
  if (input.options.textVerbosity === "low") input.options.textVerbosity = "medium"
}

function keepInstructionSource(source: string): boolean {
  const normalized = source.trim().replaceAll("\\", "/")
  if (!normalized.startsWith("/") && !/^[a-z]:\//i.test(normalized)) return true
  const filename = normalized.split("/").at(-1)?.toLowerCase()
  return filename !== "claude.md" && filename !== "context.md"
}

function filterInstructionBlocks(text: string): string {
  const headers = [...text.matchAll(/^Instructions from:\s+(.+)$/gm)]
  const first = headers[0]
  if (!first) return text
  const kept = [text.slice(0, first.index)]
  for (const [index, header] of headers.entries()) {
    if (keepInstructionSource(header[1] ?? "")) {
      kept.push(text.slice(header.index, headers[index + 1]?.index ?? text.length))
    }
  }
  return kept.join("").trim()
}

async function transformSessionContext(directory: string, event: SessionContext) {
  const state = readTeachingSessionState(directory, event.sessionID)
  if (PRODUCTION_PERSONA_IDS.has(event.agent)) {
    const conciseResponses = state?.conciseResponses ?? resolveConciseResponses(
      await (await import("../../config/runtime/project-config")).readProjectConfig(directory),
    )
    applyConciseResponseTextVerbosity({ agent: event.agent, conciseResponses, options: event.options })
  }
  const baseConciseResponses = state?.baseConciseResponses ?? state?.conciseResponses ?? true
  event.system = event.system.flatMap((part) => {
    let text = filterInstructionBlocks(part.text)
    if (state && !baseConciseResponses) {
      text = stripConciseResponseInstructions({ persona: state.persona, systemPrompt: text })
    }
    text = text.trim()
    return text ? [{ ...part, text }] : []
  })
  await captureSessionSystemPrompt({
    directory, sessionID: event.sessionID,
    fullSystemPrompt: event.system.map((part) => part.text).join("\n\n"),
  })
}

export type BuddyRuntimePluginOptions = Omit<BuddyToolRuntime, "directory"> & {
  loadTools?: typeof allBuddyPluginTools
}

export function createBuddyRuntimePlugin(options: BuddyRuntimePluginOptions, scope: "runtime" | "catalog" = "runtime"): Plugin.Plugin {
  return Plugin.define({
    id: scope === "catalog" ? "buddy.catalog" : "buddy.runtime",
    async setup(ctx) {
      const cleanupNotebookConfig = await registerNotebookConfig(ctx)
      const directory = ctx.location.directory
      const tools = await (options.loadTools ?? allBuddyPluginTools)({ ...options, directory })
      await ctx.tool.transform((editor) => {
        for (const tool of tools) editor.add(tool)
      })
      await ctx.skill.transform(removeSuppressedOpenCodeSkills)
      if (scope === "catalog") return cleanupNotebookConfig
      await registerBuddySubagentHooks(ctx)
      await ctx.session.hook("context", async (event) => {
        await applyBuddyPromptContext(event, await ctx.session.context({ sessionID: event.sessionID }), await options.getClient())
        await transformSessionContext(directory, event)
      })
      await ctx.session.hook("prompt", applyCommandInvocationDisplay)
      const controller = new AbortController()
      const events = (async () => {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event.type === "session.execution.succeeded" || event.type === "session.execution.failed" ||
            event.type === "session.execution.interrupted") {
            await cleanupBenchCapturesForSession(event.data.sessionID)
          }
        }
      })().catch((cause) => {
        if (!controller.signal.aborted) console.error("Buddy execution cleanup subscription failed", cause)
      })
      return async () => {
        controller.abort()
        await events
        await cleanupNotebookConfig()
      }
    },
  })
}
