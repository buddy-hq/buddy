import path from "node:path"
import * as fs from "node:fs/promises"
import { createRequire } from "node:module"
import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import {
  LITEPARSE_PACKAGE_NAME,
  currentBackendNodeArtifactTarget,
  liteParseNativePackageName,
  nodePtyNativePackageName,
  parcelWatcherNativePackageName,
} from "../../script/backend-node-artifact"
import buddyWebVitePlugin from "../web/vite"

const webDir = path.resolve(__dirname, "../web")
const buddyDir = path.resolve(__dirname, "../buddy")
const BUDDY_SERVER_DIST = path.resolve(__dirname, "../buddy/dist/node")
const BUDDY_SERVER_ENTRY = path.resolve(BUDDY_SERVER_DIST, "node.js")
const MAIN_CHUNKS_DIR = path.resolve(__dirname, "out/main/chunks")
const nativeTarget = currentBackendNodeArtifactTarget()
const liteParseNativePkg = liteParseNativePackageName(nativeTarget)
const nodePtyPkg = nodePtyNativePackageName(nativeTarget)
const parcelWatcherPkg = parcelWatcherNativePackageName(nativeTarget)
const optionalRuntimeExternalPackages = ["@chonkiejs/token"] as const
const liteParseWrapperRuntimeEntries = ["dist", "package.json", "README.md", "LICENSE"] as const
const runtimePackages = [
  LITEPARSE_PACKAGE_NAME,
  liteParseNativePkg,
  nodePtyPkg,
  parcelWatcherPkg,
] as const
const require = createRequire(import.meta.url)
const liteParseRequire = createRequire(
  require.resolve(`${LITEPARSE_PACKAGE_NAME}/package.json`, {
    paths: [buddyDir],
  }),
)

function isMainExternal(id: string) {
  return (
    optionalRuntimeExternalPackages.some((packageName) => packageName === id) ||
    id.startsWith("cloudflare:")
  )
}

const channel = (() => {
  const raw = process.env.BUDDY_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

export default defineConfig({
  main: {
    define: {
      "import.meta.env.BUDDY_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: {
          index: "src/main/index.ts",
          "backend-utility": "src/main/backend-utility.ts",
        },
      },
      externalizeDeps: { include: [...runtimePackages] },
    },
    plugins: [
      {
        name: "buddy:runtime-externals",
        enforce: "pre",
        resolveId(id) {
          if (isMainExternal(id)) return { id, external: true }
        },
      },
      {
        name: "buddy:node-pty-narrower",
        enforce: "pre",
        resolveId(id) {
          if (id === "@lydell/node-pty") return nodePtyPkg
        },
      },
      {
        name: "buddy:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:buddy-server") return this.resolve(BUDDY_SERVER_ENTRY)
        },
      },
      {
        name: "buddy:copy-server-assets",
        async writeBundle() {
          await copyWasmAssets(BUDDY_SERVER_DIST, MAIN_CHUNKS_DIR)
          await copyRuntimePackages()
        },
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: "src/preload/index.ts",
        },
      },
    },
  },
  renderer: {
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
})

async function copyWasmAssets(sourceDir: string, destinationDir: string) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  await fs.mkdir(destinationDir, { recursive: true })

  for (const entry of entries) {
    const source = path.join(sourceDir, entry.name)
    const destination = path.join(destinationDir, entry.name)

    if (entry.isDirectory()) {
      await copyWasmAssets(source, destination)
      continue
    }

    if (entry.isFile() && entry.name.endsWith(".wasm")) {
      await fs.copyFile(source, destination)
    }
  }
}

async function copyRuntimePackages() {
  for (const packageName of runtimePackages) {
    const source = await resolveNativePackageDirectory(packageName)
    const destination = path.join(MAIN_CHUNKS_DIR, "node_modules", ...packageName.split("/"))
    await fs.rm(destination, { recursive: true, force: true })
    await fs.mkdir(path.dirname(destination), { recursive: true })
    if (packageName === LITEPARSE_PACKAGE_NAME) {
      await copyLiteParseWrapperPackage(source, destination)
      continue
    }
    await fs.cp(source, destination, { recursive: true, dereference: false })
  }
}

async function copyLiteParseWrapperPackage(source: string, destination: string) {
  await fs.mkdir(destination, { recursive: true })
  for (const entry of liteParseWrapperRuntimeEntries) {
    const sourceEntry = path.join(source, entry)
    if (!(await fileExists(sourceEntry))) continue
    await fs.cp(sourceEntry, path.join(destination, entry), {
      recursive: true,
      dereference: false,
    })
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
  if (packageName.startsWith(`${LITEPARSE_PACKAGE_NAME}-`)) {
    try {
      return liteParseRequire.resolve(`${packageName}/package.json`)
    } catch {
      return liteParseRequire.resolve(packageName)
    }
  }

  const resolveOptions = { paths: [buddyDir] }
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
