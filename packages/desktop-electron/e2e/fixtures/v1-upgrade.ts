import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { expect, type Page } from "@playwright/test"
import z from "zod"
import { BUDDY_ENV } from "@buddy/script/storage-env"
import { resolveDevRuntimeEnvironment } from "../../src/main/storage-paths"
import type { BeforeLaunch } from "./app"

const execute = promisify(execFile)

export const upgradeProgressText = "Bringing over your chats from the previous version…"
export const upgradeSeedPauseMilliseconds = "20000"

export const restoreUpgrade: BeforeLaunch = async ({ root, home, userData, dataDirectory, stateDirectory }) => {
  const temporaryDirectory = path.join(root, "tmp")
  await execute("bun", [fileURLToPath(new URL("./restore-v1-upgrade.ts", import.meta.url)), root, home, dataDirectory, stateDirectory], {
    env: {
      PATH: process.env.PATH,
      Path: process.env.Path,
      SystemRoot: process.env.SystemRoot,
      SYSTEMROOT: process.env.SYSTEMROOT,
      ...resolveDevRuntimeEnvironment(userData),
      HOME: home,
      USERPROFILE: home,
      TMPDIR: temporaryDirectory,
      TMP: temporaryDirectory,
      TEMP: temporaryDirectory,
      [BUDDY_ENV.TEST_HOME]: home,
      [BUDDY_ENV.TEST_XDG_ROOT]: root,
    },
  })
}

export async function waitForImport(page: Page) {
  const server = await page.evaluate(() => window.api.awaitInitialization(() => undefined))
  const authorization = `Basic ${Buffer.from(`${server.username ?? ""}:${server.password ?? ""}`).toString("base64")}`
  await expect.poll(async () => {
    const response = await page.request.get(new URL("/api/runtime/v1-import", server.url).href, { headers: { authorization }, timeout: 5_000 })
    expect(response.ok()).toBe(true)
    return z.object({ import: z.object({ status: z.string() }).nullable() }).parse(await response.json()).import?.status
  }, { message: "The first-launch chat import must complete", timeout: 30_000 }).toBe("completed")
}
