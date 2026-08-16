import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { parseTErrorCode } from "./parse-values"

const LOCK_ENV_KEY = "BUDDY_TYPECHECK_LOCK_TOKEN"
const LOCK_INITIALIZATION_GRACE_MS = 5_000
const LOCK_DIRECTORY = path.resolve(import.meta.dir, "..", ".turbo", "typecheck.lock")
const LOCK_OWNER_FILE = path.join(LOCK_DIRECTORY, "owner.json")

type LockOwner = {
  pid: number
  token: string
  startedAt: string
  command: string[]
}

const lockOwnerSchema = z.object({
  pid: z.number(),
  token: z.string(),
  startedAt: z.string(),
  command: z.array(z.string()),
})

function hasErrorCode<TError>(error: TError, code: string): boolean {
  return parseTErrorCode(error) === code
}

function lockOwnerFromValue<TValue>(value: TValue): LockOwner | undefined {
  const parsed = lockOwnerSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

async function readLockOwner(): Promise<LockOwner | undefined> {
  const text = await fs.readFile(LOCK_OWNER_FILE, "utf8").catch((error) => {
    if (hasErrorCode(error, "ENOENT")) return undefined
    throw error
  })
  if (text === undefined) return undefined

  try {
    return lockOwnerFromValue(JSON.parse(text))
  } catch {
    return undefined
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    return hasErrorCode(error, "EPERM")
  }
}

function inheritedEnvironment(token: string) {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  env[LOCK_ENV_KEY] = token
  return env
}

function parseCommand(): string[] {
  const args = process.argv.slice(2)
  const separatorIndex = args.indexOf("--")
  return separatorIndex === -1 ? args : args.slice(separatorIndex + 1)
}

function renderActiveLock(owner: LockOwner | undefined): string {
  if (!owner) return "A typecheck lock already exists."
  return [
    "A typecheck is already running.",
    `pid: ${owner.pid}`,
    `started: ${owner.startedAt}`,
    `command: ${owner.command.join(" ")}`,
  ].join("\n")
}

async function acquireLock(token: string, command: string[]): Promise<boolean> {
  await fs.mkdir(path.dirname(LOCK_DIRECTORY), { recursive: true })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.mkdir(LOCK_DIRECTORY)
      const owner: LockOwner = {
        pid: process.pid,
        token,
        startedAt: new Date().toISOString(),
        command,
      }
      await fs.writeFile(LOCK_OWNER_FILE, `${JSON.stringify(owner, null, 2)}\n`)
      return true
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error

      const owner = await readLockOwner()
      if (owner && isProcessAlive(owner.pid)) {
        console.error(renderActiveLock(owner))
        return false
      }

      if (!owner) {
        const stat = await fs.stat(LOCK_DIRECTORY).catch((statError) => {
          if (hasErrorCode(statError, "ENOENT")) return undefined
          throw statError
        })
        if (stat && Date.now() - stat.mtimeMs < LOCK_INITIALIZATION_GRACE_MS) {
          console.error(renderActiveLock(undefined))
          return false
        }
      }

      await fs.rm(LOCK_DIRECTORY, { recursive: true, force: true })
    }
  }

  console.error("Failed to acquire typecheck lock.")
  return false
}

async function validateInheritedLock(token: string): Promise<boolean> {
  const owner = await readLockOwner()
  if (owner?.token === token) return true

  console.error("Inherited typecheck lock token does not match the active lock.")
  return false
}

async function releaseLock(token: string): Promise<void> {
  const owner = await readLockOwner()
  if (owner?.token !== token) return
  await fs.rm(LOCK_DIRECTORY, { recursive: true, force: true })
}

async function runCommand(command: string[], token: string): Promise<number> {
  const subprocess = Bun.spawn(command, {
    cwd: process.cwd(),
    env: inheritedEnvironment(token),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  return subprocess.exited
}

async function main(): Promise<number> {
  const command = parseCommand()
  if (command.length === 0) {
    console.error("Usage: bun script/typecheck-lock.ts -- <command> [...args]")
    return 1
  }

  const inheritedToken = process.env[LOCK_ENV_KEY]
  if (inheritedToken) {
    if (!(await validateInheritedLock(inheritedToken))) return 1
    return runCommand(command, inheritedToken)
  }

  const token = randomUUID()
  if (!(await acquireLock(token, command))) return 1

  try {
    return await runCommand(command, token)
  } finally {
    await releaseLock(token)
  }
}

process.exitCode = await main()
