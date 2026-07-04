import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const BACKEND_DIR = path.resolve(ROOT_DIR, "packages/buddy")
const BACKEND_SOURCE_DIR = path.resolve(BACKEND_DIR, "src")
const BUDDY_MIGRATION_SOURCE = path.resolve(BACKEND_DIR, "migration")
const KNOWLEDGE_GRAPH_ASSET_SOURCE_ENV = "BUDDY_KNOWLEDGE_GRAPH_DB_SOURCE"
const KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME = "learning-commons-knowledge-graph.db.zst"
const KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME = `${KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME}.sha256`
const KNOWLEDGE_GRAPH_MANIFEST_FILENAME = "learning-commons-knowledge-graph.db.json"
const KNOWLEDGE_GRAPH_LOCKFILE_FILENAME = "knowledge-graph.lock.json"
const DEFAULT_KNOWLEDGE_GRAPH_ASSET_SOURCE = path.resolve(BACKEND_DIR, "resources/knowledge-graph")
const DEFAULT_TESSDATA_ASSET_SOURCE = path.resolve(BACKEND_DIR, "resources/tessdata")
const TESSDATA_ASSET_FILENAMES = ["eng.traineddata", "eng.traineddata.sha256", "LICENSE"] as const

const KNOWLEDGE_GRAPH_ASSET_FILENAMES = [
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
  KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
  KNOWLEDGE_GRAPH_LOCKFILE_FILENAME,
] as const

const BACKEND_SOURCE_RESOURCE_ENTRIES = [
  {
    from: "learning/features",
    to: "learning/features",
  },
  {
    from: "learning/personas/prompts",
    to: "learning/personas/prompts",
  },
  {
    from: "learning/prompt",
    to: "learning/prompt",
  },
  {
    from: "learning/skill-management/service/catalog.json",
    to: "catalog.json",
  },
  {
    from: "local-runtimes/advanced-math/runtime",
    to: "local-runtimes/advanced-math/runtime",
  },
] as const

export function syncBundledMigrations(destinationDir: string) {
  rmSync(destinationDir, { recursive: true, force: true })
  mkdirSync(destinationDir, { recursive: true })
  cpSync(BUDDY_MIGRATION_SOURCE, path.resolve(destinationDir, "buddy"), { recursive: true })
  return destinationDir
}

function resolveKnowledgeGraphAssetSourcePath(sourcePath: string | undefined) {
  const configured = sourcePath ?? process.env[KNOWLEDGE_GRAPH_ASSET_SOURCE_ENV]
  if (configured && configured.trim().length > 0) {
    const resolved = path.resolve(configured)
    if (existsSync(resolved) && !statSync(resolved).isDirectory()) {
      return path.dirname(resolved)
    }
    return resolved
  }

  return DEFAULT_KNOWLEDGE_GRAPH_ASSET_SOURCE
}

function requireKnowledgeGraphAssetFile(sourceDir: string, filename: string) {
  const filePath = path.resolve(sourceDir, filename)
  if (!existsSync(filePath)) {
    throw new Error(
      `Knowledge Graph asset ${filename} missing at ${filePath}. Run \`bun run update:knowledge-graph\`.`,
    )
  }

  return filePath
}

export function syncBundledKnowledgeGraphAssets(input: {
  destinationDir: string
  sourcePath?: string
}) {
  const sourceDir = resolveKnowledgeGraphAssetSourcePath(input.sourcePath)
  if (!existsSync(sourceDir)) {
    throw new Error(`Knowledge Graph asset source missing at ${sourceDir}`)
  }

  rmSync(input.destinationDir, { recursive: true, force: true })
  mkdirSync(input.destinationDir, { recursive: true })

  for (const filename of KNOWLEDGE_GRAPH_ASSET_FILENAMES) {
    const sourceFile = requireKnowledgeGraphAssetFile(sourceDir, filename)
    copyFileSync(sourceFile, path.resolve(input.destinationDir, filename))
  }

  return path.resolve(input.destinationDir, KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME)
}

export function syncBundledTessdataAssets(destinationDir: string) {
  if (!existsSync(DEFAULT_TESSDATA_ASSET_SOURCE)) {
    throw new Error(`Tessdata asset source missing at ${DEFAULT_TESSDATA_ASSET_SOURCE}`)
  }

  rmSync(destinationDir, { recursive: true, force: true })
  mkdirSync(destinationDir, { recursive: true })

  for (const filename of TESSDATA_ASSET_FILENAMES) {
    const sourceFile = path.resolve(DEFAULT_TESSDATA_ASSET_SOURCE, filename)
    if (!existsSync(sourceFile)) {
      throw new Error(`Tessdata asset ${filename} missing at ${sourceFile}`)
    }
    copyFileSync(sourceFile, path.resolve(destinationDir, filename))
  }

  return destinationDir
}

export function syncBackendSourceResources(destinationDir: string) {
  rmSync(destinationDir, { recursive: true, force: true })
  mkdirSync(destinationDir, { recursive: true })

  for (const entry of BACKEND_SOURCE_RESOURCE_ENTRIES) {
    const source = path.resolve(BACKEND_SOURCE_DIR, entry.from)
    const destination = path.resolve(destinationDir, entry.to)
    if (!existsSync(source)) {
      throw new Error(`Buddy backend source resource missing at ${source}`)
    }

    mkdirSync(path.dirname(destination), { recursive: true })
    cpSync(source, destination, { recursive: true, dereference: true })
  }

  return destinationDir
}
