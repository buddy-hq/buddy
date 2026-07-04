#!/usr/bin/env bun

import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  resolveMacOsReleaseArtifactFilename,
  resolveWindowsReleaseArtifactFilename,
} from "../src/shared/release-asset-names"
import { RELEASE_SMOKE_TARGETS, resolveNativeReleaseSmokeTarget } from "./release-smoke-target"

const VERSION_FLAG = "--version"
const DIST_DIRECTORY_FLAG = "--dist"
const DEV_APP_NAME = "Buddy Dev"
const PRODUCTION_APP_NAME = "Buddy"
const DEV_APP_ID = "ai.buddy.desktop.dev"
const MACOS_APPLICATIONS_DIRECTORY = "/Applications"
const MACOS_APP_EXTENSION = ".app"
const WINDOWS_EXECUTABLE_EXTENSION = ".exe"
const WINDOWS_INSTALLER_SILENT_FLAG = "/S"
const WINDOWS_INSTALL_DIRECTORY_PREFIX = "/D="
const TERMINATION_TIMEOUT_MS = 10_000
const PROMPT_ENCODING = "utf8"
const SUCCESS_EXIT_CODE = 0
const INTERRUPT_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const

type InterruptSignal = (typeof INTERRUPT_SIGNALS)[number]

type RunningApp = {
  child: ChildProcess
  cleanupInstallation: () => void
  label: string
}

function readRequiredFlag(name: string): string {
  const index = Bun.argv.indexOf(name)
  const value = index < 0 ? undefined : Bun.argv[index + 1]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (result.status !== 0) {
    const detail = result.error?.message || result.stderr.trim() || result.stdout.trim()
    throw new Error(`${command} failed${detail ? `: ${detail}` : ""}`)
  }
  return result.stdout.trim()
}

function assertFileExists(filePath: string, label: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`)
  }
}

function assertNoRunningMacApp(appPath: string): void {
  const result = spawnSync("pgrep", ["-f", appPath], { stdio: "ignore" })
  if (result.status === 0) {
    throw new Error(`${appPath} is already running; quit it before cutting a release`)
  }
}

function ensureForegroundTerminal(): void {
  if (!process.stdin.isTTY || process.platform === "win32") {
    return
  }

  const result = spawnSync("ps", ["-o", "pgid=,tpgid=", "-p", String(process.pid)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (result.status !== SUCCESS_EXIT_CODE) {
    return
  }

  const [processGroup, terminalForegroundGroup] = result.stdout.trim().split(/\s+/)
  const processGroupId = Number.parseInt(processGroup ?? "", 10)
  const terminalForegroundGroupId = Number.parseInt(terminalForegroundGroup ?? "", 10)
  if (
    !Number.isFinite(processGroupId) ||
    !Number.isFinite(terminalForegroundGroupId) ||
    terminalForegroundGroupId <= SUCCESS_EXIT_CODE
  ) {
    return
  }

  if (processGroupId !== terminalForegroundGroupId) {
    throw new Error(
      "Manual Buddy Dev approval requires the release job to be in the terminal foreground. Run it in the foreground before approving the spot-check.",
    )
  }
}

function installMacOsApp(version: string, distDirectory: string): RunningApp {
  const targetName = resolveNativeReleaseSmokeTarget()
  const target = RELEASE_SMOKE_TARGETS[targetName]
  if (target.platform !== "darwin") {
    throw new Error("macOS install requested on a non-macOS host")
  }

  const artifactPath = path.join(
    distDirectory,
    resolveMacOsReleaseArtifactFilename(version, target.architecture, "dmg"),
  )
  assertFileExists(artifactPath, "Buddy Dev DMG")

  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "buddy-dev-spot-check-"))
  const mountDirectory = path.join(temporaryDirectory, "mount")
  const backupAppPath = path.join(temporaryDirectory, `${DEV_APP_NAME}${MACOS_APP_EXTENSION}`)
  const installDirectory = process.env.BUDDY_DEV_INSTALL_DIR?.trim() || MACOS_APPLICATIONS_DIRECTORY
  const installedAppPath = path.join(installDirectory, `${DEV_APP_NAME}${MACOS_APP_EXTENSION}`)
  mkdirSync(mountDirectory, { recursive: true })
  assertNoRunningMacApp(installedAppPath)

  const hadExistingApp = existsSync(installedAppPath)
  if (hadExistingApp) {
    run("ditto", [installedAppPath, backupAppPath])
  }

  let mounted = false
  let installationError: unknown
  try {
    run("hdiutil", ["attach", artifactPath, "-nobrowse", "-mountpoint", mountDirectory])
    mounted = true

    const sourceAppPath = path.join(mountDirectory, `${DEV_APP_NAME}${MACOS_APP_EXTENSION}`)
    const unexpectedProductionAppPath = path.join(
      mountDirectory,
      `${PRODUCTION_APP_NAME}${MACOS_APP_EXTENSION}`,
    )
    assertFileExists(sourceAppPath, "Buddy Dev app bundle")
    if (existsSync(unexpectedProductionAppPath)) {
      throw new Error("Local installable unexpectedly contains production Buddy.app")
    }

    const bundleIdentifier = run("/usr/libexec/PlistBuddy", [
      "-c",
      "Print:CFBundleIdentifier",
      path.join(sourceAppPath, "Contents", "Info.plist"),
    ])
    if (bundleIdentifier !== DEV_APP_ID) {
      throw new Error(`Local installable has bundle id ${bundleIdentifier}; expected ${DEV_APP_ID}`)
    }

    rmSync(installedAppPath, { force: true, recursive: true })
    run("ditto", [sourceAppPath, installedAppPath])
    spawnSync("xattr", ["-dr", "com.apple.quarantine", installedAppPath], {
      stdio: "ignore",
    })
  } catch (error) {
    rmSync(installedAppPath, { force: true, recursive: true })
    if (hadExistingApp && existsSync(backupAppPath)) {
      run("ditto", [backupAppPath, installedAppPath])
    }
    installationError = error
  } finally {
    if (mounted) {
      run("hdiutil", ["detach", mountDirectory])
    }
  }
  if (installationError !== undefined) {
    rmSync(temporaryDirectory, { force: true, recursive: true })
    throw installationError
  }

  const cleanupInstallation = () => {
    rmSync(installedAppPath, { force: true, recursive: true })
    if (hadExistingApp && existsSync(backupAppPath)) {
      run("ditto", [backupAppPath, installedAppPath])
    }
    rmSync(temporaryDirectory, { force: true, recursive: true })
  }

  try {
    const executablePath = path.join(installedAppPath, "Contents", "MacOS", DEV_APP_NAME)
    assertFileExists(executablePath, "Buddy Dev executable")
    const child = spawn(executablePath, [], {
      env: process.env,
      stdio: "ignore",
    })

    return {
      child,
      cleanupInstallation,
      label: installedAppPath,
    }
  } catch (error) {
    cleanupInstallation()
    throw error
  }
}

function installWindowsApp(version: string, distDirectory: string): RunningApp {
  const targetName = resolveNativeReleaseSmokeTarget()
  const target = RELEASE_SMOKE_TARGETS[targetName]
  if (target.platform !== "win32") {
    throw new Error("Windows install requested on a non-Windows host")
  }

  const artifactPath = path.join(
    distDirectory,
    resolveWindowsReleaseArtifactFilename(version, target.architecture, "exe"),
  )
  assertFileExists(artifactPath, "Buddy Dev NSIS installer")

  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "buddy-dev-spot-check-"))
  const installDirectory = path.join(temporaryDirectory, DEV_APP_NAME)
  const cleanupInstallation = () => {
    const uninstaller = existsSync(installDirectory)
      ? readdirSync(installDirectory).find(
          (entry) =>
            entry.toLowerCase().startsWith("uninstall") &&
            entry.toLowerCase().endsWith(WINDOWS_EXECUTABLE_EXTENSION),
        )
      : undefined
    if (uninstaller) {
      spawnSync(path.join(installDirectory, uninstaller), [WINDOWS_INSTALLER_SILENT_FLAG], {
        stdio: "ignore",
        windowsHide: true,
      })
    }
    rmSync(temporaryDirectory, { force: true, recursive: true })
  }

  try {
    run(artifactPath, [
      WINDOWS_INSTALLER_SILENT_FLAG,
      `${WINDOWS_INSTALL_DIRECTORY_PREFIX}${installDirectory}`,
    ])

    const executablePath = path.join(
      installDirectory,
      `${DEV_APP_NAME}${WINDOWS_EXECUTABLE_EXTENSION}`,
    )
    const unexpectedProductionExecutable = path.join(
      installDirectory,
      `${PRODUCTION_APP_NAME}${WINDOWS_EXECUTABLE_EXTENSION}`,
    )
    assertFileExists(executablePath, "Buddy Dev executable")
    if (existsSync(unexpectedProductionExecutable)) {
      throw new Error("Local installable unexpectedly contains production Buddy.exe")
    }

    const child = spawn(executablePath, [], {
      env: process.env,
      stdio: "ignore",
      windowsHide: false,
    })

    return {
      child,
      cleanupInstallation,
      label: executablePath,
    }
  } catch (error) {
    cleanupInstallation()
    throw error
  }
}

async function terminate(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return
  }

  child.kill("SIGTERM")
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    Bun.sleep(TERMINATION_TIMEOUT_MS),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL")
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      Bun.sleep(TERMINATION_TIMEOUT_MS),
    ])
  }
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error(`Buddy Dev process ${String(child.pid)} did not terminate`)
  }
}

function readPromptLine(prompt: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Prompt aborted"))
      return
    }

    let finished = false

    const cleanup = () => {
      process.stdin.off("data", onData)
      process.stdin.off("error", onError)
      signal.removeEventListener("abort", onAbort)
      process.stdin.pause()
    }
    const finish = (result: { answer: string } | { error: Error }) => {
      if (finished) {
        return
      }

      finished = true
      cleanup()

      if ("answer" in result) {
        resolve(result.answer)
      } else {
        reject(result.error)
      }
    }
    const onData = (chunk: string | Buffer) => {
      finish({ answer: chunk.toString() })
    }
    const onError = (error: Error) => {
      finish({ error })
    }
    const onAbort = () => {
      finish({ error: new Error("Prompt aborted") })
    }

    ensureForegroundTerminal()
    process.stdout.write(prompt)
    process.stdin.setEncoding(PROMPT_ENCODING)
    process.stdin.resume()
    process.stdin.once("data", onData)
    process.stdin.once("error", onError)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

async function waitForApproval(runningApp: RunningApp): Promise<void> {
  const promptAbort = new AbortController()
  const signalHandlers: Array<{
    handler: () => void
    signal: InterruptSignal
  }> = []
  const interruption = new Promise<never>((_resolve, reject) => {
    for (const signal of INTERRUPT_SIGNALS) {
      const handler = () => reject(new Error(`Interrupted by ${signal}`))
      signalHandlers.push({ handler, signal })
      process.once(signal, handler)
    }
  })
  const appFailed = new Promise<never>((_resolve, reject) => {
    runningApp.child.once("error", (error) => {
      reject(new Error(`Buddy Dev failed to launch: ${error.message}`))
    })
    runningApp.child.once("exit", (code, signal) => {
      if (signal || code !== SUCCESS_EXIT_CODE) {
        reject(
          new Error(
            `Buddy Dev exited before approval (${signal ? `signal=${signal}` : `code=${String(code)}`})`,
          ),
        )
      }
    })
  })

  try {
    console.log(`\nBuddy Dev launched from ${runningApp.label}.`)
    console.log("Spot-check startup, navigation, a message, and packaged resource loading.")
    const answer = await Promise.race([
      readPromptLine("\nContinue with the production release smoke? [y/N]: ", promptAbort.signal),
      interruption,
      appFailed,
    ])
    if (!["y", "yes"].includes(answer.trim().toLowerCase())) {
      throw new Error("Release aborted during Buddy Dev spot-check")
    }
    if (
      runningApp.child.signalCode !== null ||
      (runningApp.child.exitCode !== null && runningApp.child.exitCode !== SUCCESS_EXIT_CODE)
    ) {
      throw new Error("Buddy Dev exited before the spot-check was approved")
    }
  } finally {
    promptAbort.abort()
    for (const { handler, signal } of signalHandlers) {
      process.off(signal, handler)
    }
    runningApp.child.removeAllListeners("error")
    runningApp.child.removeAllListeners("exit")
  }
}

const version = readRequiredFlag(VERSION_FLAG)
const configuredDistDirectory = Bun.argv.includes(DIST_DIRECTORY_FLAG)
  ? readRequiredFlag(DIST_DIRECTORY_FLAG)
  : path.resolve(import.meta.dir, "..", "dist")
const distDirectory = path.resolve(configuredDistDirectory)

let runningApp: RunningApp | undefined
try {
  if (process.platform === "darwin") {
    runningApp = installMacOsApp(version, distDirectory)
  } else if (process.platform === "win32") {
    runningApp = installWindowsApp(version, distDirectory)
  } else {
    throw new Error(`Unsupported Buddy Dev spot-check host: ${process.platform}`)
  }

  await waitForApproval(runningApp)
} finally {
  if (runningApp) {
    await terminate(runningApp.child)
    runningApp.cleanupInstallation()
  }
}

console.log("Buddy Dev spot-check approved and temporary installation removed")
