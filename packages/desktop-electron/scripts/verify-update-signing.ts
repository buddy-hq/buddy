#!/usr/bin/env bun

import { $ } from "bun"
import { existsSync } from "node:fs"
import { access, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { randomBytes } from "node:crypto"
import { requireUpdaterPublicKey } from "@buddy/script/distribution"
import { releaseDistribution } from "../../../script/release/distribution-guard"
import { verifyReleaseSignature } from "./verify-release-signature"
import { resolveTauriSignerBinaryPath } from "./utils"

const LOCAL_TAURI_KEY_DIRECTORY = ".config/buddy"
const LOCAL_TAURI_KEY_FILENAME = "tauri-updater.key"
const SENSITIVE_TAURI_SIGNING_ENV_KEYS = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
] as const

function resolveSignerHelpEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  for (const key of SENSITIVE_TAURI_SIGNING_ENV_KEYS) {
    delete environment[key]
  }
  return environment
}

const distribution = releaseDistribution()
requireUpdaterPublicKey(distribution)

const signerPath = resolveTauriSignerBinaryPath(process.env)

try {
  await access(signerPath)
} catch {
  throw new Error(`Missing Tauri signer binary at ${signerPath}`)
}

const rawPrivateKey = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()
const privateKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()
const localPrivateKeyPath = path.join(
  process.env.HOME ?? "",
  LOCAL_TAURI_KEY_DIRECTORY,
  LOCAL_TAURI_KEY_FILENAME,
)

if (
  !rawPrivateKey &&
  !privateKeyPath &&
  (distribution.id === "beta" || !existsSync(localPrivateKeyPath))
) {
  throw new Error(
    "Missing updater signing key. Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH, or create ~/.config/buddy/tauri-updater.key.",
  )
}

await $`${signerPath} signer sign --help`.env(resolveSignerHelpEnvironment())

const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-signing-challenge-"))
try {
  const challenge = path.join(directory, "challenge.txt")
  await Bun.write(challenge, randomBytes(32))
  const environment = { ...process.env }
  if (!rawPrivateKey && !privateKeyPath)
    environment.TAURI_SIGNING_PRIVATE_KEY_PATH = localPrivateKeyPath
  await $`${signerPath} signer sign ${challenge}`.env(environment)
  await verifyReleaseSignature(challenge)
  console.log(`Verified updater signer for ${distribution.productName}`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
