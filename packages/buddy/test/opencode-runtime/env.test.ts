import { expect, test } from "bun:test"
import path from "node:path"
import { resolveOpenCodeEnvironmentPlan } from "../../src/opencode-runtime/env"
import { temporaryDirectory } from "../helpers/temporary-directory"

test("keeps v2 state in the runtime root and preserves Buddy's existing config and database names", async () => {
  await using root = await temporaryDirectory()
  const runtimeRoot = path.join(root.path, "runtime with spaces")
  const plan = resolveOpenCodeEnvironmentPlan({
    environment: { BUDDY_RUNTIME_ROOT: encodeURIComponent(runtimeRoot), BUDDY_TEST_HOME: path.join(runtimeRoot, "home") },
    homeDirectory: root.path, temporaryDirectory: root.path, workingDirectory: root.path,
  })
  expect(plan.openCode).toEqual({
    data: path.join(runtimeRoot, "data", "buddy", "opencode"),
    cache: path.join(runtimeRoot, "cache", "buddy", "opencode"),
    state: path.join(runtimeRoot, "state", "buddy", "opencode"),
    config: path.join(runtimeRoot, "home", ".buddy"),
    tmp: path.join(runtimeRoot, "tmp", "buddy", "opencode"),
    database: path.join(runtimeRoot, "data", "buddy", "opencode", "opencode.db"),
  })
})

test("resolves explicit Buddy directory overrides against the working directory", async () => {
  await using root = await temporaryDirectory()
  const plan = resolveOpenCodeEnvironmentPlan({
    environment: {
      BUDDY_RUNTIME_ROOT: root.path, BUDDY_DATA_DIR: "custom%20data", BUDDY_CACHE_DIR: "custom-cache",
      BUDDY_STATE_DIR: "custom-state", BUDDY_GLOBAL_CONFIG_DIR: "custom-config",
    },
    homeDirectory: root.path, temporaryDirectory: root.path, workingDirectory: root.path,
  })
  expect(plan.openCode.data).toBe(path.join(root.path, "custom data", "opencode"))
  expect(plan.openCode.database).toBe(path.join(root.path, "custom data", "opencode", "opencode.db"))
  expect(plan.openCode.cache).toBe(path.join(root.path, "custom-cache", "opencode"))
  expect(plan.openCode.state).toBe(path.join(root.path, "custom-state", "opencode"))
  expect(plan.openCode.config).toBe(path.join(root.path, "custom-config"))
})
