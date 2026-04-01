import path from "node:path"
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs"

const packageDir = path.resolve(import.meta.dir, "..")
const distDir = path.resolve(packageDir, "dist")
const bundlesDir = path.resolve(distDir, "bundles")

if (!existsSync(distDir)) {
  throw new Error(`dist directory not found at ${distDir}`)
}

mkdirSync(bundlesDir, { recursive: true })

for (const entry of readdirSync(distDir, { withFileTypes: true })) {
  if (entry.name === "bundles") {
    continue
  }
  cpSync(path.join(distDir, entry.name), path.join(bundlesDir, entry.name), {
    recursive: true,
    force: true,
  })
}

console.log(`Copied bundles to ${bundlesDir}`)
