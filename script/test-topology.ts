#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"

import { TEST_FILE_PATTERN } from "./test-runner-plan"

const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..")
const VENDOR_PATH_PREFIX = "vendor/"
export const TEST_OWNERS_ENVIRONMENT_KEY = "BUDDY_TEST_OWNERS"
const GIT_LIST_FILES_COMMAND = [
  "git",
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
]

export type TestOwner = {
  id: string
  root: string
  runCommand: readonly string[]
  workingDirectory: string
}

export const TEST_OWNERS: readonly TestOwner[] = [
  {
    id: "browser-contract",
    root: "packages/browser-contract",
    runCommand: ["bun", "run", "test"],
    workingDirectory: "packages/browser-contract",
  },
  {
    id: "backend",
    root: "packages/buddy/test",
    runCommand: ["bun", "run", "test"],
    workingDirectory: "packages/buddy",
  },
  {
    id: "web",
    root: "packages/web/test",
    runCommand: ["bun", "run", "test"],
    workingDirectory: "packages/web",
  },
  {
    id: "desktop-electron",
    root: "packages/desktop-electron/test",
    runCommand: ["bun", "run", "test"],
    workingDirectory: "packages/desktop-electron",
  },
  {
    id: "opencode-adapter",
    root: "packages/opencode-adapter/test",
    runCommand: ["bun", "run", "test"],
    workingDirectory: "packages/opencode-adapter",
  },
  {
    id: "shared-script",
    root: "packages/script/src",
    runCommand: ["bun", "run", "test"],
    workingDirectory: "packages/script",
  },
  {
    id: "root-script",
    root: "script",
    runCommand: ["bun", "run", "test:root-scripts"],
    workingDirectory: ".",
  },
]

export function selectTestOwners(
  owners: readonly TestOwner[],
  configuredValue: string | undefined,
): readonly TestOwner[] {
  if (configuredValue === undefined || configuredValue.trim().length === 0) return owners

  const requestedOwnerIds = configuredValue.split(",").map((ownerId) => ownerId.trim())
  if (requestedOwnerIds.some((ownerId) => ownerId.length === 0)) {
    throw new Error(`${TEST_OWNERS_ENVIRONMENT_KEY} contains an empty owner ID`)
  }
  const uniqueOwnerIds = new Set(requestedOwnerIds)
  if (uniqueOwnerIds.size !== requestedOwnerIds.length) {
    throw new Error(`${TEST_OWNERS_ENVIRONMENT_KEY} contains duplicate owner IDs`)
  }

  const availableOwnerIds = new Set(owners.map((owner) => owner.id))
  const unknownOwnerIds = requestedOwnerIds.filter((ownerId) => !availableOwnerIds.has(ownerId))
  if (unknownOwnerIds.length > 0) {
    throw new Error(`Unknown ${TEST_OWNERS_ENVIRONMENT_KEY} owner IDs: ${unknownOwnerIds.join(", ")}`)
  }
  return owners.filter((owner) => uniqueOwnerIds.has(owner.id))
}

export type OwnedTestFile = {
  owner: TestOwner
  path: string
}

type TestOwnershipAssignment = {
  duplicate: readonly string[]
  owned: readonly OwnedTestFile[]
  unowned: readonly string[]
}

function normalizeRepositoryPath(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep)
}

function isWithinOwnerRoot(filePath: string, owner: TestOwner): boolean {
  return filePath === owner.root || filePath.startsWith(`${owner.root}/`)
}

function isExistingRegularFile(filePath: string): boolean {
  const absolutePath = path.join(REPOSITORY_ROOT, filePath)
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()
}

export function assignTestOwners(testFiles: readonly string[]): TestOwnershipAssignment {
  const duplicate: string[] = []
  const owned: OwnedTestFile[] = []
  const unowned: string[] = []

  for (const testFile of testFiles) {
    const matchingOwners = TEST_OWNERS.filter((owner) => isWithinOwnerRoot(testFile, owner))
    if (matchingOwners.length === 0) {
      unowned.push(testFile)
      continue
    }
    if (matchingOwners.length > 1) {
      duplicate.push(testFile)
      continue
    }

    const owner = matchingOwners[0]
    if (owner === undefined) throw new Error(`Test owner disappeared for ${testFile}`)
    owned.push({ owner, path: testFile })
  }

  return { duplicate, owned, unowned }
}

export async function listTrackedTestFiles(): Promise<readonly string[]> {
  const child = Bun.spawn(GIT_LIST_FILES_COMMAND, {
    cwd: REPOSITORY_ROOT,
    stderr: "inherit",
    stdout: "pipe",
  })
  const output = await new Response(child.stdout).text()
  const exitCode = await child.exited
  if (exitCode !== 0) {
    throw new Error(`git ls-files failed with exit code ${exitCode}`)
  }

  return output
    .split("\0")
    .filter((filePath) => filePath.length > 0)
    .map(normalizeRepositoryPath)
    .filter((filePath) => !filePath.startsWith(VENDOR_PATH_PREFIX))
    .filter((filePath) => TEST_FILE_PATTERN.test(filePath))
    .filter(isExistingRegularFile)
    .toSorted()
}

export async function verifyTestTopology(): Promise<readonly OwnedTestFile[]> {
  const testFiles = await listTrackedTestFiles()
  const assignment = assignTestOwners(testFiles)
  const errors: string[] = []

  if (assignment.unowned.length > 0) {
    errors.push(`Unowned test files:\n${assignment.unowned.join("\n")}`)
  }
  if (assignment.duplicate.length > 0) {
    errors.push(`Multiply-owned test files:\n${assignment.duplicate.join("\n")}`)
  }
  if (errors.length > 0) throw new Error(errors.join("\n\n"))

  const counts = new Map<string, number>()
  for (const testFile of assignment.owned) {
    counts.set(testFile.owner.id, (counts.get(testFile.owner.id) ?? 0) + 1)
  }

  for (const owner of TEST_OWNERS) {
    console.log(`[test:topology] ${owner.id}: ${counts.get(owner.id) ?? 0} files`)
  }
  console.log(`[test:topology] total: ${assignment.owned.length} files, exactly one owner each`)

  return assignment.owned
}

if (import.meta.main) {
  await verifyTestTopology()
}
