import { describe, expect, test } from "bun:test"
import {
  isMacUpdateAvailable,
  parseMacInstallerResult,
  resolveMacRecoveryMetadataUrls,
} from "../src/main/custom-mac-updater"

const CURRENT_VERSION = "2.0.0"
const ROLLBACK_VERSION = "1.9.0"
const NEXT_VERSION = "2.1.0"
const EMPTY_VERSION = ""
const INSTALLER_FAILURE_EXIT_CODE = 23

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

describe("resolveMacRecoveryMetadataUrls", () => {
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
