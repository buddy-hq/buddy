import path from "node:path"
import {
  containsPath as withinInstancePath,
  context as instanceContext,
  type InstanceContext,
} from "opencode/project/instance-context"
import { InstanceRuntime } from "opencode/project/instance-runtime"
import type { Project } from "./project"

type TProvideInput<TResult> = {
  directory: string
  worktree?: string
  project?: Project.Info
  init?: () => Promise<void>
  fn: () => TResult
}

type TInstanceLoadInput = {
  directory: string
  worktree?: string
  project?: Project.Info
}

function resolveDirectory(directory: string) {
  return path.resolve(directory)
}

function toRuntimeLoadInput(input: TInstanceLoadInput) {
  return Object.assign(
    { directory: resolveDirectory(input.directory) },
    input.worktree ? { worktree: input.worktree } : undefined,
    input.project ? { project: input.project } : undefined,
  )
}

export const Instance = {
  async provide<TResult>(input: TProvideInput<TResult>): Promise<TResult> {
    const ctx = await InstanceRuntime.load(toRuntimeLoadInput(input))

    return instanceContext.provide(ctx, async () => {
      if (input.init) {
        await input.init()
      }
      return input.fn()
    })
  },
  get current(): InstanceContext {
    return instanceContext.use()
  },
  get directory() {
    return Instance.current.directory
  },
  get worktree() {
    return Instance.current.worktree
  },
  get project() {
    return Instance.current.project
  },
  containsPath(filepath: string, ctx?: InstanceContext): boolean {
    return withinInstancePath(filepath, ctx ?? Instance.current)
  },
  bind<TArgs extends readonly unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult {
    const ctx = Instance.current
    return (...args: TArgs) => instanceContext.provide(ctx, () => fn(...args))
  },
  restore<TResult>(ctx: InstanceContext, fn: () => TResult): TResult {
    return instanceContext.provide(ctx, fn)
  },
  async reload(input: TInstanceLoadInput): Promise<InstanceContext> {
    return InstanceRuntime.reloadInstance(toRuntimeLoadInput(input))
  },
  async dispose() {
    return InstanceRuntime.disposeInstance(Instance.current)
  },
  async disposeAll() {
    return InstanceRuntime.disposeAllInstances()
  },
}
