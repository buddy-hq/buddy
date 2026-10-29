import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { optimizeDeps, resolveConfig } from "vite"
import buddyWebVitePlugin from "../vite"

const MARKDOWN_WORKER_DEPENDENCIES = ["@shikijs/stream", "shiki"] as const
const SEPARATE_WASM_CHEMISTRY_DEPENDENCY = "indigo-ketcher/binaryWasm"
const BUDDY_WEB_PACKAGE_NAME = "@buddy/web"

describe("Buddy web Vite config", () => {
  test.each([false, true])(
    "shares the EPUB constructor with Foliate's unbundled view (linked web: %s)",
    async (resolveFromLinkedWebPackage) => {
      const cacheDir = await mkdtemp(path.join(tmpdir(), "buddy-foliate-vite-"))
      try {
        const config = await resolveConfig(
          {
            configFile: false,
            envFile: false,
            root: fileURLToPath(new URL("..", import.meta.url)),
            cacheDir,
            logLevel: "silent",
            plugins: buddyWebVitePlugin({
              resolveOptimizeDepsFromLinkedWebPackage: resolveFromLinkedWebPackage,
            }),
            optimizeDeps: { entries: ["src/components/readers/foliate-book.ts"] },
          },
          "serve",
        )
        config.optimizeDeps.include = []
        const metadata = await optimizeDeps(config, true)
        const optimizedEpub = metadata.optimized["foliate-js/epub.js"]
        const directImport = optimizedEpub
          ? pathToFileURL(optimizedEpub.file).href
          : import.meta.resolve("foliate-js/epub.js")
        const directModule = await import(directImport)
        const viewModule = await import("foliate-js/epub.js")

        expect(metadata.optimized["foliate-js/view.js"]).toBeUndefined()
        expect(directModule.EPUB).toBe(viewModule.EPUB)
      } finally {
        await rm(cacheDir, { recursive: true, force: true })
      }
    },
  )

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
