import { afterAll, expect, test } from "bun:test"
import { app } from "../src/app"
import { closeAgentRuntime } from "../src/runtime/agent-runtime"
import {
  RUNTIME_UPGRADE_VERSION,
  reportRuntimeUpgrade,
  runtimeUpgradeAnswersHealth,
  runtimeUpgradeSeedPauseMs,
  runtimeUpgradeState,
  waitForRuntimeUpgrade,
} from "../src/runtime/runtime-upgrade"

afterAll(async () => {
  await closeAgentRuntime()
})

test("the upgrade state answers health while copying, migrating or failed, and a failure stays until a start succeeds", async () => {
  expect(runtimeUpgradeState()).toEqual({ state: "idle" })
  expect(runtimeUpgradeAnswersHealth()).toBe(false)
  const waiting = waitForRuntimeUpgrade()
  let resolved = false
  void waiting.upgrading.then(() => {
    resolved = true
  })
  reportRuntimeUpgrade({ state: "copying" })
  await Promise.resolve()
  expect(resolved).toBe(true)
  reportRuntimeUpgrade({
    state: "failed",
    error: "Not enough disk space to upgrade your chats: need 2 MB, have 1 MB",
  })
  reportRuntimeUpgrade({ state: "migrating" })
  expect(runtimeUpgradeState()).toEqual({
    state: "failed",
    error: "Not enough disk space to upgrade your chats: need 2 MB, have 1 MB",
  })
  expect(runtimeUpgradeAnswersHealth()).toBe(true)
  reportRuntimeUpgrade({ state: "ready" })
  expect(runtimeUpgradeAnswersHealth()).toBe(false)
})

test("/api/health answers at once with the runtime version while an upgrade is underway", async () => {
  reportRuntimeUpgrade({ state: "copying" })
  const started = performance.now()
  const response = await app.request("/api/health")
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ healthy: true, version: RUNTIME_UPGRADE_VERSION })
  expect(performance.now() - started).toBeLessThan(1_000)
  reportRuntimeUpgrade({ state: "ready" })
})

test("the injected seed pause is read only from its test variable", () => {
  expect(runtimeUpgradeSeedPauseMs({})).toBeUndefined()
  expect(runtimeUpgradeSeedPauseMs({ BUDDY_TEST_V2_SEED_PAUSE_MS: "0" })).toBeUndefined()
  expect(runtimeUpgradeSeedPauseMs({ BUDDY_TEST_V2_SEED_PAUSE_MS: "35000" })).toBe(35_000)
})
