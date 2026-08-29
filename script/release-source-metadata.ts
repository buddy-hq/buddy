#!/usr/bin/env bun

import { spawnSync } from "node:child_process"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { z } from "zod"
import { uploadReleaseAssetSafely } from "./release/assets"

const RELEASE_SOURCE_METADATA_FILENAME = "buddy-release-source.json"
const RELEASE_SOURCE_METADATA_SCHEMA_VERSION = 1
const RELEASE_SOURCE_METADATA_TEMP_DIRECTORY_PREFIX = "buddy-release-source-"
const RELEASE_SOURCE_MODE_RECORD = "record"
const RELEASE_SOURCE_MODE_VERIFY = "verify"
const TRUE_ENV_VALUE = "1"

type ReleaseSourceMetadata = {
  schemaVersion: typeof RELEASE_SOURCE_METADATA_SCHEMA_VERSION
  sourceRepository: string
  sourceSha: string
}

type ReleaseSourceMode = typeof RELEASE_SOURCE_MODE_RECORD | typeof RELEASE_SOURCE_MODE_VERIFY

const releaseSourceMetadataSchema = z.object({
  schemaVersion: z.literal(RELEASE_SOURCE_METADATA_SCHEMA_VERSION),
  sourceRepository: z.string(),
  sourceSha: z.string(),
})

function normalizeSourceSha(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("Release source SHA must be a full 40-character Git commit SHA")
  }
  return normalized
}

function parseReleaseSourceMetadata<TValue>(value: TValue): ReleaseSourceMetadata {
  const parsed = releaseSourceMetadataSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error("Invalid release source metadata")
  }

  const sourceRepository = parsed.data.sourceRepository.trim()
  if (!sourceRepository) {
    throw new Error("Invalid release source metadata")
  }

  return {
    schemaVersion: RELEASE_SOURCE_METADATA_SCHEMA_VERSION,
    sourceRepository,
    sourceSha: normalizeSourceSha(parsed.data.sourceSha),
  }
}

function renderReleaseSourceMetadata(metadata: ReleaseSourceMetadata): string {
  return `${JSON.stringify(parseReleaseSourceMetadata(metadata), null, 2)}\n`
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

function releaseSourceMode(environment: NodeJS.ProcessEnv): ReleaseSourceMode {
  const value = requiredEnvironmentValue(environment, "BUDDY_RELEASE_SOURCE_MODE")
  if (value === RELEASE_SOURCE_MODE_RECORD || value === RELEASE_SOURCE_MODE_VERIFY) return value
  throw new Error(`Unsupported release source mode: ${value}`)
}

function runGh(args: string[], environment: NodeJS.ProcessEnv): void {
  const result = spawnSync("gh", args, {
    env: environment,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed`)
  }
}

async function withTemporaryDirectory<T>(work: (directory: string) => Promise<T>): Promise<T> {
  const directory = await fsp.mkdtemp(
    path.join(os.tmpdir(), RELEASE_SOURCE_METADATA_TEMP_DIRECTORY_PREFIX),
  )
  try {
    return await work(directory)
  } finally {
    await fsp.rm(directory, { recursive: true, force: true })
  }
}

async function recordReleaseSourceMetadata(input: {
  environment: NodeJS.ProcessEnv
  metadata: ReleaseSourceMetadata
  releaseRepository: string
  releaseTag: string
}): Promise<void> {
  await withTemporaryDirectory(async (directory) => {
    const filepath = path.join(directory, RELEASE_SOURCE_METADATA_FILENAME)
    await fsp.writeFile(filepath, renderReleaseSourceMetadata(input.metadata), "utf8")
    await uploadReleaseAssetSafely({
      filePath: filepath,
      repository: input.releaseRepository,
      tag: input.releaseTag,
    })
  })
}

async function verifyReleaseSourceMetadata(input: {
  environment: NodeJS.ProcessEnv
  expected: ReleaseSourceMetadata
  releaseRepository: string
  releaseTag: string
}): Promise<void> {
  await withTemporaryDirectory(async (directory) => {
    runGh(
      [
        "release",
        "download",
        input.releaseTag,
        "--pattern",
        RELEASE_SOURCE_METADATA_FILENAME,
        "--dir",
        directory,
        "--repo",
        input.releaseRepository,
      ],
      input.environment,
    )
    const source = await fsp.readFile(
      path.join(directory, RELEASE_SOURCE_METADATA_FILENAME),
      "utf8",
    )
    const actual = parseReleaseSourceMetadata(JSON.parse(source))
    if (actual.sourceRepository !== input.expected.sourceRepository) {
      throw new Error(
        `Draft release was built from ${actual.sourceRepository}, expected ${input.expected.sourceRepository}`,
      )
    }
    if (actual.sourceSha !== input.expected.sourceSha) {
      throw new Error(
        `Draft release was built from ${actual.sourceSha}, expected current workflow SHA ${input.expected.sourceSha}`,
      )
    }
  })
}

async function main(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const mode = releaseSourceMode(environment)
  const metadata = parseReleaseSourceMetadata({
    schemaVersion: RELEASE_SOURCE_METADATA_SCHEMA_VERSION,
    sourceRepository: requiredEnvironmentValue(environment, "BUDDY_RELEASE_SOURCE_REPOSITORY"),
    sourceSha: requiredEnvironmentValue(environment, "BUDDY_RELEASE_SOURCE_SHA"),
  })
  if (environment.BUDDY_RELEASE_SOURCE_DRY_RUN?.trim() === TRUE_ENV_VALUE) {
    console.log(
      `Dry run: would ${mode} ${RELEASE_SOURCE_METADATA_FILENAME} for ${metadata.sourceRepository}@${metadata.sourceSha}`,
    )
    return
  }

  const releaseRepository = requiredEnvironmentValue(environment, "BUDDY_RELEASE_REPO")
  const releaseTag = requiredEnvironmentValue(environment, "BUDDY_RELEASE_TAG")
  if (mode === RELEASE_SOURCE_MODE_RECORD) {
    await recordReleaseSourceMetadata({
      environment,
      metadata,
      releaseRepository,
      releaseTag,
    })
    console.log(`Recorded release source ${metadata.sourceRepository}@${metadata.sourceSha}`)
    return
  }

  await verifyReleaseSourceMetadata({
    environment,
    expected: metadata,
    releaseRepository,
    releaseTag,
  })
  console.log(`Verified release source ${metadata.sourceRepository}@${metadata.sourceSha}`)
}

if (import.meta.main) {
  await main()
}

export { RELEASE_SOURCE_METADATA_FILENAME, parseReleaseSourceMetadata, renderReleaseSourceMetadata }

export type { ReleaseSourceMetadata }
