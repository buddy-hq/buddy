import { afterAll, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { getAgentRuntime, closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { runtimeHost } from "../helpers/opencode"
import { openCodeRuntimePaths } from "../../src/runtime/runtime-paths"

afterAll(closeAgentRuntime)

test("shares lazy starts and waits for shutdown before opening a replacement host", async () => {
  const [first, same] = await Promise.all([getAgentRuntime(), getAgentRuntime()])
  expect(first).toBe(same)
  const paths = openCodeRuntimePaths()
  expect((await runtimeHost(first).server.info()).paths.tmp).toBe(await fs.realpath(paths.tmp))
  expect(await fs.stat(paths.database).then((stat) => stat.isFile())).toBe(true)
  const closing = closeAgentRuntime()
  const replacement = getAgentRuntime()
  await closing
  const next = await replacement
  expect(next).not.toBe(first)
  expect(await getAgentRuntime()).toBe(next)
  await expect(runtimeHost(first).server.info()).rejects.toMatchObject({ reason: "Transport" })
  expect((await runtimeHost(next).server.info()).paths.tmp).toBe(await fs.realpath(paths.tmp))
})
