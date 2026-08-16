import { readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  syncBackendSourceResources,
  syncBundledKnowledgeGraphAssets,
  syncBundledMigrations,
  syncBundledTessdataAssets,
} from "../../../script/desktop-runtime-resources"
import { type BuddyReleaseChannel, readBuddyReleaseChannel } from "@buddy/script/channel"
import { BUDDY_ENV, RUNTIME_ROOT_SEGMENTS, XDG_ENV } from "@buddy/script/storage-env"

export type Channel = BuddyReleaseChannel

const PACKAGE_DIR = path.resolve(import.meta.dir, "..")
const PACKAGE_JSON_PATH = path.resolve(PACKAGE_DIR, "package.json")
const BACKEND_RESOURCES_DIR = path.resolve(PACKAGE_DIR, "resources/backend")
const KNOWLEDGE_GRAPH_RESOURCES_DIR = path.resolve(PACKAGE_DIR, "resources/knowledge-graph")
const MIGRATIONS_DIR = path.resolve(PACKAGE_DIR, "resources/migrations")
const TESSDATA_RESOURCES_DIR = path.resolve(PACKAGE_DIR, "resources/tessdata")
const TAURI_SIGNER_BINARY_RELATIVE_PATH = "node_modules/.bin/tauri"
const LEGACY_BACKEND_EXECUTABLE_RESOURCE_NAMES = ["buddy-backend", "buddy-backend.exe"] as const
const EXPLICIT_RUNTIME_XDG_DIRECTORY_NAME = "xdg"
const EXPLICIT_RUNTIME_NOTEBOOK_DIRECTORY_NAME = "notebook"

export function resolveChannel(): Channel {
  return readBuddyReleaseChannel()
}

export function syncBackendResources() {
  return syncBackendSourceResources(BACKEND_RESOURCES_DIR)
}

export function removeLegacyBackendExecutableResources() {
  for (const name of LEGACY_BACKEND_EXECUTABLE_RESOURCE_NAMES) {
    rmSync(path.resolve(PACKAGE_DIR, "resources", name), { force: true })
  }
}

export function syncMigrations() {
  return syncBundledMigrations(MIGRATIONS_DIR)
}

export function syncKnowledgeGraphResources() {
  return syncBundledKnowledgeGraphAssets({
    destinationDir: KNOWLEDGE_GRAPH_RESOURCES_DIR,
  })
}

export function syncTessdataResources() {
  return syncBundledTessdataAssets(TESSDATA_RESOURCES_DIR)
}

export type DesktopRuntimeResources = {
  backendResources: string
  knowledgeGraphArchive: string
  migrations: string
  tessdata: string
}

export function syncDesktopRuntimeResources(): DesktopRuntimeResources {
  removeLegacyBackendExecutableResources()

  return {
    backendResources: syncBackendResources(),
    knowledgeGraphArchive: syncKnowledgeGraphResources(),
    migrations: syncMigrations(),
    tessdata: syncTessdataResources(),
  }
}

export function logDesktopRuntimeResources(resources: DesktopRuntimeResources) {
  console.log(`Prepared Buddy backend resources at ${resources.backendResources}`)
  console.log(`Prepared Knowledge Graph bundle at ${resources.knowledgeGraphArchive}`)
  console.log(`Prepared Buddy migrations at ${resources.migrations}`)
  console.log(`Prepared Buddy tessdata at ${resources.tessdata}`)
}

export function resolveExplicitRuntimeRootPaths(runtimeRoot: string) {
  return {
    notebookRoot: path.join(runtimeRoot, EXPLICIT_RUNTIME_NOTEBOOK_DIRECTORY_NAME),
    xdgRoot: path.join(runtimeRoot, EXPLICIT_RUNTIME_XDG_DIRECTORY_NAME),
  }
}

export function resolveExplicitRuntimeRootEnvironment(xdgRoot: string) {
  return {
    [BUDDY_ENV.RUNTIME_ROOT]: xdgRoot,
    [XDG_ENV.CACHE_HOME]: path.join(xdgRoot, RUNTIME_ROOT_SEGMENTS.cache),
    [XDG_ENV.CONFIG_HOME]: path.join(xdgRoot, RUNTIME_ROOT_SEGMENTS.config),
    [XDG_ENV.DATA_HOME]: path.join(xdgRoot, RUNTIME_ROOT_SEGMENTS.data),
    [XDG_ENV.STATE_HOME]: path.join(xdgRoot, RUNTIME_ROOT_SEGMENTS.state),
  }
}

export function updateDesktopPackageVersion(version: string) {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
    version: string
  }
  pkg.version = version
  writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
}

export function readDesktopPackageVersion() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
    version: string
  }
  return pkg.version
}

export function resolveTauriSignerBinaryPath(environment: NodeJS.ProcessEnv = process.env) {
  return (
    environment.TAURI_SIGNER_BINARY_PATH?.trim() ||
    path.join(PACKAGE_DIR, TAURI_SIGNER_BINARY_RELATIVE_PATH)
  )
}
