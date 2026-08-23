import { spawnSync } from "node:child_process"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  parseSystemSkillPack,
  systemSkillPackFileBytes,
  type SystemSkillPack,
} from "../src/learning/skill-management/service/system-pack"

const PUBLIC_SKILLS_DIRECTORY_NAME = "skills"
const PUBLIC_SKILLS_TEMP_DIRECTORY_PREFIX = "buddy-public-skills-"
const PUBLIC_SKILLS_VERIFICATION_DIRECTORY_NAME = "verification"
const PUBLIC_SKILLS_CHECKOUT_DIRECTORY_NAME = "checkout"
const PUBLIC_SKILLS_DEFAULT_BRANCH = "main"
const PUBLIC_SKILLS_GIT_AUTHOR_NAME = "Buddy Skills Publisher"
const PUBLIC_SKILLS_GIT_AUTHOR_EMAIL = "skills@buddy.sh"
const PUBLIC_SKILLS_REPOSITORY_TOKEN_ENV = "BUDDY_SKILLS_REPOSITORY_TOKEN"
const GIT_SUCCESS_STATUS = 0
const SOURCE_SHA_MINIMUM_LENGTH = 7
const SOURCE_SHA_PATTERN = /^[0-9a-f]+$/

type PublicSkillRepositoryInput = {
  environment: NodeJS.ProcessEnv
  pack: SystemSkillPack
  remoteUrl: string
  sourceSha: string
}

type PreparedPublicSkillRepository = {
  changed: boolean
  checkoutDirectory: string
  commitSha: string
  environment: NodeJS.ProcessEnv
  pack: SystemSkillPack
  remoteUrl: string
  temporaryDirectory: string
}

type PublicSkillRepositorySyncResult = {
  changed: boolean
  commitSha: string
}

function normalizedSourceSha(sourceSha: string): string {
  const normalized = sourceSha.trim().toLowerCase()
  if (
    normalized.length < SOURCE_SHA_MINIMUM_LENGTH ||
    !SOURCE_SHA_PATTERN.test(normalized)
  ) {
    throw new Error("Buddy source SHA must be a hexadecimal Git commit identifier")
  }
  return normalized
}

function requirePublicSkillRepositoryToken(environment: NodeJS.ProcessEnv): void {
  if (!environment[PUBLIC_SKILLS_REPOSITORY_TOKEN_ENV]?.trim()) {
    throw new Error(`${PUBLIC_SKILLS_REPOSITORY_TOKEN_ENV} is required to publish public skills`)
  }
}

function gitEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const token = environment[PUBLIC_SKILLS_REPOSITORY_TOKEN_ENV]?.trim()
  if (!token) {
    return {
      ...environment,
      GIT_TERMINAL_PROMPT: "0",
    }
  }

  return {
    ...environment,
    BUDDY_PUBLIC_SKILLS_GIT_TOKEN: token,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0:
      '!f() { echo "username=x-access-token"; echo "password=$BUDDY_PUBLIC_SKILLS_GIT_TOKEN"; }; f',
    GIT_TERMINAL_PROMPT: "0",
  }
}

function runGit(input: {
  args: readonly string[]
  cwd?: string
  environment: NodeJS.ProcessEnv
}): string {
  const result = spawnSync("git", [...input.args], {
    cwd: input.cwd,
    encoding: "utf8",
    env: gitEnvironment(input.environment),
  })
  if (result.error) {
    throw new Error(`git ${input.args.join(" ")} failed to start: ${result.error.message}`, {
      cause: result.error,
    })
  }
  if (result.status !== GIT_SUCCESS_STATUS) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || "unknown Git failure"
    throw new Error(`git ${input.args.join(" ")} failed: ${detail}`)
  }
  return result.stdout?.trim() ?? ""
}

function expectedSkillFiles(pack: SystemSkillPack): ReadonlyMap<string, Uint8Array> {
  const parsed = parseSystemSkillPack(pack)
  return new Map(
    parsed.skills.flatMap((skill) =>
      skill.files.map((file) => [
        path.join(skill.name, ...file.path.split("/")),
        systemSkillPackFileBytes(file),
      ]),
    ),
  )
}

async function collectRegularFiles(input: {
  currentDirectory: string
  rootDirectory: string
}): Promise<ReadonlyMap<string, Uint8Array>> {
  const entries = await fsp.readdir(input.currentDirectory, { withFileTypes: true }).catch(() => [])
  const files = new Map<string, Uint8Array>()

  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(input.currentDirectory, entry.name)
    if (entry.isDirectory()) {
      const nested = await collectRegularFiles({
        currentDirectory: entryPath,
        rootDirectory: input.rootDirectory,
      })
      for (const [relativePath, bytes] of nested) files.set(relativePath, bytes)
      continue
    }
    if (!entry.isFile()) {
      throw new Error(`Public skill repository contains unsupported entry: ${entryPath}`)
    }
    files.set(path.relative(input.rootDirectory, entryPath), await fsp.readFile(entryPath))
  }

  return files
}

async function verifyPublicSkillRepositoryDirectory(
  pack: SystemSkillPack,
  repositoryRoot: string,
): Promise<void> {
  const expected = expectedSkillFiles(pack)
  const skillsRoot = path.join(repositoryRoot, PUBLIC_SKILLS_DIRECTORY_NAME)
  const actual = await collectRegularFiles({
    currentDirectory: skillsRoot,
    rootDirectory: skillsRoot,
  })
  const expectedPaths = Array.from(expected.keys()).toSorted()
  const actualPaths = Array.from(actual.keys()).toSorted()

  if (
    expectedPaths.length !== actualPaths.length ||
    expectedPaths.some((relativePath, index) => relativePath !== actualPaths[index])
  ) {
    throw new Error("Public skill repository file list does not match the system skill pack")
  }

  for (const relativePath of expectedPaths) {
    const expectedBytes = expected.get(relativePath)
    const actualBytes = actual.get(relativePath)
    if (
      !expectedBytes ||
      !actualBytes ||
      !Buffer.from(expectedBytes).equals(Buffer.from(actualBytes))
    ) {
      throw new Error(`Public skill repository file differs from the system pack: ${relativePath}`)
    }
  }
}

async function materializePublicSkillRepository(
  pack: SystemSkillPack,
  repositoryRoot: string,
): Promise<void> {
  const skillsRoot = path.join(repositoryRoot, PUBLIC_SKILLS_DIRECTORY_NAME)
  const files = expectedSkillFiles(pack)
  await fsp.rm(skillsRoot, { recursive: true, force: true })

  await Promise.all(
    Array.from(files.entries()).map(async ([relativePath, bytes]) => {
      const destination = path.join(skillsRoot, relativePath)
      await fsp.mkdir(path.dirname(destination), { recursive: true })
      await fsp.writeFile(destination, bytes)
    }),
  )
  await verifyPublicSkillRepositoryDirectory(pack, repositoryRoot)
}

async function preparePublicSkillRepository(
  input: PublicSkillRepositoryInput,
): Promise<PreparedPublicSkillRepository> {
  const sourceSha = normalizedSourceSha(input.sourceSha)
  const temporaryDirectory = await fsp.mkdtemp(
    path.join(os.tmpdir(), PUBLIC_SKILLS_TEMP_DIRECTORY_PREFIX),
  )
  const checkoutDirectory = path.join(
    temporaryDirectory,
    PUBLIC_SKILLS_CHECKOUT_DIRECTORY_NAME,
  )

  try {
    runGit({
      args: [
        "clone",
        "--depth",
        "1",
        "--branch",
        PUBLIC_SKILLS_DEFAULT_BRANCH,
        input.remoteUrl,
        checkoutDirectory,
      ],
      environment: input.environment,
    })
    await materializePublicSkillRepository(input.pack, checkoutDirectory)
    runGit({
      args: ["add", "--all", "--", PUBLIC_SKILLS_DIRECTORY_NAME],
      cwd: checkoutDirectory,
      environment: input.environment,
    })
    const changed =
      runGit({
        args: ["status", "--short", "--", PUBLIC_SKILLS_DIRECTORY_NAME],
        cwd: checkoutDirectory,
        environment: input.environment,
      }).length > 0

    if (changed) {
      runGit({
        args: ["config", "user.name", PUBLIC_SKILLS_GIT_AUTHOR_NAME],
        cwd: checkoutDirectory,
        environment: input.environment,
      })
      runGit({
        args: ["config", "user.email", PUBLIC_SKILLS_GIT_AUTHOR_EMAIL],
        cwd: checkoutDirectory,
        environment: input.environment,
      })
      runGit({
        args: [
          "commit",
          "-m",
          `Sync skills from buddy@${sourceSha.slice(0, SOURCE_SHA_MINIMUM_LENGTH)}`,
          "-m",
          `System skill content: ${input.pack.contentFingerprint}`,
        ],
        cwd: checkoutDirectory,
        environment: input.environment,
      })
    }

    const commitSha = runGit({
      args: ["rev-parse", "HEAD"],
      cwd: checkoutDirectory,
      environment: input.environment,
    })
    return {
      changed,
      checkoutDirectory,
      commitSha,
      environment: input.environment,
      pack: input.pack,
      remoteUrl: input.remoteUrl,
      temporaryDirectory,
    }
  } catch (cause) {
    await fsp.rm(temporaryDirectory, { recursive: true, force: true })
    throw cause
  }
}

async function publishPreparedPublicSkillRepository(
  prepared: PreparedPublicSkillRepository,
): Promise<PublicSkillRepositorySyncResult> {
  if (prepared.changed) {
    runGit({
      args: ["push", "origin", `HEAD:refs/heads/${PUBLIC_SKILLS_DEFAULT_BRANCH}`],
      cwd: prepared.checkoutDirectory,
      environment: prepared.environment,
    })
  }

  const verificationDirectory = path.join(
    prepared.temporaryDirectory,
    PUBLIC_SKILLS_VERIFICATION_DIRECTORY_NAME,
  )
  runGit({
    args: [
      "clone",
      "--depth",
      "1",
      "--branch",
      PUBLIC_SKILLS_DEFAULT_BRANCH,
      prepared.remoteUrl,
      verificationDirectory,
    ],
    environment: prepared.environment,
  })
  const verifiedCommitSha = runGit({
    args: ["rev-parse", "HEAD"],
    cwd: verificationDirectory,
    environment: prepared.environment,
  })
  if (verifiedCommitSha !== prepared.commitSha) {
    throw new Error("Public skill repository moved while the published skill pack was verified")
  }
  await verifyPublicSkillRepositoryDirectory(prepared.pack, verificationDirectory)
  return {
    changed: prepared.changed,
    commitSha: verifiedCommitSha,
  }
}

async function disposePreparedPublicSkillRepository(
  prepared: PreparedPublicSkillRepository,
): Promise<void> {
  await fsp.rm(prepared.temporaryDirectory, { recursive: true, force: true })
}

export {
  disposePreparedPublicSkillRepository,
  materializePublicSkillRepository,
  preparePublicSkillRepository,
  publishPreparedPublicSkillRepository,
  requirePublicSkillRepositoryToken,
  verifyPublicSkillRepositoryDirectory,
}

export type {
  PreparedPublicSkillRepository,
  PublicSkillRepositoryInput,
  PublicSkillRepositorySyncResult,
}
