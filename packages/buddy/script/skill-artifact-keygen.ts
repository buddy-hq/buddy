#!/usr/bin/env bun

import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

const KEY_DIRECTORY_SEGMENTS = [".config", "buddy"]
const PRIVATE_KEY_FILENAME = "skill-artifacts.key"
const PASSWORD_FILENAME = "skill-artifacts.key.password"
const PUBLIC_KEY_SUFFIX = ".pub"
const PASSWORD_BYTES = 32
const TAURI_SIGNER_PATH = path.resolve(
  import.meta.dir,
  "../../desktop-electron/node_modules/.bin/tauri",
)

const keyDirectory = path.join(os.homedir(), ...KEY_DIRECTORY_SEGMENTS)
const privateKeyPath = path.join(keyDirectory, PRIVATE_KEY_FILENAME)
const passwordPath = path.join(keyDirectory, PASSWORD_FILENAME)
const publicKeyPath = `${privateKeyPath}${PUBLIC_KEY_SUFFIX}`

for (const filepath of [privateKeyPath, passwordPath, publicKeyPath]) {
  if (existsSync(filepath)) {
    throw new Error(`Refusing to overwrite existing skill artifact key file: ${filepath}`)
  }
}

mkdirSync(keyDirectory, { recursive: true })
const password = randomBytes(PASSWORD_BYTES).toString("base64url")
const result = spawnSync(
  TAURI_SIGNER_PATH,
  ["signer", "generate", "--ci", "--password", password, "--write-keys", privateKeyPath],
  { stdio: "inherit" },
)
if (result.status !== 0) {
  throw new Error("Failed to generate skill artifact signing key")
}

writeFileSync(passwordPath, `${password}\n`, { encoding: "utf8", mode: 0o600 })
await Promise.all([
  fsp.chmod(privateKeyPath, 0o600),
  fsp.chmod(passwordPath, 0o600),
  fsp.chmod(publicKeyPath, 0o644),
])

const encodedPublicKey = readFileSync(publicKeyPath, "utf8").trim()
const publicKey = Buffer.from(encodedPublicKey, "base64")
  .toString("utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith("RW"))
console.log(`Generated skill artifact signing key at ${privateKeyPath}`)
console.log(`Public key: ${publicKey ?? "missing"}`)
