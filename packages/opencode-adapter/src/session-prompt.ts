import * as OpenCodeSessionPrompt from "opencode/session/prompt"
import { makeRuntime } from "opencode/effect/run-service"
import { ensureSessionToolUiPatched } from "./session-tool-ui"

const runtime = makeRuntime(OpenCodeSessionPrompt.Service, OpenCodeSessionPrompt.defaultLayer)

export namespace SessionPrompt {
  export const PromptInput = OpenCodeSessionPrompt.PromptInput
  export type PromptInput = Parameters<OpenCodeSessionPrompt.Interface["prompt"]>[0]

  export const LoopInput = OpenCodeSessionPrompt.LoopInput
  export type LoopInput = Parameters<OpenCodeSessionPrompt.Interface["loop"]>[0]

  export const ShellInput = OpenCodeSessionPrompt.ShellInput
  export type ShellInput = Parameters<OpenCodeSessionPrompt.Interface["shell"]>[0]

  export const CommandInput = OpenCodeSessionPrompt.CommandInput
  export type CommandInput = Parameters<OpenCodeSessionPrompt.Interface["command"]>[0]

  export async function cancel(
    sessionID: Parameters<OpenCodeSessionPrompt.Interface["cancel"]>[0],
  ) {
    return runtime.runPromise((svc) => svc.cancel(sessionID))
  }

  export async function prompt(input: Parameters<OpenCodeSessionPrompt.Interface["prompt"]>[0]) {
    await ensureSessionToolUiPatched()
    return runtime.runPromise((svc) => svc.prompt(input))
  }

  export async function loop(input: Parameters<OpenCodeSessionPrompt.Interface["loop"]>[0]) {
    await ensureSessionToolUiPatched()
    return runtime.runPromise((svc) => svc.loop(input))
  }

  export async function shell(input: Parameters<OpenCodeSessionPrompt.Interface["shell"]>[0]) {
    await ensureSessionToolUiPatched()
    return runtime.runPromise((svc) => svc.shell(input))
  }

  export async function command(input: Parameters<OpenCodeSessionPrompt.Interface["command"]>[0]) {
    await ensureSessionToolUiPatched()
    return runtime.runPromise((svc) => svc.command(input))
  }

  export async function resolvePromptParts(template: string) {
    return runtime.runPromise((svc) => svc.resolvePromptParts(template))
  }
}
