import { describe, expect, test } from "bun:test"
import {
  releaseTargetEnvironment,
  releaseTargetSelectionEnvironment,
  resolveNativeReleaseSmokeTarget,
} from "../scripts/release-smoke-target"

describe("release smoke target", () => {
  test("maps supported native hosts to release targets", () => {
    expect(resolveNativeReleaseSmokeTarget("darwin", "arm64")).toBe("macos-arm64")
    expect(resolveNativeReleaseSmokeTarget("darwin", "x64")).toBe("macos-x64")
    expect(resolveNativeReleaseSmokeTarget("win32", "x64")).toBe("windows-x64")
  })

  test("rejects hosts that cannot produce a native release", () => {
    expect(() => resolveNativeReleaseSmokeTarget("linux", "x64")).toThrow(
      "Unsupported local release smoke host: linux-x64",
    )
    expect(() => resolveNativeReleaseSmokeTarget("win32", "arm64")).toThrow(
      "Unsupported local release smoke host: win32-arm64",
    )
  })

  test("provides target-native build environment", () => {
    expect(releaseTargetEnvironment("macos-arm64")).toEqual({
      BUDDY_NODE_ARTIFACT_TARGET_ARCH: "arm64",
      BUDDY_NODE_ARTIFACT_TARGET_PLATFORM: "darwin",
    })
    expect(releaseTargetEnvironment("windows-x64")).toEqual({
      BUDDY_NODE_ARTIFACT_TARGET_ARCH: "x64",
      BUDDY_NODE_ARTIFACT_TARGET_PLATFORM: "win32",
    })
  })

  test("selects exactly one target for local manifest validation", () => {
    expect(releaseTargetSelectionEnvironment("macos-x64")).toEqual({
      BUDDY_RELEASE_TARGET_MACOS_ARM64: "false",
      BUDDY_RELEASE_TARGET_MACOS_X64: "true",
      BUDDY_RELEASE_TARGET_WINDOWS_X64: "false",
    })
  })
})
