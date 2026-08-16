import path from "node:path"
import {
  containsPath as withinInstancePath,
  context as instanceContext,
  type InstanceContext,
} from "opencode/project/instance-context"
import { InstanceRuntime } from "opencode/project/instance-runtime"
import type { Project } from "./project"

type ProvideInput<R> = {
  directory: string
  worktree?: string
  project?: Project.Info
  init?: () => Promise<unknown>
  fn: () => R
}

function resolveDirectory(directory: string) {
  return path.resolve(directory)
}

export const Instance = {
  async provide<R>(input: ProvideInput<R>): Promise<R> {
    const directory = resolveDirectory(input.directory)
    const ctx = await InstanceRuntime.load({
      directory,
      ...(input.worktree ? { worktree: input.worktree } : {}),
      ...(input.project ? { project: input.project } : {}),
    })

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
  bind<F extends (...args: unknown[]) => unknown>(
    fn: F,
  ): (...args: Parameters<F>) => ReturnType<F> {
    const ctx = Instance.current
    return (...args: Parameters<F>) =>
      // SAFETY: The context provider returns the wrapped function's result without transforming it.
      instanceContext.provide(ctx, () => fn(...args)) as ReturnType<F>
  },
  restore<R>(ctx: InstanceContext, fn: () => R): R {
    return instanceContext.provide(ctx, fn)
  },
  async reload(input: Omit<ProvideInput<unknown>, "fn">): Promise<InstanceContext> {
    return InstanceRuntime.reloadInstance({
      directory: resolveDirectory(input.directory),
      ...(input.worktree ? { worktree: input.worktree } : {}),
      ...(input.project ? { project: input.project } : {}),
    })
  },
  async dispose() {
    return InstanceRuntime.disposeInstance(Instance.current)
  },
  async disposeAll() {
    return InstanceRuntime.disposeAllInstances()
  },
}
