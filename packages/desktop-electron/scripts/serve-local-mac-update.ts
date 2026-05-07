#!/usr/bin/env bun

import { $ } from "bun"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { readDesktopPackageVersion, resolveTauriSignerBinaryPath } from "./utils"

const DEFAULT_UPDATE_HOSTNAME = "127.0.0.1"
const DEFAULT_UPDATE_PORT = 43199
const UPDATE_MANIFEST_FILENAME = "latest-mac.json"
const UPDATE_MANIFEST_SIGNATURE_FILENAME = "latest-mac.json.sig"
const ELECTRON_DIST_DIR_ENV_KEY = "ELECTRON_DIST_DIR"
const UPDATE_HOST_ENV_KEY = "BUDDY_UPDATE_HOST"
const UPDATE_PORT_ENV_KEY = "BUDDY_UPDATE_PORT"
const UPDATE_METADATA_URL_ENV_KEY = "BUDDY_UPDATE_METADATA_URL"
const UPDATE_OUTPUT_DIR_ENV_KEY = "BUDDY_UPDATE_OUTPUT_DIR"
const UPDATE_ASSET_BASE_URL_ENV_KEY = "BUDDY_UPDATE_ASSET_BASE_URL"
const UPDATE_SKIP_UPLOAD_ENV_KEY = "BUDDY_UPDATE_SKIP_UPLOAD"
const VERSION_ENV_KEY = "BUDDY_VERSION"
const TAURI_SIGNER_BINARY_PATH_ENV_KEY = "TAURI_SIGNER_BINARY_PATH"
const TAURI_SIGNING_PRIVATE_KEY_ENV_KEY = "TAURI_SIGNING_PRIVATE_KEY"
const TAURI_SIGNING_PRIVATE_KEY_PATH_ENV_KEY = "TAURI_SIGNING_PRIVATE_KEY_PATH"
const TAURI_SIGNING_PRIVATE_KEY_PASSWORD_ENV_KEY = "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
const LOCAL_TAURI_KEY_DIRECTORY = ".config/buddy"
const LOCAL_TAURI_KEY_FILENAME = "tauri-updater.key"
const LOCAL_TAURI_KEY_PASSWORD_FILENAME = "tauri-updater.key.password"
const ELECTRON_MAC_ARCHIVE_NAMES = ["buddy-electron-mac-arm64.zip", "buddy-electron-mac-x64.zip"]
const TRUE_ENV_VALUE = "1"
const NOT_FOUND_STATUS = 404
const FORBIDDEN_STATUS = 403
const METHOD_NOT_ALLOWED_STATUS = 405
const CONTENT_TYPE_HEADER = "Content-Type"
const TEXT_PLAIN_CONTENT_TYPE = "text/plain; charset=utf-8"
const CONTENT_TYPES = new Map<string, string>([
  [".json", "application/json; charset=utf-8"],
  [".sig", "text/plain; charset=utf-8"],
  [".yml", "text/yaml; charset=utf-8"],
  [".yaml", "text/yaml; charset=utf-8"],
  [".zip", "application/zip"],
  [".dmg", "application/x-apple-diskimage"],
  [".blockmap", "application/octet-stream"],
  [".txt", TEXT_PLAIN_CONTENT_TYPE],
])

const packageDir = path.resolve(import.meta.dir, "..")
const distDir = path.resolve(
  Bun.env[ELECTRON_DIST_DIR_ENV_KEY]?.trim() || path.join(packageDir, "dist"),
)
const version = Bun.env[VERSION_ENV_KEY]?.trim() || readDesktopPackageVersion()
const hostname = Bun.env[UPDATE_HOST_ENV_KEY]?.trim() || DEFAULT_UPDATE_HOSTNAME
const port = resolvePort(Bun.env[UPDATE_PORT_ENV_KEY])
const assetBaseUrl = `http://${hostname}:${port}/`

ensureDistHasMacArtifacts(distDir)

const signingEnv = resolveSigningEnvironment()
await generateLocalUpdateManifest(signingEnv)

const server = Bun.serve({
  hostname,
  port,
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: METHOD_NOT_ALLOWED_STATUS })
    }

    const requestPath = resolveRequestPath(new URL(request.url).pathname)
    if (!requestPath) {
      return new Response(renderIndex(), {
        headers: {
          [CONTENT_TYPE_HEADER]: TEXT_PLAIN_CONTENT_TYPE,
        },
      })
    }

    const absolutePath = path.resolve(distDir, requestPath)
    if (!isPathInside(distDir, absolutePath)) {
      return new Response("Forbidden", { status: FORBIDDEN_STATUS })
    }

    const file = Bun.file(absolutePath)
    if (!(await file.exists())) {
      return new Response("Not Found", { status: NOT_FOUND_STATUS })
    }

    return new Response(file, {
      headers: {
        [CONTENT_TYPE_HEADER]: contentTypeFor(absolutePath),
      },
    })
  },
})

const metadataUrl = `${assetBaseUrl}${UPDATE_MANIFEST_FILENAME}`
console.log(`Serving local mac update artifacts from ${distDir}`)
console.log(`Local metadata URL: ${metadataUrl}`)
console.log(`Manifest signature: ${assetBaseUrl}${UPDATE_MANIFEST_SIGNATURE_FILENAME}`)
console.log(`Launch installed Buddy with:`)
console.log(
  `${UPDATE_METADATA_URL_ENV_KEY}="${metadataUrl}" /Applications/Buddy.app/Contents/MacOS/Buddy`,
)

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.stop(true)
    process.exit(0)
  })
}

await new Promise(() => {})

function resolvePort(rawPort: string | undefined) {
  if (!rawPort) {
    return DEFAULT_UPDATE_PORT
  }

  const parsed = Number.parseInt(rawPort, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${UPDATE_PORT_ENV_KEY} must be a positive integer`)
  }

  return parsed
}

function ensureDistHasMacArtifacts(rootDir: string) {
  const availableArchive = ELECTRON_MAC_ARCHIVE_NAMES.find((filename) =>
    existsSync(path.join(rootDir, filename)),
  )

  if (!availableArchive) {
    throw new Error(`Missing macOS update archives in ${rootDir}`)
  }
}

type SigningEnvironment = Record<string, string>

function resolveSigningEnvironment(): SigningEnvironment {
  const signingEnv: SigningEnvironment = {
    ...process.env,
    [VERSION_ENV_KEY]: version,
    [ELECTRON_DIST_DIR_ENV_KEY]: distDir,
    [UPDATE_OUTPUT_DIR_ENV_KEY]: distDir,
    [UPDATE_ASSET_BASE_URL_ENV_KEY]: assetBaseUrl,
    [UPDATE_SKIP_UPLOAD_ENV_KEY]: TRUE_ENV_VALUE,
    [TAURI_SIGNER_BINARY_PATH_ENV_KEY]: resolveTauriSignerBinaryPath(Bun.env),
  }

  const rawPrivateKey = Bun.env[TAURI_SIGNING_PRIVATE_KEY_ENV_KEY]?.trim()
  if (rawPrivateKey) {
    signingEnv[TAURI_SIGNING_PRIVATE_KEY_ENV_KEY] = rawPrivateKey
  } else {
    const localPrivateKeyPath = path.join(
      process.env.HOME ?? "",
      LOCAL_TAURI_KEY_DIRECTORY,
      LOCAL_TAURI_KEY_FILENAME,
    )
    const configuredPrivateKeyPath =
      Bun.env[TAURI_SIGNING_PRIVATE_KEY_PATH_ENV_KEY]?.trim() || localPrivateKeyPath

    if (!existsSync(configuredPrivateKeyPath)) {
      throw new Error(
        `Missing updater signing key. Set ${TAURI_SIGNING_PRIVATE_KEY_ENV_KEY} or ${TAURI_SIGNING_PRIVATE_KEY_PATH_ENV_KEY}.`,
      )
    }

    signingEnv[TAURI_SIGNING_PRIVATE_KEY_PATH_ENV_KEY] = configuredPrivateKeyPath
  }

  const rawPassword = Bun.env[TAURI_SIGNING_PRIVATE_KEY_PASSWORD_ENV_KEY]?.trim()
  if (rawPassword) {
    signingEnv[TAURI_SIGNING_PRIVATE_KEY_PASSWORD_ENV_KEY] = rawPassword
  } else {
    const localPasswordPath = path.join(
      process.env.HOME ?? "",
      LOCAL_TAURI_KEY_DIRECTORY,
      LOCAL_TAURI_KEY_PASSWORD_FILENAME,
    )

    if (existsSync(localPasswordPath)) {
      signingEnv[TAURI_SIGNING_PRIVATE_KEY_PASSWORD_ENV_KEY] = readFileSync(
        localPasswordPath,
        "utf8",
      ).trim()
    }
  }

  return signingEnv
}

async function generateLocalUpdateManifest(signingEnv: SigningEnvironment) {
  await $`bun ./scripts/finalize-latest-mac-json.ts`.cwd(packageDir).env(signingEnv)
}

function resolveRequestPath(pathname: string) {
  if (pathname === "/") {
    return ""
  }

  return decodeURIComponent(pathname.replace(/^\/+/, ""))
}

function renderIndex() {
  return [
    `Serving ${distDir}`,
    `Manifest: /${UPDATE_MANIFEST_FILENAME}`,
    `Signature: /${UPDATE_MANIFEST_SIGNATURE_FILENAME}`,
    "Archives:",
    ...ELECTRON_MAC_ARCHIVE_NAMES.map((filename) => `- /${filename}`),
  ].join("\n")
}

function isPathInside(rootDir: string, candidatePath: string) {
  const relative = path.relative(rootDir, candidatePath)
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative)
}

function contentTypeFor(filepath: string) {
  return CONTENT_TYPES.get(path.extname(filepath)) ?? "application/octet-stream"
}
