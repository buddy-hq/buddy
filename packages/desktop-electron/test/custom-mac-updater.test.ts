import { afterEach, describe, expect, test } from "bun:test"
import {
  createCustomMacUpdater,
  isMacUpdateAvailable,
  parseMacInstallerResult,
  resolveDefaultMacMetadataUrl,
  resolveMacRecoveryMetadataUrls,
} from "../src/main/custom-mac-updater"
import { resolveMacOsReleaseArtifactFilename } from "../src/shared/release-asset-names"
import { createTestFetch } from "./helpers/fetch"

const CURRENT_VERSION = "2.0.0"
const ROLLBACK_VERSION = "1.9.0"
const NEXT_VERSION = "2.1.0"
const EMPTY_VERSION = ""
const INSTALLER_FAILURE_EXIT_CODE = 23
const ORIGINAL_FETCH = globalThis.fetch
const FIRST_UPDATE_VERSION = "2.1.0"
const REPLACEMENT_UPDATE_VERSION = "2.2.0"
const TEST_ARCHIVE_SIZE_BYTES = 1

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

function createTestCustomMacUpdater(input: {
  onDownload?: (version: string) => void
  versions: readonly string[]
}) {
  const architecture = process.arch
  if (architecture !== "arm64" && architecture !== "x64") {
    throw new Error(`Unsupported test architecture: ${architecture}`)
  }

  let manifestChecks = 0
  const updater = createCustomMacUpdater(
    {
      appName: "Buddy",
      appPath: "/Applications/Buddy.app",
      appRootPath: "/tmp/Buddy.app",
      cachePath: "/tmp/buddy-update-cache",
      currentVersion: CURRENT_VERSION,
      execPath: "/Applications/Buddy.app/Contents/MacOS/Buddy",
      logger: {
        error: () => undefined,
        info: () => undefined,
        warn: () => undefined,
      },
      logsPath: "/tmp/buddy-update-logs",
      metadataUrl: "https://example.invalid/latest.json",
      packaged: true,
      quit: () => undefined,
      resourcesPath: "/Applications/Buddy.app/Contents/Resources",
      stopBackend: () => undefined,
    },
    {
      downloadArchive: async (_entry, version) => {
        input.onDownload?.(version)
        return `/tmp/${version}.zip`
      },
      fetchManifest: async () => {
        const version = input.versions[manifestChecks]
        manifestChecks += 1
        if (!version) {
          throw new Error("Missing test update version")
        }
        return {
          files: [
            {
              sha512: "unused-test-digest",
              size: TEST_ARCHIVE_SIZE_BYTES,
              url: resolveMacOsReleaseArtifactFilename(version, architecture, "zip"),
            },
          ],
          version,
        }
      },
    },
  )

  return {
    getManifestChecks: () => manifestChecks,
    updater,
  }
}

describe("isMacUpdateAvailable", () => {
  test("keeps normal latest update checks newer-only", () => {
    expect(
      isMacUpdateAvailable({
        currentVersion: CURRENT_VERSION,
        nextVersion: NEXT_VERSION,
      }),
    ).toBe(true)

    expect(
      isMacUpdateAvailable({
        currentVersion: CURRENT_VERSION,
        nextVersion: ROLLBACK_VERSION,
      }),
    ).toBe(false)
  })

  test("allows exact recovery targets to downgrade", () => {
    expect(
      isMacUpdateAvailable({
        currentVersion: CURRENT_VERSION,
        expectedVersion: ROLLBACK_VERSION,
        nextVersion: ROLLBACK_VERSION,
      }),
    ).toBe(true)
  })

  test("rejects empty and mismatched recovery versions", () => {
    expect(
      isMacUpdateAvailable({
        currentVersion: CURRENT_VERSION,
        expectedVersion: ROLLBACK_VERSION,
        nextVersion: EMPTY_VERSION,
      }),
    ).toBe(false)

    expect(
      isMacUpdateAvailable({
        currentVersion: CURRENT_VERSION,
        expectedVersion: ROLLBACK_VERSION,
        nextVersion: NEXT_VERSION,
      }),
    ).toBe(false)
  })
})

describe("custom mac updater refresh", () => {
  test("rejects install requests without a matching downloaded version", async () => {
    const { updater } = createTestCustomMacUpdater({
      versions: [FIRST_UPDATE_VERSION],
    })

    await expect(updater.installUpdate(FIRST_UPDATE_VERSION)).rejects.toThrow(
      `No downloaded macOS update is ready for version ${FIRST_UPDATE_VERSION}`,
    )
  })

  test("replaces a downloaded update when a newer manifest appears", async () => {
    const versions = [FIRST_UPDATE_VERSION, REPLACEMENT_UPDATE_VERSION, REPLACEMENT_UPDATE_VERSION]
    const downloadedVersions: string[] = []
    const { getManifestChecks, updater } = createTestCustomMacUpdater({
      onDownload: (version) => downloadedVersions.push(version),
      versions,
    })

    await expect(updater.checkForUpdate({ ring: "preview" })).resolves.toEqual({
      updateAvailable: true,
      version: FIRST_UPDATE_VERSION,
    })
    expect(updater.isUpdateReady(FIRST_UPDATE_VERSION)).toBe(true)
    await expect(updater.checkForUpdate({ ring: "preview" })).resolves.toEqual({
      updateAvailable: true,
      version: REPLACEMENT_UPDATE_VERSION,
    })
    expect(updater.isUpdateReady(FIRST_UPDATE_VERSION)).toBe(false)
    expect(updater.isUpdateReady(REPLACEMENT_UPDATE_VERSION)).toBe(true)
    await expect(updater.checkForUpdate({ ring: "preview" })).resolves.toEqual({
      updateAvailable: true,
      version: REPLACEMENT_UPDATE_VERSION,
    })
    expect(getManifestChecks()).toBe(versions.length)
    expect(downloadedVersions).toEqual([FIRST_UPDATE_VERSION, REPLACEMENT_UPDATE_VERSION])
  })

  test("keeps a downloaded update ready when manifest revalidation fails", async () => {
    const { updater } = createTestCustomMacUpdater({
      versions: [FIRST_UPDATE_VERSION],
    })

    await expect(updater.checkForUpdate({ ring: "preview" })).resolves.toEqual({
      updateAvailable: true,
      version: FIRST_UPDATE_VERSION,
    })
    await expect(updater.checkForUpdate({ ring: "preview" })).resolves.toEqual({
      failed: true,
      updateAvailable: false,
    })
    expect(updater.isUpdateReady(FIRST_UPDATE_VERSION)).toBe(true)
  })
})

describe("resolveMacRecoveryMetadataUrls", () => {
  test("resolves stable and preview metadata urls by update ring", async () => {
    await expect(resolveDefaultMacMetadataUrl("stable")).resolves.toBe(
      `https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/latest-macos-${process.arch}.json`,
    )

    globalThis.fetch = createTestFetch(
      async () =>
        new Response(
          JSON.stringify([
            {
              draft: false,
              prerelease: true,
              published_at: "2026-01-02T00:00:00Z",
              tag_name: "v2.1.0",
            },
          ]),
        ),
    )

    await expect(resolveDefaultMacMetadataUrl("preview")).resolves.toBe(
      `https://github.com/prashantbhudwal/buddy-releases/releases/download/v2.1.0/latest-macos-${process.arch}.json`,
    )
  })

  test("tries target-specific manifest before pre-migration manifest", () => {
    expect(resolveMacRecoveryMetadataUrls(ROLLBACK_VERSION)).toEqual([
      `https://github.com/prashantbhudwal/buddy-releases/releases/download/v${ROLLBACK_VERSION}/latest-macos-${process.arch}.json`,
      `https://github.com/prashantbhudwal/buddy-releases/releases/download/v${ROLLBACK_VERSION}/latest-mac.json`,
    ])
  })
})

describe("parseMacInstallerResult", () => {
  test("parses terminal installer results", () => {
    expect(
      parseMacInstallerResult(
        JSON.stringify({
          exitCode: INSTALLER_FAILURE_EXIT_CODE,
          status: "failed",
        }),
      ),
    ).toEqual({
      exitCode: INSTALLER_FAILURE_EXIT_CODE,
      status: "failed",
    })

    expect(parseMacInstallerResult(JSON.stringify({ status: "succeeded" }))).toEqual({
      status: "succeeded",
    })
  })

  test("rejects malformed installer results", () => {
    expect(() => parseMacInstallerResult(JSON.stringify({ status: "unknown" }))).toThrow(
      "Invalid mac installer result status",
    )
    expect(() =>
      parseMacInstallerResult(
        JSON.stringify({
          exitCode: "1",
          status: "failed",
        }),
      ),
    ).toThrow("Invalid mac installer result exitCode")
  })
})
