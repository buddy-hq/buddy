import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export type ElectronViteCommand = "build" | "serve"

export type ExternalBackendModule = {
  external: true
  id: string
}

export type BackendDevelopmentRebuildCompletion = "failed" | "rebuild" | "reload"

type WorkspacePackage = {
  dependencies: string[]
  directory: string
  name: string
}

const BACKEND_WORKSPACE_PACKAGE_NAME = "@buddy/backend"
const WORKSPACE_PACKAGE_PARENT_DIRECTORIES = ["packages", "vendor/opencode/packages"] as const
const NESTED_WORKSPACE_PACKAGE_DIRECTORIES = ["vendor/opencode/packages/sdk/js"] as const
const BACKEND_DEVELOPMENT_ADDITIONAL_WATCH_ROOTS = [
  "packages/buddy/script",
  "packages/script/src",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function workspacePackageManifestPaths(repositoryRoot: string): string[] {
  const manifests: string[] = []

  for (const relativeParent of WORKSPACE_PACKAGE_PARENT_DIRECTORIES) {
    const parent = path.resolve(repositoryRoot, relativeParent)
    if (!existsSync(parent)) continue
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifest = path.join(parent, entry.name, "package.json")
      if (existsSync(manifest)) manifests.push(manifest)
    }
  }

  for (const relativeDirectory of NESTED_WORKSPACE_PACKAGE_DIRECTORIES) {
    const manifest = path.resolve(repositoryRoot, relativeDirectory, "package.json")
    if (existsSync(manifest)) manifests.push(manifest)
  }

  return manifests
}

function readWorkspacePackage(manifestPath: string): WorkspacePackage | undefined {
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"))
  if (!isRecord(parsed) || typeof parsed.name !== "string") return undefined
  const dependencies = isRecord(parsed.dependencies) ? Object.keys(parsed.dependencies) : []

  return {
    dependencies,
    directory: path.dirname(manifestPath),
    name: parsed.name,
  }
}

export function backendDevelopmentWatchRoots(repositoryRoot: string): string[] {
  const packages = workspacePackageManifestPaths(repositoryRoot)
    .map(readWorkspacePackage)
    .filter((workspacePackage): workspacePackage is WorkspacePackage => workspacePackage !== undefined)
  const packagesByName = new Map(packages.map((workspacePackage) => [workspacePackage.name, workspacePackage]))
  const pendingPackageNames = [BACKEND_WORKSPACE_PACKAGE_NAME]
  const visitedPackageNames = new Set<string>()
  const roots = new Set(
    BACKEND_DEVELOPMENT_ADDITIONAL_WATCH_ROOTS.map((relativePath) =>
      path.resolve(repositoryRoot, relativePath),
    ),
  )

  while (pendingPackageNames.length > 0) {
    const packageName = pendingPackageNames.pop()
    if (!packageName || visitedPackageNames.has(packageName)) continue
    visitedPackageNames.add(packageName)

    const workspacePackage = packagesByName.get(packageName)
    if (!workspacePackage) {
      if (packageName === BACKEND_WORKSPACE_PACKAGE_NAME) {
        throw new Error(`Workspace package not found: ${BACKEND_WORKSPACE_PACKAGE_NAME}`)
      }
      continue
    }

    const sourceRoot = path.join(workspacePackage.directory, "src")
    if (existsSync(sourceRoot)) roots.add(sourceRoot)
    for (const dependency of workspacePackage.dependencies) {
      if (packagesByName.has(dependency)) pendingPackageNames.push(dependency)
    }
  }

  return [...roots].toSorted()
}

export function resolveBackendDevelopmentRebuildCompletion(input: {
  backendBuildSucceeded: boolean
  rebuildQueued: boolean
  sdkRefreshSucceeded: boolean
}): BackendDevelopmentRebuildCompletion {
  if (input.rebuildQueued) return "rebuild"
  return input.backendBuildSucceeded && input.sdkRefreshSucceeded ? "reload" : "failed"
}

export function resolveExternalDevelopmentBackend(
  command: ElectronViteCommand,
  backendEntry: string,
): ExternalBackendModule | undefined {
  if (command !== "serve") return undefined

  return {
    external: true,
    id: pathToFileURL(backendEntry).href,
  }
}

export function shouldCopyPackagedRuntimeAssets(command: ElectronViteCommand): boolean {
  return command === "build"
}
