import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import * as OpenCodeProject from "opencode/project/project"
import { AppNodeBuilderV1 } from "opencode/effect/app-node-builder-v1"
import { makeRuntime } from "opencode/effect/run-service"

const runtime = makeRuntime(OpenCodeProject.Service, AppNodeBuilderV1.build(OpenCodeProject.node))
const FILE_REMOTE_PROTOCOL = "file:"
const SCP_LIKE_REMOTE_REGEX = /^([^@/:]+@)?([^/:]+):(.+)$/

type GitCommandResult = {
  status: number | null
  stdout: string
}

type LocalGitRepo = {
  root: string
  store: string
}

function runGit(cwd: string, args: string[]): GitCommandResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })

  return {
    status: result.status,
    stdout: result.stdout ?? "",
  }
}

function readTrimmedFile(filepath: string) {
  if (!existsSync(filepath)) return undefined
  try {
    const value = readFileSync(filepath, "utf8").trim()
    return value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

function resolveGitRepo(directory: string): LocalGitRepo | undefined {
  const topLevel = runGit(directory, ["rev-parse", "--show-toplevel"])
  if (topLevel.status !== 0) return undefined

  const root = topLevel.stdout.trim()
  if (root.length === 0) return undefined

  const commonDir = runGit(root, ["rev-parse", "--git-common-dir"])
  if (commonDir.status !== 0) return undefined

  const store = path.resolve(root, commonDir.stdout.trim())
  return { root, store }
}

function normalizeRemoteProjectPathParts(host: string, remotePath: string) {
  const normalizedPath = remotePath
    .replace(/^\/+/, "")
    .replace(/\.git\/?$/, "")
    .replace(/\/+$/, "")
  if (host.length === 0 || normalizedPath.length === 0) return undefined
  return `${host.toLowerCase()}/${normalizedPath}`
}

function normalizedRemoteProjectPath(remote: string): string | undefined {
  const value = remote.trim()
  if (value.length === 0) return undefined

  try {
    const parsed = new URL(value)
    if (parsed.protocol === FILE_REMOTE_PROTOCOL) return undefined
    return normalizeRemoteProjectPathParts(parsed.hostname, parsed.pathname)
  } catch {
    const scpRemote = value.match(SCP_LIKE_REMOTE_REGEX)
    if (!scpRemote) return undefined
    return normalizeRemoteProjectPathParts(scpRemote[2] ?? "", scpRemote[3] ?? "")
  }
}

function hasRemoteProjectIdentity(directory: string) {
  const remote = runGit(directory, ["remote", "get-url", "origin"])
  return remote.status === 0 && normalizedRemoteProjectPath(remote.stdout) !== undefined
}

function stableLocalProjectID(root: string) {
  const hash = createHash("sha1").update(root).digest("hex")
  return `buddy-local-${hash}`
}

function ensureStableLocalProjectCache(directory: string) {
  const repo = resolveGitRepo(directory)
  if (!repo) return
  if (hasRemoteProjectIdentity(repo.root)) return

  const cachePath = path.join(repo.store, "opencode")
  const cachedID = readTrimmedFile(cachePath)
  if (cachedID) return

  try {
    writeFileSync(cachePath, `${stableLocalProjectID(repo.root)}\n`)
  } catch {
    // Project identity caching is an optimization and must not block opening a repository.
  }
}

export namespace Project {
  export const Info = OpenCodeProject.Info
  export type Info = OpenCodeProject.Info

  export const UpdateInput = OpenCodeProject.UpdateInput
  export type UpdateInput = OpenCodeProject.UpdateInput

  export const UpdatePayload = OpenCodeProject.UpdatePayload
  export type UpdatePayload = OpenCodeProject.UpdatePayload

  export async function list() {
    return runtime.runPromise((svc) => svc.list())
  }

  export async function get(id: Parameters<OpenCodeProject.Interface["get"]>[0]) {
    return runtime.runPromise((svc) => svc.get(id))
  }

  export async function fromDirectory(directory: string) {
    ensureStableLocalProjectCache(directory)
    return runtime.runPromise((svc) => svc.fromDirectory(directory))
  }

  export async function update(input: OpenCodeProject.UpdateInput) {
    return runtime.runPromise((svc) => svc.update(input))
  }
}
