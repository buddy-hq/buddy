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
})

type PackageManifest = z.infer<typeof PackageJsonSchema>

const CHECK_FLAG = "--check"

function sortRecord(input: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(input).toSorted(([left], [right]) => left.localeCompare(right)),
  )
}

function readCatalog(source: PackageManifest | undefined) {
  return source?.workspaces?.catalog ?? {}
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
  const parsed: unknown = JSON.parse(content)
  return PackageJsonSchema.parse(parsed)
}

async function main() {
  const checkOnly = process.argv.includes(CHECK_FLAG)
  const { rootPackageJson, vendorPackageJson } = packageJsonPaths()

  const root = await readPackageJson(rootPackageJson)
  const vendor = await readPackageJson(vendorPackageJson)

  const result = mergeVendorCatalog({
    root: readCatalog(root),
    vendor: readCatalog(vendor),
  })

  if (result.changed.length === 0) {
    console.log("OpenCode catalog already aligned")
    return
  }

  if (checkOnly) {
    console.error(
      `OpenCode catalog drift detected for ${result.changed.length} entries: ${result.changed.join(", ")}`,
    )
    process.exitCode = 1
    return
  }

  const nextRoot = {
    ...root,
    workspaces: {
      ...root.workspaces,
      catalog: result.merged,
    },
  }

  await Bun.write(rootPackageJson, `${JSON.stringify(nextRoot, null, 2)}\n`)
  console.log(
    `Aligned ${result.changed.length} OpenCode catalog entries: ${result.changed.join(", ")}`,
  )
}

await main()
