import { spawnSync } from "node:child_process"
import { basename, delimiter } from "node:path"

const SHELL_ENV_TIMEOUT = 5_000
const PATH_ENV_KEYS = ["PATH", "Path"] as const

type Probe =
  | { type: "Loaded"; value: Record<string, string> }
  | { type: "Timeout" }
  | { type: "Unavailable" }

export function getUserShell() {
  return process.env.SHELL || "/bin/sh"
}

export function parseShellEnv(out: Buffer) {
  const env: Record<string, string> = {}
  for (const line of out.toString("utf8").split("\0")) {
    if (!line) continue
    const ix = line.indexOf("=")
    if (ix <= 0) continue
    env[line.slice(0, ix)] = line.slice(ix + 1)
  }
  return env
}

function probeShellEnv(shell: string, mode: "-il" | "-l"): Probe {
  const out = spawnSync(shell, [mode, "-c", "env -0"], {
    stdio: ["ignore", "pipe", "ignore"],
    timeout: SHELL_ENV_TIMEOUT,
    windowsHide: true,
  })

  const err = out.error
  if (err) {
    if ("code" in err && err.code === "ETIMEDOUT") return { type: "Timeout" }
    console.log(`[cli] Shell env probe failed for ${shell} ${mode}: ${err.message}`)
    return { type: "Unavailable" }
  }

  if (out.status !== 0) {
    console.log(`[cli] Shell env probe exited with non-zero status for ${shell} ${mode}`)
    return { type: "Unavailable" }
  }

  const env = parseShellEnv(out.stdout)
  if (Object.keys(env).length === 0) {
    console.log(`[cli] Shell env probe returned empty env for ${shell} ${mode}`)
    return { type: "Unavailable" }
  }

  return { type: "Loaded", value: env }
}

export function isNushell(shell: string) {
  const name = basename(shell).toLowerCase()
  const raw = shell.toLowerCase()
  return name === "nu" || name === "nu.exe" || raw.endsWith("\\nu.exe")
}

export function loadShellEnv(shell: string) {
  if (isNushell(shell)) {
    console.log(`[cli] Skipping shell env probe for nushell: ${shell}`)
    return null
  }

  const interactive = probeShellEnv(shell, "-il")
  if (interactive.type === "Loaded") {
    console.log(
      `[cli] Loaded shell environment with -il (${Object.keys(interactive.value).length} vars)`,
    )
    return interactive.value
  }
  if (interactive.type === "Timeout") {
    console.warn(`[cli] Interactive shell env probe timed out: ${shell}`)
    return null
  }

  const login = probeShellEnv(shell, "-l")
  if (login.type === "Loaded") {
    console.log(`[cli] Loaded shell environment with -l (${Object.keys(login.value).length} vars)`)
    return login.value
  }

  console.warn(`[cli] Falling back to app environment: ${shell}`)
  return null
}

export function mergeShellEnv(shell: Record<string, string> | null, env: Record<string, string>) {
  if (!shell) return { ...env }

  const merged = {
    ...shell,
    ...env,
  }
  const shellPath = readPathValue(shell)
  const envPath = readPathValue(env)
  const pathValue = mergePathValues(shellPath, envPath)
  if (pathValue.length > 0) {
    const pathKey = pathKeyForEnvironment(merged)
    merged[pathKey] = pathValue
    if (pathKey === "PATH") {
      delete merged.Path
    } else {
      delete merged.PATH
    }
  }
  return merged
}

function pathKeyForEnvironment(env: Record<string, string>) {
  for (const key of PATH_ENV_KEYS) {
    const value = env[key]
    if (value?.trim()) {
      return key
    }
  }
  return PATH_ENV_KEYS[0]
}

function readPathValue(env: Record<string, string>) {
  for (const key of PATH_ENV_KEYS) {
    const value = env[key]
    if (value?.trim()) {
      return value
    }
  }
  return ""
}

function mergePathValues(primary: string, secondary: string) {
  const merged: string[] = []
  const seen = new Set<string>()
  for (const entry of [...splitPathValue(primary), ...splitPathValue(secondary)]) {
    const normalized = normalizePathEntry(entry)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    merged.push(entry)
  }
  return merged.join(delimiter)
}

function splitPathValue(value: string) {
  return value
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function normalizePathEntry(entry: string) {
  return process.platform === "win32" ? entry.toLowerCase() : entry
}
