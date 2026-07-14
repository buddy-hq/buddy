import { describe, expect, test } from "bun:test"
import { resolveConfig } from "vite"
import buddyWebVitePlugin from "../vite"

const MARKDOWN_WORKER_DEPENDENCIES = ["@shikijs/stream", "shiki"] as const
const LAZY_CHEMISTRY_DEPENDENCIES = [
  "indigo-ketcher",
  "ketcher-react",
  "ketcher-standalone",
] as const
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

  test("prebundles lazy chemistry dependencies for web development", async () => {
    const config = await resolveBuddyWebConfig(false)

    for (const dependency of LAZY_CHEMISTRY_DEPENDENCIES) {
      expect(config.optimizeDeps.include).toContain(dependency)
    }
  })

  test("prebundles lazy chemistry dependencies for Electron development", async () => {
    const config = await resolveBuddyWebConfig(true)

    for (const dependency of LAZY_CHEMISTRY_DEPENDENCIES) {
      expect(config.optimizeDeps.include).toContain(`${BUDDY_WEB_PACKAGE_NAME} > ${dependency}`)
    }
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
