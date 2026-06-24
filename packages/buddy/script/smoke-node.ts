#!/usr/bin/env bun

import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  HEALTHZ_PATH,
  HEALTH_PATH,
  cleanupArtifactRoot,
  cleanupRuntimeRoot,
  hasFlag,
  parsePort,
  readFlagValue,
  spawnNodeArtifact,
  stopProcess,
  tail,
  waitForHealthyEndpoint,
} from "./node-artifact-runtime"

type SmokeOptions = {
  entrypoint?: string
  keepRuntime: boolean
  migrationDir?: string
  port?: number
  startupTimeoutMs: number
}

function parseOptions(): SmokeOptions {
  const args = Bun.argv.slice(2)
  const startupTimeoutMs = Number.parseInt(
    readFlagValue(args, "--startup-timeout-ms") ?? String(DEFAULT_STARTUP_TIMEOUT_MS),
    10,
  )

  return {
    entrypoint: readFlagValue(args, "--entrypoint"),
    keepRuntime: hasFlag(args, "--keep-runtime"),
    migrationDir: readFlagValue(args, "--migration-dir"),
    port: parsePort(readFlagValue(args, "--port")),
    startupTimeoutMs: Number.isFinite(startupTimeoutMs) ? startupTimeoutMs : DEFAULT_STARTUP_TIMEOUT_MS,
  }
}

async function main(): Promise<void> {
  const options = parseOptions()
  const spawned = await spawnNodeArtifact({
    entrypoint: options.entrypoint,
    migrationDir: options.migrationDir,
    port: options.port,
  })

  let processStopped = false

  try {
    const healthz = await waitForHealthyEndpoint({
      baseUrl: spawned.baseUrl,
      child: spawned.child,
      pathname: HEALTHZ_PATH,
      startupTimeoutMs: options.startupTimeoutMs,
    })
    if (!healthz.ok) {
      throw new Error(`${HEALTHZ_PATH} failed: ${healthz.body || healthz.error || "unknown"}`)
    }

    const health = await waitForHealthyEndpoint({
      baseUrl: spawned.baseUrl,
      child: spawned.child,
      pathname: HEALTH_PATH,
      startupTimeoutMs: options.startupTimeoutMs,
    })
    if (!health.ok) {
      throw new Error(`${HEALTH_PATH} failed: ${health.body || health.error || "unknown"}`)
    }

    console.log(`Buddy Node backend smoke passed at ${spawned.baseUrl}`)
  } catch (error) {
    await stopProcess(spawned.child)
    processStopped = true
    const [stdoutText, stderrText] = await Promise.all([spawned.stdout, spawned.stderr])
    console.error("Buddy Node backend smoke failed.")
    console.error(`stdout:\n${tail(stdoutText)}`)
    console.error(`stderr:\n${tail(stderrText)}`)
    throw error
  } finally {
    if (!processStopped) {
      await stopProcess(spawned.child)
    }
    cleanupArtifactRoot(spawned.artifactRoot, options.keepRuntime)
    cleanupRuntimeRoot(spawned.runtimeRoot, options.keepRuntime)
  }
}

await main()
