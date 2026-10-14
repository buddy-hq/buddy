import { afterAll, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { getOpenCodeClient } from "../../src/opencode-runtime/client"
import { getOpenCodeHost, closeOpenCodeHost } from "../../src/opencode-runtime/runtime"
import { openCodeRuntimePaths } from "../../src/opencode-runtime/env"

afterAll(closeOpenCodeHost)

test("shares lazy starts and waits for shutdown before opening a replacement host", async () => {
  const [first, same] = await Promise.all([getOpenCodeHost(), getOpenCodeClient()])
  expect(first).toBe(same)
  const paths = openCodeRuntimePaths()
  expect((await first.server.info()).paths.tmp).toBe(await fs.realpath(paths.tmp))
  expect(await fs.stat(paths.database).then((stat) => stat.isFile())).toBe(true)
  const closing = closeOpenCodeHost()
  const replacement = getOpenCodeClient()
  await closing
  const next = await replacement
  expect(next).not.toBe(first)
  expect(await getOpenCodeHost()).toBe(next)
  await expect(first.server.info()).rejects.toMatchObject({ reason: "Transport" })
  expect((await next.server.info()).paths.tmp).toBe(await fs.realpath(paths.tmp))
})
