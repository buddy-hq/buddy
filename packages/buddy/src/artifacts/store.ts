import type { Dirent } from "node:fs"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import z from "zod"
import { writeJsonFileAtomic, writeTextFileAtomic } from "../storage/atomic-file"
import { ArtifactLoadError, ArtifactNotFoundError } from "./errors"
import { ArtifactPath } from "./path"
import {
  ARTIFACT_MANIFEST_FILE_NAME,
  ArtifactIDSchema,
  type ArtifactKind,
} from "./kinds"

const ARTIFACT_STAGING_DIRECTORY_PREFIX = ".artifact-"
const ARTIFACT_STAGING_DIRECTORY_SUFFIX = ".tmp"

type ArtifactLoadErrorRecord = {
  artifactID: string
  kind: ArtifactKind
  message: string
}

type ArtifactListResult<TItem> = {
  items: TItem[]
  loadErrors: ArtifactLoadErrorRecord[]
}

type ArtifactListEntryResult<TManifest> =
  | {
      kind: "item"
      manifest: TManifest
    }
  | {
      kind: "error"
      loadError: ArtifactLoadErrorRecord
    }
  | {
      kind: "ignored"
    }

type ArtifactContentFile =
  | {
      relativePath: string
      content: string
      format: "text"
    }
  | {
      relativePath: string
      content: unknown
      format: "json"
    }

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === code
  )
}

function isStaleArtifactManifestError(error: unknown): boolean {
  if (!(error instanceof z.ZodError)) {
    return false
  }
  return error.issues.some(
    (issue) =>
      issue.code === "invalid_value" &&
      issue.path.length === 2 &&
      issue.path[0] === "origin" &&
      issue.path[1] === "kind",
  )
}

function generateArtifactID(): string {
  return ulid()
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return false
    }
    throw error
  }
}

async function writeArtifactContentFile(input: {
  artifactDirectory: string
  file: ArtifactContentFile
}): Promise<void> {
  const targetPath = path.join(input.artifactDirectory, input.file.relativePath)
  if (input.file.format === "json") {
    await writeJsonFileAtomic(targetPath, input.file.content)
    return
  }
  await writeTextFileAtomic(targetPath, input.file.content)
}

async function writeArtifactRecord(input: {
  directory: string
  kind: ArtifactKind
  artifactID: string
  manifest: unknown
  files?: readonly ArtifactContentFile[]
}): Promise<void> {
  const artifactID = ArtifactPath.sanitizeArtifactID(input.artifactID)
  const kindRoot = ArtifactPath.kindRoot(input.directory, input.kind)
  const targetDirectory = ArtifactPath.artifactDirectory(
    input.directory,
    input.kind,
    artifactID,
  )
  await fs.mkdir(kindRoot, { recursive: true })

  const stagingDirectory = path.join(
    kindRoot,
    `${ARTIFACT_STAGING_DIRECTORY_PREFIX}${artifactID}.${randomUUID()}${ARTIFACT_STAGING_DIRECTORY_SUFFIX}`,
  )
  await fs.mkdir(stagingDirectory)
  try {
    let replacingExistingArtifact = await pathExists(targetDirectory)
    if (replacingExistingArtifact) {
      try {
        await fs.cp(targetDirectory, stagingDirectory, { recursive: true, force: true })
      } catch (error) {
        if (isNodeErrorCode(error, "ENOENT")) {
          replacingExistingArtifact = false
        } else {
          throw error
        }
      }
    }

    for (const file of input.files ?? []) {
      await writeArtifactContentFile({
        artifactDirectory: stagingDirectory,
        file,
      })
    }
    await writeJsonFileAtomic(
      path.join(stagingDirectory, ARTIFACT_MANIFEST_FILE_NAME),
      input.manifest,
    )
    if (!replacingExistingArtifact) {
      await fs.rename(stagingDirectory, targetDirectory)
      return
    }

    const backupDirectory = path.join(
      kindRoot,
      `${ARTIFACT_STAGING_DIRECTORY_PREFIX}${artifactID}.${randomUUID()}.backup${ARTIFACT_STAGING_DIRECTORY_SUFFIX}`,
    )
    try {
      await fs.rename(targetDirectory, backupDirectory)
    } catch (error) {
      if (!isNodeErrorCode(error, "ENOENT")) {
        throw error
      }
    }

    try {
      await fs.rename(stagingDirectory, targetDirectory)
    } catch (error) {
      await fs.rename(backupDirectory, targetDirectory).catch(() => undefined)
      throw error
    }
    await fs.rm(backupDirectory, { recursive: true, force: true }).catch(() => undefined)
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function writeArtifactManifest(input: {
  directory: string
  kind: ArtifactKind
  artifactID: string
  manifest: unknown
}): Promise<void> {
  await writeJsonFileAtomic(
    ArtifactPath.manifestFile(input.directory, input.kind, input.artifactID),
    input.manifest,
  )
}

async function readJsonFile<T>(filePath: string, schema: z.ZodSchema<T>): Promise<T> {
  const text = await fs.readFile(filePath, "utf8")
  const parsed: unknown = JSON.parse(text)
  return schema.parse(parsed)
}

async function readArtifactManifest<T>(input: {
  directory: string
  kind: ArtifactKind
  artifactID: string
  schema: z.ZodSchema<T>
}): Promise<T> {
  const artifactID = ArtifactPath.sanitizeArtifactID(input.artifactID)
  try {
    return await readJsonFile(
      ArtifactPath.manifestFile(input.directory, input.kind, artifactID),
      input.schema,
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      throw new ArtifactNotFoundError(input.kind, artifactID)
    }
    throw error
  }
}

async function readArtifactTextFile(input: {
  directory: string
  kind: ArtifactKind
  artifactID: string
  relativePath: string
}): Promise<string> {
  const artifactID = ArtifactPath.sanitizeArtifactID(input.artifactID)
  try {
    return await fs.readFile(
      ArtifactPath.artifactFile(input.directory, input.kind, artifactID, input.relativePath),
      "utf8",
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      throw new ArtifactNotFoundError(input.kind, artifactID)
    }
    throw error
  }
}

async function readArtifactJsonFile<T>(input: {
  directory: string
  kind: ArtifactKind
  artifactID: string
  relativePath: string
  schema: z.ZodSchema<T>
}): Promise<T> {
  const artifactID = ArtifactPath.sanitizeArtifactID(input.artifactID)
  try {
    return await readJsonFile(
      ArtifactPath.artifactFile(input.directory, input.kind, artifactID, input.relativePath),
      input.schema,
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      throw new ArtifactNotFoundError(input.kind, artifactID)
    }
    throw error
  }
}

async function removeArtifactDirectory(input: {
  directory: string
  kind: ArtifactKind
  artifactID: string
}): Promise<void> {
  await fs.rm(ArtifactPath.artifactDirectory(input.directory, input.kind, input.artifactID), {
    recursive: true,
    force: true,
  })
}

async function collectKindDirectoryEntries(
  directory: string,
  kind: ArtifactKind,
): Promise<Dirent[]> {
  try {
    return await fs.readdir(ArtifactPath.kindRoot(directory, kind), { withFileTypes: true })
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return []
    }
    throw error
  }
}

async function garbageCollectArtifactKindOrphans(input: {
  directory: string
  kind: ArtifactKind
}): Promise<void> {
  const entries = await collectKindDirectoryEntries(input.directory, input.kind)
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<void> => {
        if (
          entry.name.startsWith(ARTIFACT_STAGING_DIRECTORY_PREFIX) &&
          entry.name.endsWith(ARTIFACT_STAGING_DIRECTORY_SUFFIX)
        ) {
          await fs.rm(path.join(ArtifactPath.kindRoot(input.directory, input.kind), entry.name), {
            recursive: true,
            force: true,
          })
          return
        }
        if (!ArtifactIDSchema.safeParse(entry.name).success) {
          return
        }
        const manifestPath = ArtifactPath.manifestFile(input.directory, input.kind, entry.name)
        if (await pathExists(manifestPath)) {
          return
        }
        await removeArtifactDirectory({
          directory: input.directory,
          kind: input.kind,
          artifactID: entry.name,
        })
      }),
  )
}

async function listArtifactManifests<TManifest extends { createdAt: string }>(input: {
  directory: string
  kind: ArtifactKind
  schema: z.ZodSchema<TManifest>
  include?: (manifest: TManifest) => boolean
}): Promise<ArtifactListResult<TManifest>> {
  const entries = await collectKindDirectoryEntries(input.directory, input.kind)
  const results = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && ArtifactIDSchema.safeParse(entry.name).success)
      .map(async (entry): Promise<ArtifactListEntryResult<TManifest>> => {
        try {
          const manifest = await readArtifactManifest({
            directory: input.directory,
            kind: input.kind,
            artifactID: entry.name,
            schema: input.schema,
          })
          return { kind: "item", manifest }
        } catch (error) {
          if (error instanceof ArtifactNotFoundError || isStaleArtifactManifestError(error)) {
            return { kind: "ignored" }
          }
          const loadError = new ArtifactLoadError(input.kind, entry.name, error)
          return {
            kind: "error",
            loadError: {
              artifactID: entry.name,
              kind: input.kind,
              message: loadError.message,
            },
          }
        }
      }),
  )

  const items: TManifest[] = []
  const loadErrors: ArtifactLoadErrorRecord[] = []
  for (const result of results) {
    if (result.kind === "item") {
      if (!input.include || input.include(result.manifest)) {
        items.push(result.manifest)
      }
    } else if (result.kind === "error") {
      loadErrors.push(result.loadError)
    }
  }

  return {
    items: items.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt)),
    loadErrors: loadErrors.toSorted((left, right) =>
      left.artifactID.localeCompare(right.artifactID),
    ),
  }
}

export {
  garbageCollectArtifactKindOrphans,
  generateArtifactID,
  isNodeErrorCode,
  isStaleArtifactManifestError,
  listArtifactManifests,
  readArtifactJsonFile,
  readArtifactManifest,
  readArtifactTextFile,
  readJsonFile,
  writeArtifactManifest,
  writeArtifactRecord,
}

export type { ArtifactContentFile, ArtifactListResult, ArtifactLoadErrorRecord }
