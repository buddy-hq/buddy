import { AsyncLocalStorage } from "node:async_hooks"
import type { LearnerMemorySettings } from "./settings"

type LearnerMemoryLabSettingsOverride = Partial<LearnerMemorySettings>

type LearnerMemoryLabContext = {
  memoryRoot?: string
  settingsOverride?: LearnerMemoryLabSettingsOverride
}

const learnerMemoryLabContextStorage = new AsyncLocalStorage<LearnerMemoryLabContext>()

function runWithLearnerMemoryLabContext<T>(
  context: LearnerMemoryLabContext,
  fn: () => Promise<T>,
): Promise<T> {
  return learnerMemoryLabContextStorage.run(context, fn)
}

function currentLearnerMemoryLabContext(): LearnerMemoryLabContext | undefined {
  return learnerMemoryLabContextStorage.getStore()
}

function learnerMemoryLabRootOverride(): string | undefined {
  return currentLearnerMemoryLabContext()?.memoryRoot
}

function learnerMemoryLabSettingsOverride(): LearnerMemoryLabSettingsOverride | undefined {
  return currentLearnerMemoryLabContext()?.settingsOverride
}

export {
  learnerMemoryLabRootOverride,
  learnerMemoryLabSettingsOverride,
  runWithLearnerMemoryLabContext,
}
export type { LearnerMemoryLabSettingsOverride, LearnerMemoryLabContext }
