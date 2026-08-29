import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"

const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..")
const VENDOR_GUARD_PATH = path.join(REPOSITORY_ROOT, "script", "vendor-guard.ts")

test("does not authorize vendor changes through an environment variable", () => {
  const result = spawnSync(process.execPath, [VENDOR_GUARD_PATH, "--stdin"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: { ...process.env, ALLOW_VENDOR_SYNC: "1" },
    input: "vendor/opencode/packages/opencode/src/example.ts\n",
  })

  expect(result.status).toBe(1)
  expect(result.stderr).toContain("Protected vendored source was modified")
})
