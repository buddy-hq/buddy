import { describe, expect, test } from "bun:test"
import path from "node:path"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"

const packageRoot = path.resolve(import.meta.dir, "..")
const srcRoot = path.join(packageRoot, "src")
const testRoot = path.join(packageRoot, "test")

const MODULE_ROOTS = [
  "config",
  "flag",
  "http",
  "learning/adapters/http",
  "learning/agent-execution",
  "learning/agents/capabilities",
  "learning/agents/core",
  "learning/agents/curriculum",
  "learning/agents/personas",
  "learning/agents/skills",
  "learning/learner-model",
  "learning/shared",
  "openapi",
  "opencode-runtime",
  "project",
  "routes",
  "session",
  "storage",
] as const

const importFromRegex = /\b(?:import|export)\b[\s\S]*?\bfrom\s*["']([^"']+)["']/g
const importOnlyRegex = /\bimport\s*["']([^"']+)["']/g
const dynamicImportRegex = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g

function listTypeScriptFiles(root: string): string[] {
  const entries = readdirSync(root)
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(root, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath))
      continue
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(fullPath)
    }
  }

  return files
}

function collectRelativeImports(sourceText: string): string[] {
  const values = new Set<string>()
  for (const regex of [importFromRegex, importOnlyRegex, dynamicImportRegex]) {
    regex.lastIndex = 0
    for (const match of sourceText.matchAll(regex)) {
      const specifier = match[1]
      if (specifier.startsWith(".")) {
        values.add(specifier)
      }
    }
  }
  return [...values]
}

function resolveImport(filePath: string, specifier: string): string | undefined {
  const absoluteBase = path.resolve(path.dirname(filePath), specifier)
  const withExt = path.extname(absoluteBase).length > 0
  const candidates = withExt
    ? [absoluteBase]
    : [
        `${absoluteBase}.ts`,
        `${absoluteBase}.tsx`,
        path.join(absoluteBase, "index.ts"),
        path.join(absoluteBase, "index.tsx"),
      ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return path.normalize(candidate)
    }
  }

  return undefined
}

function resolveModuleRoot(filePath: string): string | undefined {
  if (!filePath.startsWith(`${srcRoot}${path.sep}`)) return undefined
  const relativePath = path.relative(srcRoot, filePath).split(path.sep).join("/")
  for (const root of MODULE_ROOTS) {
    if (relativePath === root || relativePath.startsWith(`${root}/`)) {
      return root
    }
  }
  return undefined
}

describe("module boundaries", () => {
  test("cross-module imports use index entrypoints only", () => {
    const importers = [...listTypeScriptFiles(srcRoot), ...listTypeScriptFiles(testRoot)]
    const violations: string[] = []

    for (const importer of importers) {
      const sourceText = readFileSync(importer, "utf8")
      const importerModuleRoot = resolveModuleRoot(importer)
      const relativeImports = collectRelativeImports(sourceText)
      for (const specifier of relativeImports) {
        const target = resolveImport(importer, specifier)
        if (!target) continue
        if (!target.startsWith(`${srcRoot}${path.sep}`)) continue

        const targetModuleRoot = resolveModuleRoot(target)
        if (!targetModuleRoot) continue
        if (importerModuleRoot === targetModuleRoot) continue

        const pointsToModuleSurface = target.endsWith(`${path.sep}index.ts`)
        if (pointsToModuleSurface) continue

        violations.push(
          `${path.relative(packageRoot, importer)} -> ${specifier} (${path.relative(packageRoot, target)})`,
        )
      }
    }

    expect(violations).toEqual([])
  })
})
