import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { skillSourceRefSchema, type SkillSourceRef } from "./catalog-schemas"
import { SkillServiceError } from "./contracts"
import {
  assertSkillTreeLimits,
  DEFAULT_SKILL_TREE_LIMITS,
  type SkillTreeLimits,
} from "./tree-limits"

const DEFAULT_GITHUB_REMOTE_BASE_URL = "https://github.com"
const GIT_FETCH_TIMEOUT_MS = 120_000
const GIT_PROCESS_KILL_GRACE_MS = 1_000
const GIT_STDERR_MAX_BYTES = 8_192
const SKILL_DOCUMENT_FILENAME = "SKILL.md"

export type GitCommandResult = {
  code: number
  stdout: string
  stderr: string
}

export type GitCommandRunner = (input: {
  args: string[]
  cwd: string
  timeoutMs: number
}) => Promise<GitCommandResult>

export type FetchedGitHubSkill = {
  source: SkillSourceRef
  tempRoot: string
  skillRoot: string
  stats: {
    fileCount: number
    totalBytes: number
  }
  cleanup: () => Promise<void>
}

export type FetchPinnedGitHubSkillOptions = {
  limits?: Partial<SkillTreeLimits>
  remoteBaseUrl?: string
  runGit?: GitCommandRunner
  timeoutMs?: number
}

function fetchTreeLimits(limits?: Partial<SkillTreeLimits>): Partial<SkillTreeLimits> {
  const maxTotalBytes = limits?.maxTotalBytes ?? DEFAULT_SKILL_TREE_LIMITS.maxTotalBytes
  const maxFileBytes = limits?.maxFileBytes ?? DEFAULT_SKILL_TREE_LIMITS.maxFileBytes

  return {
    ...limits,
    // The fetch stage should still reject oversized trees, but oversized single files are
    // scanner warnings rather than hard blocks.
    maxFileBytes: Math.max(maxFileBytes, maxTotalBytes),
  }
}

function gitFailureMessage(result: GitCommandResult): string {
  const output = result.stderr.trim() || result.stdout.trim() || `git exited with ${result.code}`
  return output.slice(0, GIT_STDERR_MAX_BYTES)
}

async function runGitCommand(input: {
  args: string[]
  cwd: string
  timeoutMs: number
}): Promise<GitCommandResult> {
  const process = Bun.spawn(["git", ...input.args], {
    cwd: input.cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const killTimer = setTimeout(() => {
    process.kill()
  }, input.timeoutMs)

  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])
    return {
      code,
      stdout,
      stderr,
    }
  } finally {
    clearTimeout(killTimer)
  }
}

async function checkedGit(input: {
  args: string[]
  cwd: string
  runGit: GitCommandRunner
  timeoutMs: number
}): Promise<void> {
  const result = await input.runGit({
    args: input.args,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
  })
  if (result.code !== 0) {
    throw new SkillServiceError(
      "upstream_failure",
      `GitHub fetch failed: ${gitFailureMessage(result)}`,
    )
  }
}

function parseGitHubSource(source: SkillSourceRef): SkillSourceRef {
  const result = skillSourceRefSchema.safeParse(source)
  if (!result.success) {
    throw new SkillServiceError(
      "invalid_input",
      "GitHub source must include repo, path, and full commit SHA",
    )
  }
  return result.data
}

function normalizeSourcePath(sourcePath: string): string {
  const normalized = sourcePath.trim().replaceAll("\\", "/")
  const segments = normalized.split("/").filter((segment) => segment && segment !== ".")
  if (normalized.startsWith("/") || segments.some((segment) => segment === "..")) {
    throw new SkillServiceError("invalid_input", "GitHub source path must be relative")
  }
  return segments.length === 0 ? "." : segments.join("/")
}

function githubRemoteUrl(source: SkillSourceRef, remoteBaseUrl?: string): string {
  const baseUrl = (remoteBaseUrl ?? DEFAULT_GITHUB_REMOTE_BASE_URL).replace(/\/+$/, "")
  return `${baseUrl}/${source.repo}.git`
}

async function ensureSkillDocument(skillRoot: string): Promise<void> {
  const stat = await fsp.stat(path.join(skillRoot, SKILL_DOCUMENT_FILENAME)).catch(() => undefined)
  if (!stat?.isFile()) {
    throw new SkillServiceError("not_found", "Fetched GitHub source is missing SKILL.md")
  }
}

export async function fetchPinnedGitHubSkill(
  source: SkillSourceRef,
  options?: FetchPinnedGitHubSkillOptions,
): Promise<FetchedGitHubSkill> {
  const parsedSource = parseGitHubSource(source)
  const sourcePath = normalizeSourcePath(parsedSource.path)
  const timeoutMs = Math.max(GIT_PROCESS_KILL_GRACE_MS, options?.timeoutMs ?? GIT_FETCH_TIMEOUT_MS)
  const runGit = options?.runGit ?? runGitCommand
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-skill-github-"))
  const checkoutRoot = path.join(tempRoot, "repo")

  try {
    await fsp.mkdir(checkoutRoot, { recursive: true })
    await checkedGit({ args: ["init", "-q"], cwd: checkoutRoot, runGit, timeoutMs })
    await checkedGit({
      args: ["remote", "add", "origin", githubRemoteUrl(parsedSource, options?.remoteBaseUrl)],
      cwd: checkoutRoot,
      runGit,
      timeoutMs,
    })
    if (sourcePath !== ".") {
      await checkedGit({
        args: ["config", "core.sparseCheckout", "true"],
        cwd: checkoutRoot,
        runGit,
        timeoutMs,
      })
      await checkedGit({
        args: ["sparse-checkout", "set", sourcePath],
        cwd: checkoutRoot,
        runGit,
        timeoutMs,
      })
    }
    await checkedGit({
      args: ["fetch", "--depth", "1", "origin", parsedSource.ref],
      cwd: checkoutRoot,
      runGit,
      timeoutMs,
    })
    await checkedGit({
      args: ["checkout", "-q", "FETCH_HEAD"],
      cwd: checkoutRoot,
      runGit,
      timeoutMs,
    })

    const skillRoot =
      sourcePath === "." ? checkoutRoot : path.join(checkoutRoot, ...sourcePath.split("/"))
    const skillRootStat = await fsp.stat(skillRoot).catch(() => undefined)
    if (!skillRootStat?.isDirectory()) {
      throw new SkillServiceError("not_found", "GitHub source path does not exist")
    }
    await ensureSkillDocument(skillRoot)
    const stats = await assertSkillTreeLimits(skillRoot, fetchTreeLimits(options?.limits))

    return {
      source: parsedSource,
      tempRoot,
      skillRoot,
      stats,
      cleanup: async () => {
        await fsp.rm(tempRoot, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
    if (error instanceof SkillServiceError) {
      throw error
    }
    throw new SkillServiceError(
      "upstream_failure",
      `GitHub fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
