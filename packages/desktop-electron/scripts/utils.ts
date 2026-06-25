import { readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  syncBackendSourceResources,
  syncBundledKnowledgeGraphAssets,
  syncBundledMigrations,
} from "../../../script/desktop-runtime-resources"

export type Channel = "dev" | "beta" | "prod"

const PACKAGE_DIR = path.resolve(import.meta.dir, "..")
const PACKAGE_JSON_PATH = path.resolve(PACKAGE_DIR, "package.json")
const BACKEND_RESOURCES_DIR = path.resolve(PACKAGE_DIR, "resources/backend")
const KNOWLEDGE_GRAPH_RESOURCES_DIR = path.resolve(PACKAGE_DIR, "resources/knowledge-graph")
const MIGRATIONS_DIR = path.resolve(PACKAGE_DIR, "resources/migrations")
const TAURI_SIGNER_BINARY_RELATIVE_PATH = "node_modules/.bin/tauri"
const LEGACY_BACKEND_EXECUTABLE_RESOURCE_NAMES = ["buddy-backend", "buddy-backend.exe"] as const

export function resolveChannel(): Channel {
  const raw = process.env.BUDDY_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
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

export type DesktopRuntimeResources = {
  backendResources: string
  knowledgeGraphArchive: string
  migrations: string
}

export function syncDesktopRuntimeResources(): DesktopRuntimeResources {
  removeLegacyBackendExecutableResources()

  return {
    backendResources: syncBackendResources(),
    knowledgeGraphArchive: syncKnowledgeGraphResources(),
    migrations: syncMigrations(),
  }
}

export function logDesktopRuntimeResources(resources: DesktopRuntimeResources) {
  console.log(`Prepared Buddy backend resources at ${resources.backendResources}`)
  console.log(`Prepared Knowledge Graph bundle at ${resources.knowledgeGraphArchive}`)
  console.log(`Prepared Buddy migrations at ${resources.migrations}`)
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
