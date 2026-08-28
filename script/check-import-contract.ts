#!/usr/bin/env bun

import { readFileSync } from "node:fs"
import path from "node:path"
import { isJsonObject, parseTString } from "./parse-values"

type Finding = {
  file: string
  message: string
}

const REPO_ROOT = path.resolve(import.meta.dir, "..")
const DESKTOP_PACKAGE_MANIFEST = "packages/desktop-electron/package.json"
const WORKSPACE_VERSION_PREFIX = "workspace:"
const OPENCODE_RUNTIME_SOURCE = "packages/buddy/src/opencode-runtime/runtime.ts"
const TOOL_INPUT_DELTA_BRIDGE_CALL = "await ensureToolInputDeltaBridgePatched()"
const OPENCODE_SERVER_STARTUP = "const built = await Server.Default()"
const ACTIVE_CHAT_ENTRYPOINTS = [
  "packages/web/src/app.tsx",
  "packages/web/src/routes/chat.tsx",
  "packages/web/src/routes/settings.tsx",
  "packages/web/src/routes/onboarding.tsx",
  "packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts",
]
const DIRECT_ACTIVE_CHAT_MUTATION =
  /\b(?:selectSession|startNewSessionDraft|startNewSession|forkSession)\s*\(/
const DIRECTORY_CHAT_CONTROLLER_SOURCE =
  "packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts"
const PRESENTATION_ONLY_SOURCES = [
  "packages/web/src/lib/directory-workspace-controller.ts",
  "packages/web/src/lib/directory-workspace-client-actions.ts",
  "packages/web/src/lib/use-workspace-file-open.ts",
  "packages/web/src/components/whiteboard/whiteboard-opening-preview.tsx",
  "packages/web/src/components/directory-chat/right-workspace-open.ts",
]
const FORBIDDEN_DIRECTORY_CHAT_CONTROLLER_REFERENCES = [
  "linkedSessionByResource",
  "selectActiveChatSessionAndPresent",
  "sessionPreference",
]
const REQUIRED_DIRECTORY_CHAT_CONTROLLER_REFERENCE = "buildWorkspaceRouteNavigation"
const SESSION_BENCH_SURFACE_SOURCE =
  "packages/web/src/components/bench/surfaces/session-bench-surface.tsx"
const DIRECTORY_WORKSPACE_ROOT_SOURCE =
  "packages/web/src/components/directory-chat/directory-workspace-root.tsx"
const SUBAGENT_BENCH_HOOK_REFERENCE = "useOpenSubagentBench"
const REQUIRED_SESSION_BENCH_SURFACE_WIRING = "onOpenSession={props.onOpenSession}"
const REQUIRED_SUBAGENT_SESSION_WIRING = "onOpenSession={handleOpenSubagentSession}"
const CHAT_TRANSITION_CALL =
  /\b(?:activateChatDirectory|selectActiveChatSession|startActiveChatDraft|startActiveChatSession|forkActiveChatSession)\s*\(/

function toPosix(value: string) {
  return value.split(path.sep).join("/")
}

function toRepoPath(absolutePath: string) {
  return toPosix(path.relative(REPO_ROOT, absolutePath))
}

function checkActiveChatTransitionEntrypoints(findings: Finding[]) {
  for (const relativePath of ACTIVE_CHAT_ENTRYPOINTS) {
    const content = readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
    if (!DIRECT_ACTIVE_CHAT_MUTATION.test(content)) continue
    findings.push({
      file: relativePath,
      message:
        "Direct chat-session transition calls bypass the active chat transition coordinator. Route the transition through the coordinator instead.",
    })
  }
}

function checkBenchNavigationBoundary(findings: Finding[]) {
  const controllerContent = readFileSync(
    path.join(REPO_ROOT, DIRECTORY_CHAT_CONTROLLER_SOURCE),
    "utf8",
  )

  for (const forbiddenReference of FORBIDDEN_DIRECTORY_CHAT_CONTROLLER_REFERENCES) {
    if (!controllerContent.includes(forbiddenReference)) continue
    findings.push({
      file: DIRECTORY_CHAT_CONTROLLER_SOURCE,
      message: `Bench chat controller must not reference "${forbiddenReference}". Keep resource presentation separate from chat selection.`,
    })
  }

  if (!controllerContent.includes(REQUIRED_DIRECTORY_CHAT_CONTROLLER_REFERENCE)) {
    findings.push({
      file: DIRECTORY_CHAT_CONTROLLER_SOURCE,
      message:
        'Bench chat controller must use "buildWorkspaceRouteNavigation" for workspace route navigation.',
    })
  }

  for (const relativePath of PRESENTATION_ONLY_SOURCES) {
    const content = readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
    if (!CHAT_TRANSITION_CALL.test(content)) continue
    findings.push({
      file: relativePath,
      message:
        "Presentation-only modules must not invoke chat transition methods. Route chat transitions through the directory chat controller instead.",
    })
  }
}

function checkSubagentBenchWiring(findings: Finding[]) {
  const sessionBenchSurfaceContent = readFileSync(
    path.join(REPO_ROOT, SESSION_BENCH_SURFACE_SOURCE),
    "utf8",
  )
  if (sessionBenchSurfaceContent.includes(SUBAGENT_BENCH_HOOK_REFERENCE)) {
    findings.push({
      file: SESSION_BENCH_SURFACE_SOURCE,
      message:
        "nested session surfaces must delegate session opening to their owner-provided callback rather than selecting/opening directly.",
    })
  }
  if (!sessionBenchSurfaceContent.includes(REQUIRED_SESSION_BENCH_SURFACE_WIRING)) {
    findings.push({
      file: SESSION_BENCH_SURFACE_SOURCE,
      message:
        "nested session surfaces must forward their owner-provided session-opening callback to the rendered transcript.",
    })
  }

  const directoryWorkspaceRootContent = readFileSync(
    path.join(REPO_ROOT, DIRECTORY_WORKSPACE_ROOT_SOURCE),
    "utf8",
  )
  if (!directoryWorkspaceRootContent.includes(REQUIRED_SUBAGENT_SESSION_WIRING)) {
    findings.push({
      file: DIRECTORY_WORKSPACE_ROOT_SOURCE,
      message:
        "directory workspace root must pass its owner-aware subagent session handler to Bench surfaces.",
    })
  }
}

function checkToolInputDeltaBridgeStartup(findings: Finding[]) {
  const content = readFileSync(path.join(REPO_ROOT, OPENCODE_RUNTIME_SOURCE), "utf8")
  const bridgeInstallIndex = content.indexOf(TOOL_INPUT_DELTA_BRIDGE_CALL)
  const serverStartupIndex = content.indexOf(OPENCODE_SERVER_STARTUP)

  if (
    bridgeInstallIndex >= 0 &&
    serverStartupIndex >= 0 &&
    bridgeInstallIndex < serverStartupIndex
  ) {
    return
  }

  findings.push({
    file: OPENCODE_RUNTIME_SOURCE,
    message: "The tool-input-delta bridge must be installed before OpenCode server startup.",
  })
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
  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, DESKTOP_PACKAGE_MANIFEST), "utf8"))
  if (!isJsonObject(manifest) || !isJsonObject(manifest.dependencies)) return

  for (const [packageName, version] of Object.entries(manifest.dependencies)) {
    const versionText = parseTString(version)
    if (versionText === undefined || !versionText.startsWith(WORKSPACE_VERSION_PREFIX)) continue
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
  checkActiveChatTransitionEntrypoints(findings)
  checkBenchNavigationBoundary(findings)
  checkSubagentBenchWiring(findings)
  checkToolInputDeltaBridgeStartup(findings)
  await checkUiAliasImports(findings)
  await checkWebUiBoundary(findings)
  await checkCrossPackageSrcImports(findings)

  if (findings.length > 0) {
    printFindingsAndExit(findings)
  }
}

await main()
