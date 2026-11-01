import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import {
  syncBackendSourceResources,
  syncBundledKnowledgeGraphAssets,
  syncBundledMigrations,
  syncBundledTessdataAssets,
} from "../../../script/desktop-runtime-resources"
import { type BuddyReleaseChannel, readBuddyReleaseChannel } from "@buddy/script/channel"
import { CHEMFIG_RUNTIME_DIRECTORY_NAME } from "@buddy/script/chemfig-runtime"
import { BUDDY_ENV, RUNTIME_ROOT_SEGMENTS, XDG_ENV } from "@buddy/script/storage-env"
import { z } from "zod"

export type Channel = BuddyReleaseChannel

const PACKAGE_DIR = path.resolve(import.meta.dir, "..")
const PACKAGE_JSON_PATH = path.resolve(PACKAGE_DIR, "package.json")
const RESOURCES_DIR = path.resolve(PACKAGE_DIR, "resources")
const BACKEND_DIST_DIR = path.resolve(PACKAGE_DIR, "../buddy/dist/backend")
const BACKEND_RESOURCES_DIR = path.resolve(PACKAGE_DIR, "resources/backend")
const KNOWLEDGE_GRAPH_RESOURCES_DIR = path.resolve(PACKAGE_DIR, "resources/knowledge-graph")
const MIGRATIONS_DIR = path.resolve(PACKAGE_DIR, "resources/migrations")
const TESSDATA_RESOURCES_DIR = path.resolve(PACKAGE_DIR, "resources/tessdata")
const TAURI_SIGNER_BINARY_RELATIVE_PATH = "node_modules/.bin/tauri"
const EXPLICIT_RUNTIME_XDG_DIRECTORY_NAME = "xdg"
const EXPLICIT_RUNTIME_NOTEBOOK_DIRECTORY_NAME = "notebook"
const DesktopPackageManifestSchema = z.looseObject({ version: z.string() })

export function resolveChannel(): Channel {
  return readBuddyReleaseChannel()
}

export function syncBackendResources() {
  return syncBackendSourceResources(BACKEND_RESOURCES_DIR)
}

function syncBackendExecutable() {
  const filename = process.platform === "win32" ? "buddy-backend.exe" : "buddy-backend"
  const source = path.join(BACKEND_DIST_DIR, filename)
  const file = statSync(source)
  if (!file.isFile() || file.size === 0) {
    throw new Error(`Compiled Buddy backend must be a non-empty file: ${source}`)
  }
  const destination = path.join(RESOURCES_DIR, filename)
  mkdirSync(RESOURCES_DIR, { recursive: true })
  copyFileSync(source, destination)
  return destination
}

function syncCompiledBackendResource(name: string) {
  const source = path.join(BACKEND_DIST_DIR, name)
  const destination = path.join(RESOURCES_DIR, name)
  if (!statSync(source).isDirectory()) {
    throw new Error(`Compiled Buddy backend resource must be a directory: ${source}`)
  }
  rmSync(destination, { recursive: true, force: true })
  cpSync(source, destination, { recursive: true, dereference: true })
  return destination
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
  backendExecutable: string
  chemfigRuntime: string
  backendResources: string
  knowledgeGraphArchive: string
  migrations: string
  tessdata: string
}

export function syncDesktopRuntimeResources(): DesktopRuntimeResources {
  return {
    backendExecutable: syncBackendExecutable(),
    chemfigRuntime: syncCompiledBackendResource(CHEMFIG_RUNTIME_DIRECTORY_NAME),
    backendResources: syncBackendResources(),
    knowledgeGraphArchive: syncKnowledgeGraphResources(),
    migrations: syncMigrations(),
    tessdata: syncTessdataResources(),
  }
}

export function logDesktopRuntimeResources(resources: DesktopRuntimeResources) {
  console.log(`Prepared Buddy backend executable at ${resources.backendExecutable}`)
  console.log(`Prepared Buddy chemistry runtime at ${resources.chemfigRuntime}`)
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
  const pkg = DesktopPackageManifestSchema.parse(
    JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")),
  )
  pkg.version = version
  writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
}

export function readDesktopPackageVersion() {
  const pkg = DesktopPackageManifestSchema.parse(
    JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")),
  )
  return pkg.version
}

export function resolveTauriSignerBinaryPath(environment: NodeJS.ProcessEnv = process.env) {
  return (
    environment.TAURI_SIGNER_BINARY_PATH?.trim() ||
    path.join(PACKAGE_DIR, TAURI_SIGNER_BINARY_RELATIVE_PATH)
  )
}

/** Unset empty optional secrets so the signer does not parse them as CLI arguments. */
export function resolveSignerEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const resolved = { ...environment }
  for (const key of [
    "TAURI_SIGNING_PRIVATE_KEY_PATH",
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  ]) {
    if (!resolved[key]?.trim()) delete resolved[key]
  }
  return resolved
}
