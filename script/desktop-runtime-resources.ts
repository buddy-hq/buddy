import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const BACKEND_DIR = path.resolve(ROOT_DIR, "packages/buddy")
const BUDDY_MIGRATION_SOURCE = path.resolve(BACKEND_DIR, "migration")
const OPENCODE_PACKAGE_JSON = path.resolve(
  ROOT_DIR,
  "vendor/opencode/packages/opencode/package.json",
)

const WATCHER_BINDING_BY_TARGET: Record<string, { packageName: string; os: string; cpu: string }> =
  {
    "aarch64-apple-darwin": {
      packageName: "@parcel/watcher-darwin-arm64",
      os: "darwin",
      cpu: "arm64",
    },
    "x86_64-apple-darwin": {
      packageName: "@parcel/watcher-darwin-x64",
      os: "darwin",
      cpu: "x64",
    },
    "x86_64-pc-windows-msvc": {
      packageName: "@parcel/watcher-win32-x64",
      os: "win32",
      cpu: "x64",
    },
    "x86_64-unknown-linux-gnu": {
      packageName: "@parcel/watcher-linux-x64-glibc",
      os: "linux",
      cpu: "x64",
    },
    "aarch64-unknown-linux-gnu": {
      packageName: "@parcel/watcher-linux-arm64-glibc",
      os: "linux",
      cpu: "arm64",
    },
  }

function getWatcherBinding(target: string) {
  return WATCHER_BINDING_BY_TARGET[target]
}

function packageVersion(name: string) {
  const pkg = JSON.parse(readFileSync(OPENCODE_PACKAGE_JSON, "utf8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? "latest"
}

function installWatcherBinding(target: string, destinationDir: string) {
  const binding = getWatcherBinding(target)
  if (!binding) {
    return
  }

  const packageDirName = binding.packageName.replace("@parcel/", "")
  const workspaceSource = path.resolve(
    ROOT_DIR,
    "vendor/opencode/packages/opencode/node_modules/@parcel",
    packageDirName,
  )
  const targetDir = path.resolve(destinationDir, "node_modules/@parcel", packageDirName)

  mkdirSync(path.dirname(targetDir), { recursive: true })

  if (existsSync(workspaceSource)) {
    cpSync(workspaceSource, targetDir, { recursive: true, dereference: true })
    return
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "buddy-parcel-watcher-"))
  const tempPackageJson = path.resolve(tempDir, "package.json")
  writeFileSync(tempPackageJson, "{}\n")

  const packageSpec = `${binding.packageName}@${packageVersion(binding.packageName)}`
  const install = spawnSync(
    "bun",
    [
      "add",
      "--silent",
      "--no-save",
      "--exact",
      "--cwd",
      tempDir,
      "--os",
      binding.os,
      "--cpu",
      binding.cpu,
      packageSpec,
    ],
    {
      encoding: "utf8",
    },
  )

  try {
    if (install.status !== 0) {
      const message =
        install.stderr ||
        install.stdout ||
        `bun add failed with code ${install.status ?? "unknown"}`
      throw new Error(`Failed to install ${packageSpec} for ${target}: ${message}`)
    }

    const installedSource = path.resolve(tempDir, "node_modules/@parcel", packageDirName)
    if (!existsSync(installedSource)) {
      throw new Error(`Installed watcher binding was not found at ${installedSource}`)
    }

    cpSync(installedSource, targetDir, { recursive: true, dereference: true })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export function syncBundledMigrations(destinationDir: string) {
  rmSync(destinationDir, { recursive: true, force: true })
  mkdirSync(destinationDir, { recursive: true })
  cpSync(BUDDY_MIGRATION_SOURCE, path.resolve(destinationDir, "buddy"), { recursive: true })
  return destinationDir
}

export function syncBundledBackendResources(input: {
  destinationDir: string
  sourceDir: string
  target: string
}) {
  if (!existsSync(input.sourceDir)) {
    throw new Error(`Buddy backend runtime directory missing at ${input.sourceDir}`)
  }

  rmSync(input.destinationDir, { recursive: true, force: true })
  mkdirSync(input.destinationDir, { recursive: true })
  cpSync(input.sourceDir, input.destinationDir, {
    recursive: true,
    dereference: true,
  })

  const sourceEntrypoint = path.resolve(input.destinationDir, "index.js")
  if (!existsSync(sourceEntrypoint)) {
    throw new Error(`Buddy backend runtime entry missing at ${sourceEntrypoint}`)
  }

  installWatcherBinding(input.target, input.destinationDir)

  const targetEntrypoint = path.resolve(input.destinationDir, "buddy-backend.js")
  copyFileSync(sourceEntrypoint, targetEntrypoint)
  return targetEntrypoint
}
