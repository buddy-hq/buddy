import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { createReadStream, existsSync, mkdirSync, readFileSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import readline from "node:readline"
import { fileURLToPath } from "node:url"
import { Database } from "bun:sqlite"
import { compress, init as initZstd } from "@bokuweb/zstd-wasm"
import {
  createKnowledgeGraphArtifactManifest,
  knowledgeGraphArchiveChecksumFileContents,
} from "../../src/learning/features/standards/artifact"
import {
  createKnowledgeGraphLockfile,
  parseKnowledgeGraphLockfile,
} from "../../src/learning/features/standards/lockfile"
import {
  KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_DB_FILENAME,
  KNOWLEDGE_GRAPH_LOCKFILE_FILENAME,
  KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
} from "../../src/learning/features/standards/constants"
import {
  validateKnowledgeGraphNodeSchema,
  validateKnowledgeGraphRelationshipSchema,
  type KnowledgeGraphNode,
  type KnowledgeGraphRelationship,
} from "./schema"

const KNOWLEDGE_GRAPH_DEFAULT_VERSION = "v1.7.0"
const KNOWLEDGE_GRAPH_OUTPUT_DIR_ENV = "BUDDY_KNOWLEDGE_GRAPH_OUTPUT_DIR"
const KNOWLEDGE_GRAPH_VERSION_ENV = "BUDDY_KNOWLEDGE_GRAPH_VERSION"
const KNOWLEDGE_GRAPH_NODE_URL_ENV = "BUDDY_KNOWLEDGE_GRAPH_NODES_URL"
const KNOWLEDGE_GRAPH_RELATIONSHIP_URL_ENV = "BUDDY_KNOWLEDGE_GRAPH_RELATIONSHIPS_URL"
const KNOWLEDGE_GRAPH_PREVIEW_BYTES = 256 * 1024
const KNOWLEDGE_GRAPH_DOWNLOAD_USER_AGENT = "BuddyKnowledgeGraphBuilder/1.0"
const SQLITE_BATCH_SIZE = 2_000
const SQLITE_WAL_MODE = "delete"
const SQLITE_SCHEMA_VERSION = "1"
const KNOWLEDGE_GRAPH_ZSTD_LEVEL = 19
const KNOWLEDGE_GRAPH_ZSTD_THREADS_FLAG = "-T0"

const BACKEND_DIR = path.resolve(import.meta.dir, "../..")
const DEFAULT_OUTPUT_DIR = path.resolve(BACKEND_DIR, "resources/knowledge-graph")

type KnowledgeGraphBuildOptions = {
  outputDir: string
  version: string
  nodesURL: string
  relationshipsURL: string
}

type ArtifactMetadata = {
  version: string
  nodesURL: string
  relationshipsURL: string
  schemaVersion: string
}

type PreparedNodeRecord = {
  identifier: string
  type: string
  primaryLabel: string
  labelsJSON: string
  propertiesJSON: string
}

type PreparedRelationshipRecord = {
  identifier: string
  type: string
  label: string
  sourceIdentifier: string
  targetIdentifier: string
  sourceLabelsJSON: string
  targetLabelsJSON: string
  propertiesJSON: string
}

type PreparedStandardRecord = {
  id: string
  code: string | null
  description: string | null
  subject: string | null
  jurisdiction: string | null
  gradeLevel: string | null
  caseUUID: string | null
}

type PreparedLearningComponentRecord = {
  id: string
  description: string | null
  subject: string | null
}

type DownloadTargets = {
  nodesPath: string
  relationshipsPath: string
}

type SourceFileInfo = {
  path: string
  sha256: string
  size: number
  url: string
}

function trimNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function jsonText(value: unknown) {
  return JSON.stringify(value)
}

function defaultNodesURL(version: string) {
  return `https://cdn.learningcommons.org/knowledge-graph/${version}/exports/nodes.jsonl`
}

function defaultRelationshipsURL(version: string) {
  return `https://cdn.learningcommons.org/knowledge-graph/${version}/exports/relationships.jsonl`
}

function isFileURL(value: string) {
  return value.startsWith("file://")
}

function fileURLPath(value: string) {
  return fileURLToPath(value)
}

function optionValue(args: string[], flag: string) {
  const index = args.indexOf(flag)
  if (index === -1) {
    return undefined
  }

  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`)
  }

  return value.trim()
}

function parseOptions(args: string[]): KnowledgeGraphBuildOptions {
  const outputDirArg = optionValue(args, "--output-dir")
  const configuredOutputDir = outputDirArg ?? process.env[KNOWLEDGE_GRAPH_OUTPUT_DIR_ENV]?.trim()
  const outputDir = configuredOutputDir ? path.resolve(configuredOutputDir) : DEFAULT_OUTPUT_DIR
  const existingLockfile = readKnowledgeGraphLockfile(outputDir)
  const version =
    optionValue(args, "--version") ||
    process.env[KNOWLEDGE_GRAPH_VERSION_ENV]?.trim() ||
    existingLockfile?.source.version ||
    KNOWLEDGE_GRAPH_DEFAULT_VERSION
  const nodesURL =
    optionValue(args, "--nodes-url") ||
    process.env[KNOWLEDGE_GRAPH_NODE_URL_ENV]?.trim() ||
    existingLockfile?.source.nodes.url ||
    defaultNodesURL(version)
  const relationshipsURL =
    optionValue(args, "--relationships-url") ||
    process.env[KNOWLEDGE_GRAPH_RELATIONSHIP_URL_ENV]?.trim() ||
    existingLockfile?.source.relationships.url ||
    defaultRelationshipsURL(version)

  return {
    outputDir,
    version,
    nodesURL,
    relationshipsURL,
  }
}

function outputArchivePath(outputDir: string) {
  return path.resolve(outputDir, KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME)
}

function outputManifestPath(outputDir: string) {
  return path.resolve(outputDir, KNOWLEDGE_GRAPH_MANIFEST_FILENAME)
}

function outputArchiveChecksumPath(outputDir: string) {
  return path.resolve(outputDir, KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME)
}

function outputLockfilePath(outputDir: string) {
  return path.resolve(outputDir, KNOWLEDGE_GRAPH_LOCKFILE_FILENAME)
}

let zstdInitialization: Promise<void> | undefined

function ensureZstdInitialized() {
  zstdInitialization ??= initZstd()
  return zstdInitialization
}

async function fileInfo(input: { path: string; url: string }): Promise<SourceFileInfo> {
  const hash = createHash("sha256")
  let size = 0

  const stream = createReadStream(input.path)
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    hash.update(bytes)
    size += bytes.byteLength
  }

  return {
    path: input.path,
    sha256: hash.digest("hex"),
    size,
    url: input.url,
  }
}

async function fileHashAndSize(filePath: string) {
  const hash = createHash("sha256")
  let size = 0

  const stream = createReadStream(filePath)
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    hash.update(bytes)
    size += bytes.byteLength
  }

  return {
    sha256: hash.digest("hex"),
    size,
  }
}

function readKnowledgeGraphLockfile(outputDir: string) {
  const lockfilePath = outputLockfilePath(outputDir)
  if (!existsSync(lockfilePath)) {
    return undefined
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(lockfilePath, "utf8"))
    return parseKnowledgeGraphLockfile(parsed)
  } catch {
    return undefined
  }
}

async function runCurl(input: { args: string[]; mirrorStderr?: boolean }) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("curl", input.args, {
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    child.stderr.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      stderrChunks.push(bytes)
      if (input.mirrorStderr) {
        process.stderr.write(bytes)
      }
    })
    child.on("error", reject)
    child.on("close", (code, signal) => {
      if (input.mirrorStderr) {
        process.stderr.write("\n")
      }
      if (code === 0) {
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
        })
        return
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim()
      reject(
        new Error(
          stderr || `curl failed with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`,
        ),
      )
    })
  })
}

async function runCommand(input: { args: string[]; binary: string; mirrorStderr?: boolean }) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(input.binary, input.args, {
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    child.stderr.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      stderrChunks.push(bytes)
      if (input.mirrorStderr) {
        process.stderr.write(bytes)
      }
    })
    child.on("error", reject)
    child.on("close", (code, signal) => {
      if (input.mirrorStderr) {
        process.stderr.write("\n")
      }

      if (code === 0) {
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
        })
        return
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim()
      reject(
        new Error(
          stderr ||
            `${input.binary} failed with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`,
        ),
      )
    })
  })
}

async function downloadPreviewText(url: string) {
  try {
    const result = await runCurl({
      args: [
        "-L",
        "--fail",
        "--silent",
        "--show-error",
        "--user-agent",
        KNOWLEDGE_GRAPH_DOWNLOAD_USER_AGENT,
        "--range",
        `0-${KNOWLEDGE_GRAPH_PREVIEW_BYTES - 1}`,
        url,
      ],
    })
    return result.stdout
  } catch (error) {
    const response = await fetch(url, {
      headers: {
        Range: `bytes=0-${KNOWLEDGE_GRAPH_PREVIEW_BYTES - 1}`,
        "User-Agent": KNOWLEDGE_GRAPH_DOWNLOAD_USER_AGENT,
      },
    })

    if (!response.ok) {
      throw new Error(
        `Knowledge Graph preview request failed for ${url}: ${response.status} ${response.statusText}. ${error instanceof Error ? error.message : String(error)}`,
        {
          cause: error,
        },
      )
    }

    return response.text()
  }
}

async function downloadHttpFile(url: string, destinationPath: string) {
  try {
    await runCurl({
      args: [
        "-L",
        "--fail",
        "--show-error",
        "--progress-bar",
        "--user-agent",
        KNOWLEDGE_GRAPH_DOWNLOAD_USER_AGENT,
        url,
        "-o",
        destinationPath,
      ],
      mirrorStderr: true,
    })
    return
  } catch (error) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": KNOWLEDGE_GRAPH_DOWNLOAD_USER_AGENT,
      },
    })

    if (!response.ok || !response.body) {
      throw new Error(
        `Knowledge Graph download failed for ${url}: ${response.status} ${response.statusText}. ${error instanceof Error ? error.message : String(error)}`,
        {
          cause: error,
        },
      )
    }

    await Bun.write(destinationPath, response)
  }
}

async function downloadParallelHttpFiles(input: {
  nodesPath: string
  nodesURL: string
  relationshipsPath: string
  relationshipsURL: string
}) {
  await runCurl({
    args: [
      "--parallel",
      "--parallel-immediate",
      "--parallel-max",
      "2",
      "-L",
      "--fail",
      "--show-error",
      "--progress-bar",
      "--user-agent",
      KNOWLEDGE_GRAPH_DOWNLOAD_USER_AGENT,
      input.nodesURL,
      "-o",
      input.nodesPath,
      "--next",
      input.relationshipsURL,
      "-o",
      input.relationshipsPath,
    ],
    mirrorStderr: true,
  })
}

async function fetchPreviewRecord<T>(input: {
  url: string
  validate: (value: unknown) => T
}): Promise<T> {
  const text = isFileURL(input.url)
    ? readFileSync(fileURLPath(input.url), "utf8").slice(0, KNOWLEDGE_GRAPH_PREVIEW_BYTES)
    : await downloadPreviewText(input.url)
  const lines = text
    .split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)

  for (const line of lines) {
    try {
      return input.validate(JSON.parse(line))
    } catch {
      continue
    }
  }

  throw new Error(`Knowledge Graph preview for ${input.url} did not contain a valid record.`)
}

async function assertRemoteCoreSchema(input: { nodesURL: string; relationshipsURL: string }) {
  await Promise.all([
    fetchPreviewRecord({
      url: input.nodesURL,
      validate: validateKnowledgeGraphNodeSchema,
    }),
    fetchPreviewRecord({
      url: input.relationshipsURL,
      validate: validateKnowledgeGraphRelationshipSchema,
    }),
  ])
}

async function downloadFile(url: string, destinationPath: string) {
  if (isFileURL(url)) {
    await Bun.write(destinationPath, Bun.file(fileURLPath(url)))
    return
  }

  await downloadHttpFile(url, destinationPath)
}

async function downloadKnowledgeGraphFiles(input: {
  tempDir: string
  nodesURL: string
  relationshipsURL: string
}): Promise<DownloadTargets> {
  const nodesPath = path.resolve(input.tempDir, "nodes.jsonl")
  const relationshipsPath = path.resolve(input.tempDir, "relationships.jsonl")

  console.log(`[knowledge-graph] downloading nodes export -> ${nodesPath}`)
  console.log(`[knowledge-graph] downloading relationships export -> ${relationshipsPath}`)

  if (!isFileURL(input.nodesURL) && !isFileURL(input.relationshipsURL)) {
    await downloadParallelHttpFiles({
      nodesPath,
      nodesURL: input.nodesURL,
      relationshipsPath,
      relationshipsURL: input.relationshipsURL,
    })
  } else {
    await Promise.all([
      downloadFile(input.nodesURL, nodesPath),
      downloadFile(input.relationshipsURL, relationshipsPath),
    ])
  }

  return {
    nodesPath,
    relationshipsPath,
  }
}

function createDatabase(databasePath: string) {
  const database = new Database(databasePath)
  database.exec(`
    pragma journal_mode = ${SQLITE_WAL_MODE};
    pragma synchronous = off;
    pragma temp_store = memory;
    pragma locking_mode = exclusive;

    create table metadata (
      key text primary key,
      value text not null
    );

    create table graph_nodes (
      identifier text primary key,
      type text not null,
      primary_label text not null,
      labels_json text not null,
      properties_json text not null
    );

    create table graph_relationships (
      row_id integer primary key,
      identifier text not null,
      type text not null,
      label text not null,
      source_identifier text not null,
      target_identifier text not null,
      source_labels_json text not null,
      target_labels_json text not null,
      properties_json text not null
    );

    create table standards (
      id text primary key,
      code text,
      description text,
      subject text,
      jurisdiction text,
      grade_level text,
      case_uuid text
    );

    create table learning_components (
      id text primary key,
      description text,
      subject text
    );

    create table relationships (
      label text not null,
      source_id text not null,
      target_id text not null
    );

    create index idx_graph_nodes_primary_label on graph_nodes(primary_label);
    create index idx_graph_relationships_label on graph_relationships(label);
    create index idx_graph_relationships_identifier on graph_relationships(identifier);
    create index idx_graph_relationships_source on graph_relationships(source_identifier);
    create index idx_graph_relationships_target on graph_relationships(target_identifier);
    create index idx_standards_code on standards(code);
    create index idx_standards_jurisdiction on standards(jurisdiction);
    create index idx_standards_subject on standards(subject);
    create index idx_rel_source on relationships(source_id);
    create index idx_rel_target on relationships(target_id);
    create index idx_rel_label on relationships(label);
  `)
  return database
}

function preparedNodeRecord(node: KnowledgeGraphNode): PreparedNodeRecord {
  return {
    identifier: node.identifier,
    type: node.type,
    primaryLabel: node.labels[0] ?? "Unknown",
    labelsJSON: jsonText(node.labels),
    propertiesJSON: jsonText(node.properties),
  }
}

function preparedRelationshipRecord(
  relationship: KnowledgeGraphRelationship,
): PreparedRelationshipRecord {
  return {
    identifier: relationship.identifier,
    type: relationship.type,
    label: relationship.label,
    sourceIdentifier: relationship.source_identifier,
    targetIdentifier: relationship.target_identifier,
    sourceLabelsJSON: jsonText(relationship.source_labels),
    targetLabelsJSON: jsonText(relationship.target_labels),
    propertiesJSON: jsonText(relationship.properties),
  }
}

function preparedStandardRecord(node: KnowledgeGraphNode): PreparedStandardRecord | undefined {
  if (!node.labels.includes("StandardsFrameworkItem")) {
    return undefined
  }

  return {
    id: node.identifier,
    code: trimNonEmptyString(node.properties.statementCode),
    description: trimNonEmptyString(node.properties.description),
    subject: trimNonEmptyString(node.properties.academicSubject),
    jurisdiction: trimNonEmptyString(node.properties.jurisdiction),
    gradeLevel: trimNonEmptyString(node.properties.gradeLevel),
    caseUUID: trimNonEmptyString(node.properties.caseIdentifierUUID),
  }
}

function preparedLearningComponentRecord(
  node: KnowledgeGraphNode,
): PreparedLearningComponentRecord | undefined {
  if (!node.labels.includes("LearningComponent")) {
    return undefined
  }

  return {
    id: node.identifier,
    description: trimNonEmptyString(node.properties.description),
    subject: trimNonEmptyString(node.properties.academicSubject),
  }
}

async function eachJsonlLine<T>(
  filePath: string,
  parse: (value: unknown) => T,
  onValue: (value: T) => void,
) {
  const input = createReadStream(filePath, { encoding: "utf8" })
  const lines = readline.createInterface({
    input,
    crlfDelay: Infinity,
  })

  for await (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      continue
    }

    onValue(parse(JSON.parse(trimmed)))
  }
}

function insertMetadata(database: Database, values: Record<string, string>) {
  const insert = database.query<never, [string, string]>(
    "insert into metadata (key, value) values (?, ?)",
  )

  for (const [key, value] of Object.entries(values)) {
    insert.run(key, value)
  }
}

async function importKnowledgeGraphDatabase(input: {
  databasePath: string
  nodesPath: string
  relationshipsPath: string
  metadata: ArtifactMetadata
}) {
  const database = createDatabase(input.databasePath)

  const insertGraphNode = database.query<never, [string, string, string, string, string]>(
    `
      insert into graph_nodes (identifier, type, primary_label, labels_json, properties_json)
      values (?, ?, ?, ?, ?)
    `,
  )
  const insertGraphRelationship = database.query<
    never,
    [string, string, string, string, string, string, string, string]
  >(
    `
      insert into graph_relationships (
        identifier,
        type,
        label,
        source_identifier,
        target_identifier,
        source_labels_json,
        target_labels_json,
        properties_json
      )
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
  const insertStandard = database.query<
    never,
    [
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
    ]
  >(
    `
      insert into standards (id, code, description, subject, jurisdiction, grade_level, case_uuid)
      values (?, ?, ?, ?, ?, ?, ?)
    `,
  )
  const insertLearningComponent = database.query<never, [string, string | null, string | null]>(
    `
      insert into learning_components (id, description, subject)
      values (?, ?, ?)
    `,
  )
  const insertRelationship = database.query<never, [string, string, string]>(
    `
      insert into relationships (label, source_id, target_id)
      values (?, ?, ?)
    `,
  )

  let nodeCount = 0
  let relationshipCount = 0

  database.exec("begin immediate transaction")

  try {
    await eachJsonlLine(input.nodesPath, validateKnowledgeGraphNodeSchema, (node) => {
      const graphNode = preparedNodeRecord(node)
      insertGraphNode.run(
        graphNode.identifier,
        graphNode.type,
        graphNode.primaryLabel,
        graphNode.labelsJSON,
        graphNode.propertiesJSON,
      )

      const standard = preparedStandardRecord(node)
      if (standard) {
        insertStandard.run(
          standard.id,
          standard.code,
          standard.description,
          standard.subject,
          standard.jurisdiction,
          standard.gradeLevel,
          standard.caseUUID,
        )
      }

      const learningComponent = preparedLearningComponentRecord(node)
      if (learningComponent) {
        insertLearningComponent.run(
          learningComponent.id,
          learningComponent.description,
          learningComponent.subject,
        )
      }

      nodeCount += 1
      if (nodeCount % SQLITE_BATCH_SIZE === 0) {
        console.log(`[knowledge-graph] imported ${nodeCount.toLocaleString()} nodes`)
      }
    })

    await eachJsonlLine(
      input.relationshipsPath,
      validateKnowledgeGraphRelationshipSchema,
      (relationship) => {
        const graphRelationship = preparedRelationshipRecord(relationship)
        insertGraphRelationship.run(
          graphRelationship.identifier,
          graphRelationship.type,
          graphRelationship.label,
          graphRelationship.sourceIdentifier,
          graphRelationship.targetIdentifier,
          graphRelationship.sourceLabelsJSON,
          graphRelationship.targetLabelsJSON,
          graphRelationship.propertiesJSON,
        )

        insertRelationship.run(
          relationship.label,
          relationship.source_identifier,
          relationship.target_identifier,
        )

        relationshipCount += 1
        if (relationshipCount % SQLITE_BATCH_SIZE === 0) {
          console.log(
            `[knowledge-graph] imported ${relationshipCount.toLocaleString()} relationships`,
          )
        }
      },
    )

    insertMetadata(database, {
      schema_version: input.metadata.schemaVersion,
      version: input.metadata.version,
      nodes_url: input.metadata.nodesURL,
      relationships_url: input.metadata.relationshipsURL,
      node_count: String(nodeCount),
      relationship_count: String(relationshipCount),
      built_at: new Date().toISOString(),
    })

    database.exec("commit")
    database.exec("vacuum")
  } catch (error) {
    database.exec("rollback")
    throw error
  } finally {
    database.close()
  }
}

async function writeKnowledgeGraphArtifacts(input: {
  databasePath: string
  nodes: SourceFileInfo
  outputDir: string
  relationships: SourceFileInfo
  schemaVersion: string
  version: string
}) {
  const archivePath = outputArchivePath(input.outputDir)
  const databaseStats = await fileHashAndSize(input.databasePath)

  try {
    await runCommand({
      binary: "zstd",
      args: [
        `-${KNOWLEDGE_GRAPH_ZSTD_LEVEL}`,
        KNOWLEDGE_GRAPH_ZSTD_THREADS_FLAG,
        "-f",
        input.databasePath,
        "-o",
        archivePath,
      ],
    })
  } catch (error) {
    if (!(error instanceof Error) || !/spawn zstd ENOENT/.test(error.message)) {
      throw error
    }

    await ensureZstdInitialized()
    const databaseBytes = readFileSync(input.databasePath)
    const archiveBytes = Buffer.from(compress(databaseBytes, KNOWLEDGE_GRAPH_ZSTD_LEVEL))
    await writeFile(archivePath, archiveBytes)
  }

  const archiveStats = await fileHashAndSize(archivePath)
  const builtAt = new Date().toISOString()
  const manifest = createKnowledgeGraphArtifactManifest({
    archiveChecksum: archiveStats.sha256,
    archiveSizeBytes: archiveStats.size,
    builtAt,
    databaseChecksum: databaseStats.sha256,
    databaseSizeBytes: databaseStats.size,
    nodesURL: input.nodes.url,
    relationshipsURL: input.relationships.url,
    schemaVersion: input.schemaVersion,
    version: input.version,
  })
  const lockfile = createKnowledgeGraphLockfile({
    archiveSha256: manifest.archiveChecksum,
    databaseSha256: manifest.databaseChecksum,
    build: {
      schemaVersion: input.schemaVersion,
    },
    source: {
      nodes: {
        sha256: input.nodes.sha256,
        size: input.nodes.size,
        url: input.nodes.url,
      },
      relationships: {
        sha256: input.relationships.sha256,
        size: input.relationships.size,
        url: input.relationships.url,
      },
      version: input.version,
    },
  })

  const manifestPath = outputManifestPath(input.outputDir)
  const checksumPath = outputArchiveChecksumPath(input.outputDir)
  const lockfilePath = outputLockfilePath(input.outputDir)

  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    writeFile(checksumPath, knowledgeGraphArchiveChecksumFileContents(manifest), "utf8"),
    writeFile(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`, "utf8"),
  ])

  console.log(`[knowledge-graph] wrote archive ${archivePath}`)
  console.log(`[knowledge-graph] wrote manifest ${manifestPath}`)
  console.log(`[knowledge-graph] wrote checksum ${checksumPath}`)
  console.log(`[knowledge-graph] wrote lockfile ${lockfilePath}`)
}

export async function runKnowledgeGraphUpdate(args: string[]) {
  const options = parseOptions(args)
  console.log(`[knowledge-graph] validating remote core schema for ${options.version}`)
  await assertRemoteCoreSchema({
    nodesURL: options.nodesURL,
    relationshipsURL: options.relationshipsURL,
  })

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "buddy-knowledge-graph-"))
  const tempDatabasePath = path.resolve(tempDir, KNOWLEDGE_GRAPH_DB_FILENAME)

  try {
    console.log("[knowledge-graph] downloading source exports")
    const downloads = await downloadKnowledgeGraphFiles({
      tempDir,
      nodesURL: options.nodesURL,
      relationshipsURL: options.relationshipsURL,
    })
    const [nodes, relationships] = await Promise.all([
      fileInfo({ path: downloads.nodesPath, url: options.nodesURL }),
      fileInfo({ path: downloads.relationshipsPath, url: options.relationshipsURL }),
    ])
    const expectedMetadata: ArtifactMetadata = {
      version: options.version,
      nodesURL: options.nodesURL,
      relationshipsURL: options.relationshipsURL,
      schemaVersion: SQLITE_SCHEMA_VERSION,
    }

    console.log("[knowledge-graph] building sqlite artifact")
    await importKnowledgeGraphDatabase({
      databasePath: tempDatabasePath,
      nodesPath: downloads.nodesPath,
      relationshipsPath: downloads.relationshipsPath,
      metadata: expectedMetadata,
    })

    mkdirSync(options.outputDir, { recursive: true })
    await writeKnowledgeGraphArtifacts({
      databasePath: tempDatabasePath,
      nodes,
      outputDir: options.outputDir,
      relationships,
      schemaVersion: SQLITE_SCHEMA_VERSION,
      version: options.version,
    })
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export const runKnowledgeGraphBuild = runKnowledgeGraphUpdate
