import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { generateKeyPairSync } from "node:crypto"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { resolveSignerEnvironment } from "../scripts/utils"

const SCRIPTS = path.resolve(import.meta.dir, "../scripts")

async function signingFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-release-signing-test-"))
  try {
    const keys = generateKeyPairSync("ed25519")
    const publicKey = Buffer.concat([
      Buffer.from("Ed"),
      Buffer.alloc(8, 7),
      keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32),
    ]).toString("base64")
    const privateKeyPath = path.join(directory, "private-key.pem")
    await Bun.write(privateKeyPath, keys.privateKey.export({ format: "pem", type: "pkcs8" }))
    const bin = path.join(directory, "bin")
    const output = path.join(directory, "output")
    const latest = path.join(directory, "latest-yml-x86_64-pc-windows-msvc")
    await Promise.all([mkdir(bin), mkdir(output), mkdir(latest)])
    const signer = path.join(bin, "tauri")
    await Bun.write(signer, `#!${process.execPath}
import { readFileSync, writeFileSync } from "node:fs"
import { sign } from "node:crypto"
const args = process.argv.slice(2)
if (args.includes("--help")) process.exit(0)
for (const key of ["TAURI_SIGNING_PRIVATE_KEY_PATH", "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]) {
  if (process.env[key] !== undefined && !process.env[key].trim()) {
    throw new Error("a value is required for " + key)
  }
}
const file = args.at(-1)
const privateKey = readFileSync(process.env.FIXTURE_PRIVATE_KEY)
const signature = sign(null, readFileSync(file), privateKey)
const comment = "timestamp:1\\tfile:fixture"
const signatureFile = [
  "untrusted comment: isolated test key",
  Buffer.concat([Buffer.from("Ed"), Buffer.alloc(8, 7), signature]).toString("base64"),
  "trusted comment: " + comment,
  sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey).toString("base64"),
].join("\\n") + "\\n"
writeFileSync(file + ".sig", signatureFile)
`)
    await chmod(signer, 0o755)
    const uploadLog = path.join(directory, "uploads.txt")
    const gh = path.join(bin, "gh")
    await Bun.write(gh, `#!${process.execPath}
import { appendFileSync } from "node:fs"
appendFileSync(process.env.FIXTURE_UPLOADS, process.argv.slice(2).join(" ") + "\\n")
throw new Error("Unexpected GitHub command")
`)
    await chmod(gh, 0o755)
    await Bun.write(path.join(directory, "buddy-v0.1.0-macos-apple-silicon.zip"), "macOS artifact")
    await Bun.write(path.join(latest, "latest.yml"), "version: 0.1.0\nfiles:\n  - url: buddy-v0.1.0-windows-x64.exe\n    sha512: fixture\n    size: 1\nreleaseDate: '2026-01-01T00:00:00Z'\n")
    return {
      directory,
      publicKey,
      uploadLog,
      environment: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        BUDDY_CHANNEL: "prod",
        BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
        GH_REPO: "prashantbhudwal/buddy-releases",
        BUDDY_VERSION: "0.1.0",
        BUDDY_NODE_ARTIFACT_TARGET_ARCH: "arm64",
        ELECTRON_DIST_DIR: directory,
        LATEST_YML_DIR: directory,
        BUDDY_UPDATE_ASSET_BASE_URL: "",
        BUDDY_UPDATE_SKIP_UPLOAD: "",
        BUDDY_UPDATE_OUTPUT_DIR: output,
        RUNNER_TEMP: output,
        TAURI_SIGNER_BINARY_PATH: signer,
        TAURI_SIGNING_PRIVATE_KEY: "isolated fixture key",
        TAURI_SIGNING_PRIVATE_KEY_PATH: "",
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
        FIXTURE_PRIVATE_KEY: privateKeyPath,
        FIXTURE_UPLOADS: uploadLog,
      },
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

describe("release signing scripts", () => {
  test("the signer challenge accepts the workflow's empty optional signing secrets", async () => {
    const fixture = await signingFixture()
    try {
      const script = path.join(SCRIPTS, "verify-update-signing.ts")
      const distribution = { ...BUDDY_DISTRIBUTIONS.prod, updaterPublicKey: fixture.publicKey }
      const result = spawnSync(process.execPath, ["--eval", `import { verifyUpdateSigning } from ${JSON.stringify(script)}; await verifyUpdateSigning(${JSON.stringify(distribution)})`], {
        env: fixture.environment,
        encoding: "utf8",
      })
      expect(result.stderr).toBe("")
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("Verified updater signer for Buddy")
    } finally {
      await rm(fixture.directory, { recursive: true, force: true })
    }
  })

  test("normalizing optional secrets preserves configured keys and passwords", () => {
    const environment = {
      TAURI_SIGNING_PRIVATE_KEY: "  fixture key  ",
      TAURI_SIGNING_PRIVATE_KEY_PATH: "  ",
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: " fixture password ",
      GH_REPO: "fixture/repository",
    }
    expect(resolveSignerEnvironment(environment)).toEqual({
      TAURI_SIGNING_PRIVATE_KEY: "  fixture key  ",
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: " fixture password ",
      GH_REPO: "fixture/repository",
    })
    expect(environment.TAURI_SIGNING_PRIVATE_KEY_PATH).toBe("  ")
  })

  test.each(["finalize-latest-mac-json.ts", "finalize-latest-yml.ts"])("%s rejects another distribution's key before uploading", async (filename) => {
    const fixture = await signingFixture()
    try {
      const result = spawnSync(process.execPath, [path.join(SCRIPTS, filename)], {
        env: fixture.environment,
        encoding: "utf8",
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain("Updater signing key does not match Buddy")
      expect(await Bun.file(fixture.uploadLog).exists()).toBe(false)
    } finally {
      await rm(fixture.directory, { recursive: true, force: true })
    }
  })
})
