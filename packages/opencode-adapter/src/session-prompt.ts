import * as OpenCodeSessionPrompt from "opencode/session/prompt"
import type * as OpenCodeMessageV2 from "opencode/session/message-v2"
import { makeRuntime } from "opencode/effect/run-service"
import { ensureSessionToolUiPatched } from "./session-tool-ui"

const runtime = makeRuntime(OpenCodeSessionPrompt.Service, OpenCodeSessionPrompt.defaultLayer)
type SessionPromptInput = Parameters<OpenCodeSessionPrompt.Interface["prompt"]>[0]
type SessionPromptOutput = OpenCodeMessageV2.MessageV2.WithParts
type PromptInputInterceptor = (input: {
  promptInput: SessionPromptInput
  run: (input: SessionPromptInput) => Promise<SessionPromptOutput>
}) => Promise<SessionPromptOutput>

const promptInputInterceptors = new Set<PromptInputInterceptor>()

async function runPromptInterceptors(
  input: SessionPromptInput,
  run: (input: SessionPromptInput) => Promise<SessionPromptOutput>,
) {
  const interceptors = [...promptInputInterceptors]
  let nextRun = run

  for (let index = interceptors.length - 1; index >= 0; index -= 1) {
    const interceptor = interceptors[index]
    const currentRun = nextRun
    nextRun = (nextInput) =>
      interceptor({
        promptInput: nextInput,
        run: currentRun,
      })
  }

  return nextRun(input)
}

export namespace SessionPrompt {
  export const PromptInput = OpenCodeSessionPrompt.PromptInput
  export type PromptInput = SessionPromptInput

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
    return runPromptInterceptors(input, (nextInput) =>
      runtime.runPromise((svc) => svc.prompt(nextInput)),
    )
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

  export function registerPromptInputInterceptor(interceptor: PromptInputInterceptor) {
    promptInputInterceptors.add(interceptor)
    return () => {
      promptInputInterceptors.delete(interceptor)
    }
  }
}
