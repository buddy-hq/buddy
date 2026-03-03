import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import path from "node:path"
import { getCurrentSidecar } from "./utils"

const config = getCurrentSidecar()
const targetBundleDir = path.join(process.cwd(), "src-tauri", "target", config.rustTarget, "release", "bundle")
const fallbackBundleDir = path.join(process.cwd(), "src-tauri", "target", "release", "bundle")
const bundleDir = existsSync(targetBundleDir) ? targetBundleDir : fallbackBundleDir

if (!existsSync(bundleDir)) {
  throw new Error(`Bundle directory not found at ${bundleDir}`)
}

const bundlesOutDir = path.join(process.cwd(), "src-tauri", "target", "bundles")
mkdirSync(bundlesOutDir, { recursive: true })

for (const entry of readdirSync(bundleDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const entryDir = path.join(bundleDir, entry.name)
  for (const item of readdirSync(entryDir, { withFileTypes: true })) {
    const source = path.join(entryDir, item.name)
    const destination = path.join(bundlesOutDir, item.name)

    if (item.isDirectory()) {
      cpSync(source, destination, { recursive: true })
      continue
    }

    copyFileSync(source, destination)
  }
}

console.log(`Copied bundles to ${bundlesOutDir}`)
