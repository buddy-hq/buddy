#!/usr/bin/env bun

import path from "node:path"
import { z } from "zod"

const PackageJsonSchema = z.looseObject({
  workspaces: z
    .looseObject({
      packages: z.array(z.string()).optional(),
      catalog: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  patchedDependencies: z.record(z.string(), z.string()).optional(),
})

type PackageManifest = z.infer<typeof PackageJsonSchema>

const CHECK_FLAG = "--check"
const VENDOR_PATCH_PREFIX = "vendor/opencode/"

function sortRecord(input: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(input).toSorted(([left], [right]) => left.localeCompare(right)),
  )
}

function readCatalog(source: PackageManifest | undefined) {
  return source?.workspaces?.catalog ?? {}
}

function readPatches(source: PackageManifest) {
  return source.patchedDependencies ?? {}
}

function mergeVendorCatalog(input: {
  root: Record<string, string>
  vendor: Record<string, string>
}) {
  const merged = { ...input.root }
  const changed: string[] = []

  for (const [name, version] of Object.entries(input.vendor)) {
    if (merged[name] === version) {
      continue
    }
    merged[name] = version
    changed.push(name)
  }

  return {
    merged: sortRecord(merged),
    changed,
  }
}

function mergeVendorPatches(input: {
  root: Record<string, string>
  vendor: Record<string, string>
}) {
  const merged = Object.fromEntries(
    Object.entries(input.root).filter(
      ([name, patch]) => !patch.startsWith(VENDOR_PATCH_PREFIX) || name in input.vendor,
    ),
  )

  for (const [name, patch] of Object.entries(input.vendor)) {
    if (!patch.startsWith("patches/")) {
      throw new Error(`Unexpected upstream patch path for ${name}: ${patch}`)
    }
    if (merged[name] && !merged[name].startsWith(VENDOR_PATCH_PREFIX)) continue
    merged[name] = `${VENDOR_PATCH_PREFIX}${patch}`
  }

  return {
    merged: sortRecord(merged),
    changed: [...new Set([...Object.keys(input.root), ...Object.keys(merged)])].filter(
      (name) => input.root[name] !== merged[name],
    ),
  }
}

function packageJsonPaths() {
  const repoRoot = path.resolve(import.meta.dir, "..")
  return {
    repoRoot,
    rootPackageJson: path.join(repoRoot, "package.json"),
    vendorPackageJson: path.join(repoRoot, "vendor", "opencode", "package.json"),
  }
}

async function readPackageJson(filePath: string): Promise<PackageManifest> {
  const content = await Bun.file(filePath).text()
  const parsed = z.record(z.string(), z.unknown()).parse(JSON.parse(content))
  const validated = PackageJsonSchema.parse(parsed)
  return { ...parsed, ...validated }
}

async function main() {
  const checkOnly = process.argv.includes(CHECK_FLAG)
  const { rootPackageJson, vendorPackageJson } = packageJsonPaths()

  const root = await readPackageJson(rootPackageJson)
  const vendor = await readPackageJson(vendorPackageJson)

  const catalog = mergeVendorCatalog({
    root: readCatalog(root),
    vendor: readCatalog(vendor),
  })
  const patches = mergeVendorPatches({ root: readPatches(root), vendor: readPatches(vendor) })

  if (catalog.changed.length === 0 && patches.changed.length === 0) {
    console.log("OpenCode catalog and patches already aligned")
    return
  }

  if (checkOnly) {
    if (catalog.changed.length > 0)
      console.error(`OpenCode catalog drift: ${catalog.changed.join(", ")}`)
    if (patches.changed.length > 0)
      console.error(`OpenCode patch drift: ${patches.changed.join(", ")}`)
    process.exitCode = 1
    return
  }

  const nextRoot = {
    ...root,
    workspaces: {
      ...root.workspaces,
      catalog: catalog.merged,
    },
    patchedDependencies: patches.merged,
  }

  await Bun.write(rootPackageJson, `${JSON.stringify(nextRoot, null, 2)}\n`)
  if (catalog.changed.length > 0)
    console.log(`Aligned ${catalog.changed.length} OpenCode catalog entries: ${catalog.changed.join(", ")}`)
  if (patches.changed.length > 0)
    console.log(`Aligned ${patches.changed.length} OpenCode patches: ${patches.changed.join(", ")}`)
}

await main()
