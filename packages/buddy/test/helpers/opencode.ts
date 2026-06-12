import { clearConfigOverlay, setConfigOverlay } from "@buddy/opencode-adapter/config"
import { RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS } from "@buddy/opencode-adapter/config-overlay"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Config } from "@buddy/backend/config"
import { buildOpenCodeConfigOverlay } from "../../src/index"

async function disposeInstance(directory: string) {
  await OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeInstance.dispose(),
  })
}

export async function withSyncedOpenCodeConfig<T>(directory: string, fn: () => Promise<T> | T) {
  const config = await Config.getProject(directory)
  const overlay = await buildOpenCodeConfigOverlay({
    config,
    directory,
  })

  setConfigOverlay(directory, overlay, {
    authoritativeKeys: [RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS.mcp],
  })
  await disposeInstance(directory)

  try {
    return await OpenCodeInstance.provide({
      directory,
      fn,
    })
  } finally {
    clearConfigOverlay(directory)
    await disposeInstance(directory)
  }
}
