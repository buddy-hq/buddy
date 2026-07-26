import { describe, expect, test } from "bun:test"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  backendDevelopmentWatchRoots,
  resolveBackendDevelopmentRebuildCompletion,
  resolveExternalDevelopmentBackend,
  shouldCopyPackagedRuntimeAssets,
} from "../scripts/electron-vite-build-policy"

describe("desktop development build policy", () => {
  test("loads the already-built backend outside the Electron development bundle", () => {
    const backendEntry = path.resolve("packages/buddy/dist/node/node.js")

    expect(resolveExternalDevelopmentBackend("serve", backendEntry)).toEqual({
      external: true,
      id: pathToFileURL(backendEntry).href,
    })
    expect(resolveExternalDevelopmentBackend("build", backendEntry)).toBeUndefined()
  })

  test("copies packaged runtime assets only for production builds", () => {
    expect(shouldCopyPackagedRuntimeAssets("serve")).toBe(false)
    expect(shouldCopyPackagedRuntimeAssets("build")).toBe(true)
  })

  test("watches backend and bundled workspace dependency source roots", () => {
    const repositoryRoot = path.resolve(import.meta.dir, "../../..")
    const roots = backendDevelopmentWatchRoots(repositoryRoot)

    expect(roots).toContain(path.resolve(repositoryRoot, "packages/buddy/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "packages/buddy/script"))
    expect(roots).toContain(path.resolve(repositoryRoot, "packages/opencode-adapter/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/opencode/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/codemode/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/llm/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/protocol/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/server/src"))
    expect(roots).not.toContain(path.resolve(repositoryRoot, "packages/web/src"))
  })

  test("does not reload an intermediate artifact when another rebuild is queued", () => {
    expect(
      resolveBackendDevelopmentRebuildCompletion({
        backendBuildSucceeded: true,
        sdkRefreshSucceeded: true,
        rebuildQueued: true,
      }),
    ).toBe("rebuild")
    expect(
      resolveBackendDevelopmentRebuildCompletion({
        backendBuildSucceeded: true,
        sdkRefreshSucceeded: true,
        rebuildQueued: false,
      }),
    ).toBe("reload")
    expect(
      resolveBackendDevelopmentRebuildCompletion({
        backendBuildSucceeded: true,
        sdkRefreshSucceeded: false,
        rebuildQueued: false,
      }),
    ).toBe("failed")
  })
})
