#!/usr/bin/env bun

import { $ } from "bun"
import { access, mkdir } from "node:fs/promises"
import path from "node:path"
import { resolveTauriSignerBinaryPath } from "./utils"

const RELEASE_REPOSITORY_ENV_KEY = "GH_REPO"
const VERSION_ENV_KEY = "BUDDY_VERSION"
const RECOVERY_POLICY_FILE_ENV_KEY = "BUDDY_RECOVERY_POLICY_FILE"
const RECOVERY_POLICY_JSON_ENV_KEY = "BUDDY_RECOVERY_POLICY_JSON"
const UPDATE_OUTPUT_DIR_ENV_KEY = "BUDDY_UPDATE_OUTPUT_DIR"
const UPDATE_SKIP_UPLOAD_ENV_KEY = "BUDDY_UPDATE_SKIP_UPLOAD"
const TRUE_ENV_VALUE = "1"
const DEFAULT_OUTPUT_DIRECTORY = "/tmp"
const RECOVERY_POLICY_FILENAME = "recovery-policy.json"
const RECOVERY_POLICY_SCHEMA_VERSION = 1

type RecoveryPolicy = {
  schema: typeof RECOVERY_POLICY_SCHEMA_VERSION
  badVersions: unknown[]
}

const repo = process.env[RELEASE_REPOSITORY_ENV_KEY]?.trim() || ""
const version = process.env[VERSION_ENV_KEY]?.trim() || ""
if (!version) {
  throw new Error(`${VERSION_ENV_KEY} is required`)
}

const tag = `v${version}`
const outputDirectory =
  process.env[UPDATE_OUTPUT_DIR_ENV_KEY]?.trim() ||
  process.env.RUNNER_TEMP ||
  DEFAULT_OUTPUT_DIRECTORY
const outputPath = path.join(outputDirectory, RECOVERY_POLICY_FILENAME)
const skipUpload = process.env[UPDATE_SKIP_UPLOAD_ENV_KEY]?.trim() === TRUE_ENV_VALUE

async function loadRecoveryPolicy(): Promise<RecoveryPolicy> {
  const policyFile = process.env[RECOVERY_POLICY_FILE_ENV_KEY]?.trim()
  const policyJson = process.env[RECOVERY_POLICY_JSON_ENV_KEY]?.trim()

  if (policyFile) {
    return parseRecoveryPolicy(await Bun.file(policyFile).text())
  }

  if (policyJson) {
    return parseRecoveryPolicy(policyJson)
  }

  return {
    schema: RECOVERY_POLICY_SCHEMA_VERSION,
    badVersions: [],
  }
}

function parseRecoveryPolicy(content: string): RecoveryPolicy {
  // SAFETY: The fields used below are validated before constructing the complete recovery policy.
  const parsed = JSON.parse(content) as Partial<RecoveryPolicy>
  if (parsed.schema !== RECOVERY_POLICY_SCHEMA_VERSION || !Array.isArray(parsed.badVersions)) {
    throw new Error("Invalid recovery policy payload")
  }

  return {
    schema: RECOVERY_POLICY_SCHEMA_VERSION,
    badVersions: parsed.badVersions,
  }
}

async function requireTauriSignerBinaryPath() {
  const binaryPath = resolveTauriSignerBinaryPath(process.env)
  try {
    await access(binaryPath)
  } catch {
    throw new Error(`Missing Tauri signer binary at ${binaryPath}`)
  }

  return binaryPath
}

function ensureTauriSigningKeyPresent() {
  const rawPrivateKey = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()
  const privateKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()

  if (rawPrivateKey || privateKeyPath) {
    return
  }

  throw new Error(
    "TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH is required for signed recovery policy manifests",
  )
}

function resolveSignerEnvironment() {
  const environment = { ...process.env }

  if (!environment.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()) {
    delete environment.TAURI_SIGNING_PRIVATE_KEY_PATH
  }

  if (!environment.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    delete environment.TAURI_SIGNING_PRIVATE_KEY
  }

  if (!environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD?.trim()) {
    delete environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  }

  return environment
}

const policy = await loadRecoveryPolicy()

await mkdir(outputDirectory, { recursive: true })
await Bun.write(outputPath, `${JSON.stringify(policy, null, 2)}\n`)

ensureTauriSigningKeyPresent()
const tauriSigner = await requireTauriSignerBinaryPath()

await $`${tauriSigner} signer sign ${outputPath}`.env(resolveSignerEnvironment())

if (!skipUpload) {
  if (!repo) {
    throw new Error(`${RELEASE_REPOSITORY_ENV_KEY} is required when uploading signed manifests`)
  }

  await $`gh release upload ${tag} ${outputPath} ${`${outputPath}.sig`} --clobber --repo ${repo}`
}

console.log("finalized recovery-policy.json")
