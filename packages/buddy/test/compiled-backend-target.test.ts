import { expect, test } from "bun:test"
import { resolveCompiledBackendTarget } from "../script/compiled-backend-target"

test.each([
  ["darwin", "arm64", "bun-darwin-arm64"],
  ["darwin", "x64", "bun-darwin-x64-baseline"],
  ["win32", "arm64", "bun-windows-arm64"],
  ["win32", "x64", "bun-windows-x64-baseline"],
  ["linux", "arm64", "bun-linux-arm64"],
  ["linux", "x64", "bun-linux-x64"],
] as const)("selects %s-%s as %s", (platform, arch, expected) => {
  expect(resolveCompiledBackendTarget({ host: { platform, arch }, requested: {} })).toBe(expected)
  expect(
    resolveCompiledBackendTarget({ host: { platform, arch }, requested: { platform, arch } }),
  ).toBe(expected)
})

test.each([
  { platform: "win32", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
])("rejects a target different from the host: %j", (requested) => {
  expect(() =>
    resolveCompiledBackendTarget({ host: { platform: "darwin", arch: "arm64" }, requested }),
  ).toThrow("Backend must be built natively")
})

test("rejects an unsupported host", () => {
  expect(() =>
    resolveCompiledBackendTarget({ host: { platform: "aix", arch: "ppc64" }, requested: {} }),
  ).toThrow("Unsupported backend build host")
})
