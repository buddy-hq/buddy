#!/usr/bin/env bun

import { readFileSync } from "node:fs"
import path from "node:path"

type Finding = {
  file: string
  message: string
}

const REPO_ROOT = path.resolve(import.meta.dir, "..")
const DESKTOP_PACKAGE_MANIFEST = "packages/desktop-electron/package.json"
const WORKSPACE_VERSION_PREFIX = "workspace:"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toPosix(value: string) {
  return value.split(path.sep).join("/")
}

function toRepoPath(absolutePath: string) {
  return toPosix(path.relative(REPO_ROOT, absolutePath))
}

async function scanFiles(pattern: string): Promise<string[]> {
  const matches: string[] = []
  for await (const value of new Bun.Glob(pattern).scan({
    cwd: REPO_ROOT,
    absolute: true,
    onlyFiles: true,
  })) {
    if (
      value.includes(`${path.sep}node_modules${path.sep}`) ||
      value.includes(`${path.sep}dist${path.sep}`) ||
      value.includes(`${path.sep}.turbo${path.sep}`)
    ) {
      continue
    }
    matches.push(path.normalize(value))
  }
  return matches
}

function getImportSpecifiers(content: string): string[] {
  const matches = new Set<string>()
  const fromRegex = /\b(?:import|export)\s+(?:[^"'`]*?\sfrom\s*)?["']([^"']+)["']/g
  const dynamicImportRegex = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g

  let next: RegExpExecArray | null
  while ((next = fromRegex.exec(content)) !== null) {
    matches.add(next[1])
  }
  while ((next = dynamicImportRegex.exec(content)) !== null) {
    matches.add(next[1])
  }

  return [...matches]
}

function getPackageNameFromAbsolutePath(file: string): string | null {
  const normalized = toPosix(file)
  const marker = "/packages/"
  const start = normalized.indexOf(marker)
  if (start < 0) return null
  const segment = normalized.slice(start + marker.length)
  const [packageName] = segment.split("/")
  return packageName || null
}

function checkViteAliasContract(findings: Finding[]) {
  const viteConfigs = [
    "packages/web/vite.config.ts",
    "packages/desktop-electron/electron.vite.config.ts",
  ]
  const forbiddenAliasPattern = /find:\s*(?:\/\^@\\\/|["']@\/)/g

  for (const relativePath of viteConfigs) {
    const absolutePath = path.join(REPO_ROOT, relativePath)
    const content = readFileSync(absolutePath, "utf8")
    if (!forbiddenAliasPattern.test(content)) continue
    findings.push({
      file: relativePath,
      message: 'Found forbidden Vite alias remap for "@/...". Use package imports instead.',
    })
  }
}

function checkDesktopRuntimeDependencies(findings: Finding[]) {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(REPO_ROOT, DESKTOP_PACKAGE_MANIFEST), "utf8"),
  )
  if (!isRecord(manifest) || !isRecord(manifest.dependencies)) return

  for (const [packageName, version] of Object.entries(manifest.dependencies)) {
    if (typeof version !== "string" || !version.startsWith(WORKSPACE_VERSION_PREFIX)) continue
    findings.push({
      file: DESKTOP_PACKAGE_MANIFEST,
      message: `Workspace package "${packageName}" is a desktop runtime dependency, so electron-vite will externalize it. Put it in devDependencies so it is bundled into Electron instead.`,
    })
  }
}

async function checkUiAliasImports(findings: Finding[]) {
  const uiFiles = await scanFiles("packages/ui/src/**/*.{ts,tsx}")
  for (const file of uiFiles) {
    const content = readFileSync(file, "utf8")
    for (const specifier of getImportSpecifiers(content)) {
      if (!specifier.startsWith("@/")) continue
      findings.push({
        file: toRepoPath(file),
        message: `UI source uses forbidden package-local alias "${specifier}". Use "@buddy/ui/..." or relative imports.`,
      })
    }
  }
}

async function checkWebUiBoundary(findings: Finding[]) {
  const webFiles = await scanFiles("packages/web/src/**/*.{ts,tsx}")
  for (const file of webFiles) {
    const content = readFileSync(file, "utf8")
    for (const specifier of getImportSpecifiers(content)) {
      if (!specifier.startsWith("@/components/ui/")) continue
      findings.push({
        file: toRepoPath(file),
        message: `Web source imports "${specifier}". Use "@buddy/ui" (or explicit "@buddy/ui/..." export) instead.`,
      })
    }
  }
}

function resolveRelativeSpecifier(importerAbsolutePath: string, specifier: string) {
  return path.normalize(path.resolve(path.dirname(importerAbsolutePath), specifier))
}

function checkCrossPackageSrcImport(findings: Finding[], importerFile: string, specifier: string) {
  if (!specifier.includes("/src/")) return

  const importerPackage = getPackageNameFromAbsolutePath(importerFile)
  if (!importerPackage) return

  if (specifier.startsWith("@buddy/") || specifier.startsWith("@opencode-ai/")) {
    findings.push({
      file: toRepoPath(importerFile),
      message: `Cross-package import "${specifier}" targets another package's src directly.`,
    })
    return
  }

  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return

  const resolvedPath = specifier.startsWith(".")
    ? resolveRelativeSpecifier(importerFile, specifier)
    : path.normalize(specifier)
  if (resolvedPath.includes(`${path.sep}vendor${path.sep}`)) return
  if (!resolvedPath.includes(`${path.sep}packages${path.sep}`)) return
  if (!resolvedPath.includes(`${path.sep}src${path.sep}`)) return

  const targetPackage = getPackageNameFromAbsolutePath(resolvedPath)
  if (!targetPackage || targetPackage === importerPackage) return

  findings.push({
    file: toRepoPath(importerFile),
    message: `Import "${specifier}" targets "${targetPackage}/src" directly. Use that package's public exports.`,
  })
}

async function checkCrossPackageSrcImports(findings: Finding[]) {
  const codeFiles = await scanFiles("packages/**/*.{ts,tsx,js,mjs,cjs}")
  for (const file of codeFiles) {
    const content = readFileSync(file, "utf8")
    const specifiers = getImportSpecifiers(content)
    for (const specifier of specifiers) {
      checkCrossPackageSrcImport(findings, file, specifier)
    }
  }
}

function printFindingsAndExit(findings: Finding[]): never {
  const uniqueFindings = [
    ...new Map(findings.map((finding) => [`${finding.file}:${finding.message}`, finding])).values(),
  ]
  console.error("Import contract check failed:")
  for (const finding of uniqueFindings) {
    console.error(`- ${finding.file}: ${finding.message}`)
  }
  process.exit(1)
}

async function main() {
  const findings: Finding[] = []

  checkViteAliasContract(findings)
  checkDesktopRuntimeDependencies(findings)
  await checkUiAliasImports(findings)
  await checkWebUiBoundary(findings)
  await checkCrossPackageSrcImports(findings)

  if (findings.length > 0) {
    printFindingsAndExit(findings)
  }
}

await main()
