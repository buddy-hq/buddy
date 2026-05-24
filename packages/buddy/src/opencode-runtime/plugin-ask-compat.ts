import { Effect } from "effect"
import type { ToolContext } from "@opencode-ai/plugin"
import { withCurrentInstance } from "@buddy/opencode-adapter/effect-runtime"

type PluginAskInput = Parameters<ToolContext["ask"]>[0]
type PluginAskResult = PromiseLike<void> | Effect.Effect<void, unknown, never>
type CompatiblePluginAskResult = Effect.Effect<void, never, never> & Promise<void>

function isPromiseLikeVoid(value: unknown): value is PromiseLike<void> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  )
}

function createCompatibleAskResult(): CompatiblePluginAskResult {
  const promise = Promise.resolve()
  const effect = Effect.sync(() => undefined)

  return Object.assign(promise, effect)
}

export function runCompatiblePluginAskResult(result: PluginAskResult): Promise<void> {
  if (isPromiseLikeVoid(result)) {
    return Promise.resolve(result)
  }

  return Effect.runPromise(withCurrentInstance(result))
}

export function createCompatiblePluginAskHandler(
  handler?: (input: PluginAskInput) => void,
): ToolContext["ask"] {
  return (input) => {
    handler?.(input)
    return createCompatibleAskResult()
  }
}
