import { realpathSync } from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import { InstanceRef } from "opencode/effect/instance-ref"
import { makeRuntime } from "opencode/effect/run-service"
import * as OpenCodePlugin from "opencode/plugin/index"
import type { Hooks } from "@opencode-ai/plugin"
import { withCurrentInstance } from "./effect-runtime"

const runtime = makeRuntime(OpenCodePlugin.Service, OpenCodePlugin.defaultLayer)
const patchedServices = new WeakSet<OpenCodePlugin.Interface>()
const runtimePluginFactories = new Set<RuntimePluginFactory>()
const hookPromisesByInstance = new Map<string, Promise<Hooks[]>>()
const RUNTIME_HOOK_LOAD_FAILURE_MESSAGE = "Buddy runtime plugin hook load failed"
const RUNTIME_HOOK_TRIGGER_FAILURE_MESSAGE = "Buddy runtime plugin hook trigger failed"
const EMPTY_RUNTIME_HOOKS: Hooks[] = []

let patchPromise: Promise<void> | undefined

type RuntimePluginContext = {
  directory: string
  worktree: string
}

type RuntimePluginFactory = (context: RuntimePluginContext) => Promise<Hooks>
type TriggerName = {
  [K in keyof Hooks]-?: NonNullable<Hooks[K]> extends (input: any, output: any) => Promise<void>
    ? K
    : never
}[keyof Hooks]

function normalizePath(value: string) {
  const resolved = path.resolve(value)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function cacheKey(context: RuntimePluginContext) {
  return [normalizePath(context.directory), normalizePath(context.worktree)].join("::")
}

const getRuntimePluginContext = Effect.gen(function* () {
  const instance = yield* InstanceRef
  if (!instance) {
    return yield* Effect.die(new Error("InstanceRef not provided"))
  }

  const context: RuntimePluginContext = {
    directory: instance.directory,
    worktree: instance.worktree,
  }
  return context
})

function loadRuntimeHooks(context: RuntimePluginContext): Promise<Hooks[]> {
  const key = cacheKey(context)
  const existing = hookPromisesByInstance.get(key)
  if (existing) {
    return existing
  }

  const task = Promise.all([...runtimePluginFactories].map((factory) => factory(context))).catch(
    (error) => {
      hookPromisesByInstance.delete(key)
      throw error
    },
  )
  hookPromisesByInstance.set(key, task)
  return task
}

const getRuntimeHooks = Effect.fn("BuddyPlugin.getRuntimeHooks")(function* () {
  if (runtimePluginFactories.size === 0) {
    return EMPTY_RUNTIME_HOOKS
  }

  const context = yield* getRuntimePluginContext
  return yield* Effect.tryPromise({
    try: () => loadRuntimeHooks(context),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning(RUNTIME_HOOK_LOAD_FAILURE_MESSAGE).pipe(
        Effect.annotateLogs({ error }),
        Effect.as(EMPTY_RUNTIME_HOOKS),
      ),
    ),
  )
})

async function invokeRuntimeTrigger(
  hook: Hooks,
  name: TriggerName,
  input: unknown,
  output: unknown,
) {
  const fn = hook[name] as ((input: unknown, output: unknown) => Promise<void>) | undefined
  if (typeof fn !== "function") return
  await fn(input, output)
}

function ensurePatched(service: OpenCodePlugin.Interface) {
  if (patchedServices.has(service)) return
  patchedServices.add(service)

  const originalInit = service.init.bind(service)
  const originalList = service.list.bind(service)
  const originalTrigger = service.trigger.bind(service)

  const init = Effect.fn("BuddyPlugin.init")(function* () {
    yield* originalInit()
    yield* getRuntimeHooks()
  })

  const list = Effect.fn("BuddyPlugin.list")(function* () {
    const hooks = yield* originalList()
    const runtimeHooks = yield* getRuntimeHooks()
    return [...hooks, ...runtimeHooks]
  })

  const trigger = Effect.fn("BuddyPlugin.trigger")(function* <
    Name extends TriggerName,
    Input = Parameters<Required<Hooks>[Name]>[0],
    Output = Parameters<Required<Hooks>[Name]>[1],
  >(name: Name, input: Input, output: Output) {
    const next = yield* originalTrigger(name, input, output)
    const runtimeHooks = yield* getRuntimeHooks()

    for (const hook of runtimeHooks) {
      yield* Effect.tryPromise({
        try: () => invokeRuntimeTrigger(hook, name, input, next),
        catch: (error) => error,
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning(RUNTIME_HOOK_TRIGGER_FAILURE_MESSAGE).pipe(
            Effect.annotateLogs({ error, hook: name }),
          ),
        ),
      )
    }

    return next
  })

  Object.defineProperties(service, {
    init: { value: init },
    list: { value: list },
    trigger: { value: trigger },
  })
}

export async function ensurePluginServicePatched() {
  patchPromise ??= runtime
    .runPromise((svc) => withCurrentInstance(Effect.sync(() => ensurePatched(svc))))
    .catch((error) => {
      patchPromise = undefined
      throw error
    })
  await patchPromise
}

export function registerRuntimePluginFactory(factory: RuntimePluginFactory) {
  runtimePluginFactories.add(factory)
  hookPromisesByInstance.clear()
  return () => {
    runtimePluginFactories.delete(factory)
    hookPromisesByInstance.clear()
  }
}
