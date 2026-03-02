import { clearConfigOverlay, setConfigOverlay } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Config } from "../../src/config/config.js"
import { buildOpenCodeConfigOverlay } from "../../src/index.js"

export async function withSyncedOpenCodeConfig<T>(
  directory: string,
  fn: () => Promise<T> | T,
) {
  const config = await Config.getProject(directory)
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
