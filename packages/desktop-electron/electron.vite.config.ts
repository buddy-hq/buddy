import path from "node:path"
import * as fs from "node:fs/promises"
import { createRequire } from "node:module"
import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import { BUDDY_CHANNEL_ENV, readBuddyReleaseChannel } from "@buddy/script/channel"
import buddyWebVitePlugin from "../web/vite"
import { createElectronPreloadViteBuild } from "./scripts/in-app-browser-preload-artifact"

const webDir = path.resolve(__dirname, "../web")
const MAIN_OUTPUT_DIR = path.resolve(__dirname, "out/main")
const KEYRING_PACKAGE_NAME = "@napi-rs/keyring"
const WINDOWS_DPAPI_PACKAGE_NAME = "@primno/dpapi"
const NATIVE_ADDON_LOADER_PACKAGE_NAME = "node-gyp-build"
const keyringNativePkg = keyringNativePackageName()
const ELECTRON_MAIN_ESM_SHIM = `
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
`
const runtimePackages = [
  KEYRING_PACKAGE_NAME,
  WINDOWS_DPAPI_PACKAGE_NAME,
  NATIVE_ADDON_LOADER_PACKAGE_NAME,
] as const
const require = createRequire(import.meta.url)
const keyringRequire = createRequire(
  require.resolve(`${KEYRING_PACKAGE_NAME}/package.json`, {
    paths: [__dirname],
  }),
)
const windowsDpapiRequire = createRequire(
  require.resolve(`${WINDOWS_DPAPI_PACKAGE_NAME}/package.json`, {
    paths: [__dirname],
  }),
)
const channel = readBuddyReleaseChannel()

export default defineConfig(({ command }) => ({
  main: {
    define: {
      [`import.meta.env.${BUDDY_CHANNEL_ENV}`]: JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: {
          index: "src/main/index.ts",
        },
      },
      externalizeDeps: { include: [...runtimePackages], exclude: ["zod"] },
    },
    plugins: [
      {
        name: "buddy:electron-main-esm-shim",
        enforce: "post",
        renderChunk: {
          order: "pre",
          handler(code, _chunk, options) {
            if (options.format !== "es") return null
            return `${ELECTRON_MAIN_ESM_SHIM}${code}`
          },
        },
      },
      {
        name: "buddy:copy-credential-assets",
        async writeBundle() {
          if (command !== "build") return
          await copyCredentialRuntimePackages()
        },
      },
    ],
  },
  preload: {
    build: createElectronPreloadViteBuild(),
  },
  renderer: {
    define: {
      [`import.meta.env.${BUDDY_CHANNEL_ENV}`]: JSON.stringify(channel),
    },
    plugins: [
      ...buddyWebVitePlugin({ resolveOptimizeDepsFromLinkedWebPackage: true }),
      tanstackRouter({
        target: "react",
        routesDirectory: path.resolve(webDir, "src/routes"),
        generatedRouteTree: path.resolve(webDir, "src/routeTree.gen.ts"),
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
    ],
    root: "src/renderer",
    publicDir: path.resolve(__dirname, "public"),
    build: {
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
          loading: "src/renderer/loading.html",
        },
      },
    },
  },
}))

function keyringNativePackageName(): string {
  if (process.platform === "darwin") {
    return `${KEYRING_PACKAGE_NAME}-darwin-${process.arch}`
  }
  if (process.platform === "win32") {
    return `${KEYRING_PACKAGE_NAME}-win32-${process.arch}-msvc`
  }
  if (process.platform === "linux") {
    const abi = process.arch === "arm" ? "gnueabihf" : "gnu"
    return `${KEYRING_PACKAGE_NAME}-linux-${process.arch}-${abi}`
  }
  if (process.platform === "freebsd" && process.arch === "x64") {
    return `${KEYRING_PACKAGE_NAME}-freebsd-x64`
  }
  throw new Error(`Unsupported Keyring platform: ${process.platform}-${process.arch}`)
}

async function copyCredentialRuntimePackages() {
  for (const packageName of runtimePackages) {
    const source = await resolveNativePackageDirectory(packageName)
    const destination = path.join(MAIN_OUTPUT_DIR, "node_modules", ...packageName.split("/"))
    await fs.rm(destination, { recursive: true, force: true })
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.cp(source, destination, { recursive: true, dereference: false })
    if (packageName === KEYRING_PACKAGE_NAME) {
      const nativeEntry = keyringRequire.resolve(keyringNativePkg)
      await fs.copyFile(nativeEntry, path.join(destination, path.basename(nativeEntry)))
    }
  }
}

async function resolveNativePackageDirectory(packageName: string): Promise<string> {
  const entryPath = resolvePackageEntryPath(packageName)

  let currentDir = path.dirname(entryPath)
  while (true) {
    const manifestPath = path.join(currentDir, "package.json")
    if (await fileExists(manifestPath)) {
      return currentDir
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      throw new Error(`Could not locate package.json for ${packageName} from ${entryPath}`)
    }
    currentDir = parentDir
  }
}

function resolvePackageEntryPath(packageName: string): string {
  if (packageName === NATIVE_ADDON_LOADER_PACKAGE_NAME) {
    return windowsDpapiRequire.resolve(`${packageName}/package.json`)
  }
  const resolveOptions = { paths: [__dirname] }
  try {
    return require.resolve(`${packageName}/package.json`, resolveOptions)
  } catch {
    return require.resolve(packageName, resolveOptions)
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
