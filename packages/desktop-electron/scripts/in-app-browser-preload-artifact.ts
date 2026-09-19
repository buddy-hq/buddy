import { join } from "node:path"

/** Rollup input name. Electron-vite emits `[name].cjs` from this key. */
export const IN_APP_BROWSER_PRELOAD_ENTRY_NAME = "in-app-browser" as const

/** Filename session registration loads from compiled main `__dirname`. */
export const IN_APP_BROWSER_PRELOAD_FILE_NAME = "in-app-browser.cjs" as const

/**
 * Relative path from compiled main (`out/main`) to the guest preload.
 * Development output and packaged asar share this layout.
 */
export const IN_APP_BROWSER_PRELOAD_FROM_MAIN_DIRECTORY = join(
  "..",
  "preload",
  IN_APP_BROWSER_PRELOAD_FILE_NAME,
)

/**
 * Resolve the guest preload from compiled main `__dirname`.
 *
 * @param mainDirectory - Absolute `out/main` directory in development or inside asar.
 * @returns Absolute path of `out/preload/in-app-browser.cjs`.
 */
export function resolveInAppBrowserPreloadPathFromMainDirectory(mainDirectory: string): string {
  return join(mainDirectory, IN_APP_BROWSER_PRELOAD_FROM_MAIN_DIRECTORY)
}

/**
 * electron-vite `preload.build` that emits bundled CommonJS `in-app-browser.cjs`.
 *
 * @returns Preload Rollup options with deps inlined so the guest artifact is self-contained.
 */
export function createElectronPreloadViteBuild() {
  return {
    externalizeDeps: false as const,
    rollupOptions: {
      input: {
        index: "src/preload/index.ts",
        [IN_APP_BROWSER_PRELOAD_ENTRY_NAME]: "src/preload/in-app-browser.ts",
      },
      output: {
        format: "cjs" as const,
        entryFileNames: "[name].cjs" as const,
      },
    },
  }
}
