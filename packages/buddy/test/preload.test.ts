import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { TEST_SANDBOX } from "../../../script/test-preload"

const inheritedOverrides = [
  "BUDDY_MANAGED_HOME_DIR",
  "BUDDY_DEFAULT_NOTEBOOK_HOME",
  "BUDDY_DIRECTORY_BASE",
  "BUDDY_CONFIG",
  "BUDDY_CONFIG_CONTENT",
  "OPENCODE_DB",
  "OPENCODE_CONFIG_DIR",
] as const

if (process.env.BUDDY_TEST_PRELOAD_PROBE === "1") {
  test.each([...inheritedOverrides])("clears inherited %s before tests run", (key) => {
    expect(process.env[key]).toBeUndefined()
  })
} else {
  test("the preload clears inherited Buddy and OpenCode path and config overrides", () => {
    const result = spawnSync(process.execPath, [
      "test",
      "--preload",
      path.join(import.meta.dir, "preload.ts"),
      import.meta.path,
    ], {
      env: {
        ...process.env,
        ...Object.fromEntries(inheritedOverrides.map((key) => [key, path.join(TEST_SANDBOX.root, key)])),
        BUDDY_TEST_PRELOAD_PROBE: "1",
      },
      encoding: "utf8",
    })
    expect(result.status, result.stderr).toBe(0)
  })
}
