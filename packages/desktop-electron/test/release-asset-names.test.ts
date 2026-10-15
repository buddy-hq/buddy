import { describe, expect, test } from "bun:test"
import {
  resolveMacOsUpdateManifestFilename,
  resolveWindowsUpdateManifestFilename,
} from "../src/shared/release-asset-names"

import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { generateKeyPairSync, sign } from "node:crypto"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { verifyReleasePackageIdentity } from "../scripts/release-package-identity"
import { verifyReleaseSignature } from "../scripts/verify-release-signature"
import {
  resolveMacOsReleaseArtifactFilename,
  resolveWindowsReleaseArtifactFilename,
} from "../src/shared/release-asset-names"

describe("release asset names", () => {
  test("resolves target-specific updater manifests", () => {
    expect(resolveMacOsUpdateManifestFilename("arm64")).toBe("latest-macos-arm64.json")
    expect(resolveMacOsUpdateManifestFilename("x64")).toBe("latest-macos-x64.json")
    expect(resolveWindowsUpdateManifestFilename("x64")).toBe("latest-windows-x64.yml")
  })
})

test("keeps prod and Beta release artifact filenames unchanged", () => {
  expect(resolveMacOsReleaseArtifactFilename("0.1.0", "arm64", "zip")).toBe(
    "buddy-v0.1.0-macos-apple-silicon.zip",
  )
  expect(resolveMacOsReleaseArtifactFilename("0.1.0", "x64", "dmg")).toBe(
    "buddy-v0.1.0-macos-intel.dmg",
  )
  expect(resolveWindowsReleaseArtifactFilename("0.1.0", "x64", "exe")).toBe(
    "buddy-v0.1.0-windows-x64.exe",
  )
})

test("checks the Windows packaged updater destination and product name", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-package-identity-"))
  try {
    const unpacked = path.join(directory, "win-unpacked")
    await mkdir(path.join(unpacked, "resources"), { recursive: true })
    const update = path.join(unpacked, "resources/app-update.yml")
    const executable = path.join(unpacked, "Buddy Beta.exe")
    await Bun.write(update, "provider: github\nowner: prashantbhudwal\nrepo: buddy-beta-releases\n")
    await Bun.write(executable, "fixture")
    const input = {
      architecture: "x64" as const,
      platform: "win32" as const,
      directory,
      distribution: BUDDY_DISTRIBUTIONS.beta,
    }
    await expect(verifyReleasePackageIdentity(input)).resolves.toBeUndefined()
    await Bun.write(update, "provider: github\nowner: prashantbhudwal\nrepo: buddy-releases\n")
    await expect(verifyReleasePackageIdentity(input)).rejects.toThrow("Windows updater destination")
    await Bun.write(update, "provider: github\nowner: prashantbhudwal\nrepo: buddy-beta-releases\n")
    await rm(executable)
    await expect(verifyReleasePackageIdentity(input)).rejects.toThrow("Windows product name")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test.skipIf(process.platform !== "darwin")("checks the macOS packaged bundle id", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-mac-identity-"))
  const originalPath = process.env.PATH
  try {
    const bin = path.join(directory, "bin")
    await mkdir(bin)
    const plutil = path.join(bin, "plutil")
    await Bun.write(plutil, "#!/bin/bash\necho ai.buddy.desktop.beta\n")
    await chmod(plutil, 0o755)
    process.env.PATH = `${bin}:${originalPath}`
    const input = {
      architecture: "arm64" as const,
      platform: "darwin" as const,
      directory,
      distribution: BUDDY_DISTRIBUTIONS.beta,
    }
    await verifyReleasePackageIdentity(input)
    await Bun.write(plutil, "#!/bin/bash\necho ai.buddy.desktop\n")
    await expect(verifyReleasePackageIdentity(input)).rejects.toThrow(
      "does not match ai.buddy.desktop.beta",
    )
  } finally {
    process.env.PATH = originalPath
    await rm(directory, { recursive: true, force: true })
  }
})

test("verifies the selected signing key and rejects another stream's key", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-release-signature-"))
  try {
    const keys = generateKeyPairSync("ed25519")
    const keyId = Buffer.alloc(8, 7)
    const publicKey = Buffer.concat([
      Buffer.from("Ed"),
      keyId,
      keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32),
    ]).toString("base64")
    const file = path.join(directory, "challenge.txt")
    const message = Buffer.from("isolated Beta signing challenge")
    const signature = sign(null, message, keys.privateKey)
    const trustedComment = "timestamp:1\tfile:challenge.txt"
    const signatureText = `untrusted comment: test key\n${Buffer.concat([Buffer.from("Ed"), keyId, signature]).toString("base64")}\ntrusted comment: ${trustedComment}\n${sign(null, Buffer.concat([signature, Buffer.from(trustedComment)]), keys.privateKey).toString("base64")}\n`
    await Bun.write(file, message)
    await Bun.write(`${file}.sig`, signatureText)
    await expect(
      verifyReleaseSignature(file, { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: publicKey }),
    ).resolves.toBeUndefined()
    await expect(verifyReleaseSignature(file, BUDDY_DISTRIBUTIONS.prod)).rejects.toThrow(
      "signing key does not match Buddy",
    )
    await expect(
      verifyReleaseSignature(file, { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: null }),
    ).rejects.toThrow("no updater public key provisioned")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
