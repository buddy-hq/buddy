import { describe, expect, test } from "bun:test"
import { resolveConfig } from "vite"
import buddyWebVitePlugin from "../vite"

const MARKDOWN_WORKER_DEPENDENCIES = ["@shikijs/stream", "shiki"] as const
const SEPARATE_WASM_CHEMISTRY_DEPENDENCY = "indigo-ketcher/binaryWasm"
const BUDDY_WEB_PACKAGE_NAME = "@buddy/web"

describe("Buddy web Vite config", () => {
  test("prebundles lazy markdown worker dependencies for web development", async () => {
    const config = await resolveBuddyWebConfig(false)

    for (const dependency of MARKDOWN_WORKER_DEPENDENCIES) {
      expect(config.optimizeDeps.include).toContain(dependency)
    }
  })

  test("prebundles lazy markdown worker dependencies for Electron development", async () => {
    const config = await resolveBuddyWebConfig(true)

    for (const dependency of MARKDOWN_WORKER_DEPENDENCIES) {
      expect(config.optimizeDeps.include).toContain(`${BUDDY_WEB_PACKAGE_NAME} > ${dependency}`)
    }
  })

  test("does not prebundle the separate-WASM chemistry runtime for web development", async () => {
    const config = await resolveBuddyWebConfig(false)

    expect(config.optimizeDeps.include).not.toContain(SEPARATE_WASM_CHEMISTRY_DEPENDENCY)
    expect(config.optimizeDeps.exclude).toContain(SEPARATE_WASM_CHEMISTRY_DEPENDENCY)
  })

  test("does not prebundle the separate-WASM chemistry runtime for Electron development", async () => {
    const config = await resolveBuddyWebConfig(true)

    expect(config.optimizeDeps.include).not.toContain(
      `${BUDDY_WEB_PACKAGE_NAME} > ${SEPARATE_WASM_CHEMISTRY_DEPENDENCY}`,
    )
    expect(config.optimizeDeps.exclude).toContain(SEPARATE_WASM_CHEMISTRY_DEPENDENCY)
  })
})

async function resolveBuddyWebConfig(resolveFromLinkedWebPackage: boolean) {
  return resolveConfig(
    {
      configFile: false,
      logLevel: "silent",
      plugins: buddyWebVitePlugin({
        resolveOptimizeDepsFromLinkedWebPackage: resolveFromLinkedWebPackage,
      }),
    },
    "serve",
  )
}
