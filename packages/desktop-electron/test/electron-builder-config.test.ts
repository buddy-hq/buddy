import { describe, expect, test } from "bun:test"
import config from "../electron-builder.config"
import {
  WINDOWS_RELEASE_ARCHS,
  resolveWindowsReleaseArtifactPattern,
} from "../src/shared/release-asset-names"

describe("electron-builder config", () => {
  test("keeps unsigned Windows NSIS updates compatible with the signed manifest updater", () => {
    expect(config.win?.target).toEqual(["nsis"])
    expect(config.win?.artifactName).toBe(
      resolveWindowsReleaseArtifactPattern(WINDOWS_RELEASE_ARCHS[0]),
    )
    expect(config.win?.verifyUpdateCodeSignature).toBe(false)
  })
})
