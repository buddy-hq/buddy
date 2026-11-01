import { describe, expect, test } from "bun:test"
import path from "node:path"
import { backendDevelopmentWatchRoots } from "../scripts/electron-vite-build-policy"

describe("desktop development source watch policy", () => {
  test("watches backend and bundled workspace dependency source roots", () => {
    const repositoryRoot = path.resolve(import.meta.dir, "../../..")
    const roots = backendDevelopmentWatchRoots(repositoryRoot)

    expect(roots).toContain(path.resolve(repositoryRoot, "packages/buddy/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "packages/buddy/script"))
    expect(roots).toContain(path.resolve(repositoryRoot, "packages/opencode-adapter/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/core/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/codemode/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/ai/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/protocol/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/server/src"))
    expect(roots).toContain(path.resolve(repositoryRoot, "vendor/opencode/packages/sdk/src"))
    expect(roots).not.toContain(path.resolve(repositoryRoot, "packages/web/src"))
  })
})
