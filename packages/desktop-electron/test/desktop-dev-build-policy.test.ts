import { describe, expect, test } from "bun:test"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
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
})
