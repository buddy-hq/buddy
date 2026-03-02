import { clearConfigOverlay, setConfigOverlay } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Config } from "../../src/config/config.js"
import { buildOpenCodeConfigOverlay } from "../../src/index.js"
import { Instance as BuddyInstance } from "../../src/project/instance.js"

export async function withSyncedOpenCodeConfig<T>(
  directory: string,
  fn: () => Promise<T> | T,
) {
  const config = await BuddyInstance.provide({
    directory,
    fn: () => Config.get(),
  })
  const overlay = await buildOpenCodeConfigOverlay(config)

  setConfigOverlay(directory, overlay)
  await OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeInstance.dispose(),
  })

  try {
    return await OpenCodeInstance.provide({
      directory,
      fn,
    })
  } finally {
    clearConfigOverlay(directory)
    await OpenCodeInstance.provide({
      directory,
      fn: () => OpenCodeInstance.dispose(),
    })
  }
}
