#!/usr/bin/env bun

import { $ } from "bun"
import { existsSync } from "node:fs"
import { access } from "node:fs/promises"
import path from "node:path"
import { resolveTauriSignerBinaryPath } from "./utils"

const LOCAL_TAURI_KEY_DIRECTORY = ".config/buddy"
const LOCAL_TAURI_KEY_FILENAME = "tauri-updater.key"

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

if (!rawPrivateKey && !privateKeyPath && !existsSync(localPrivateKeyPath)) {
  throw new Error(
    "Missing updater signing key. Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH, or create ~/.config/buddy/tauri-updater.key.",
  )
}

await $`${signerPath} signer sign --help`
