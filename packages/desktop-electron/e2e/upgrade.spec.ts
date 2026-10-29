import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { Page } from "@playwright/test"
import z from "zod"
import { BUDDY_ENV } from "@buddy/script/storage-env"
import { expect, test } from "./fixtures/app"
import {
  restoreUpgrade,
  upgradeProgressText,
  upgradeSeedPauseMilliseconds,
  waitForImport,
} from "./fixtures/v1-upgrade"

const parentSessionID = "ses_e9bc348c6ffeVYp3hNj10v5E1K"
const separateSessionID = "ses_e9bc34367ffeUhIRiVk04oUEhK"
const expectedTexts = [
  "What is photosynthesis?",
  "Fixture assistant reply 1: photosynthesis uses light, water and carbon dioxide to make glucose and oxygen.",
  "FIXTURE_READ Please read lesson.md and tell me what it says.",
]

test.use({
  expectedBlockedHosts: ["chatgpt.com"],
  launchEnvironment: { [BUDDY_ENV.TEST_V2_SEED_PAUSE_MS]: upgradeSeedPauseMilliseconds },
  firstLaunchReady: async ({ playwright: _playwright }, use) => {
    await use(async (page) => {
      await expect(page.getByText(upgradeProgressText, { exact: true })).toBeVisible()
    })
  },
  beforeLaunch: async ({ playwright: _playwright }, use) => {
    await use(restoreUpgrade)
  },
})

async function assertImportedHistory(page: Page, notebook: string) {
  const group = page.locator(
    `[data-component="left-sidebar-directory-group"][data-directory=${JSON.stringify(notebook)}]`,
  )
  const toggle = group.locator('[data-action="left-sidebar-directory-toggle"]')
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveText("Fixture Notebook")
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click()
  const parent = group.locator(
    `[data-action="left-sidebar-thread-select"][data-session-id="${parentSessionID}"]`,
  )
  const separate = group.locator(
    `[data-action="left-sidebar-thread-select"][data-session-id="${separateSessionID}"]`,
  )
  await expect(parent).toHaveCount(1)
  await expect(parent).toHaveText("Photosynthesis basics")
  await expect(parent).toBeVisible()
  await expect(separate).toHaveCount(1)
  await expect(separate).toHaveText("Respiration follow-up")
  await expect(separate).toBeVisible()
  await parent.click()
  await expect(parent).toHaveAttribute("data-active", "true")
  await expect(page.getByRole("textbox", { name: "Ask Buddy", exact: true })).toBeVisible()

  const viewport = page.locator(
    '[data-component="chat-transcript-scroll-area"] [data-slot="scroll-area-viewport"]',
  )
  await viewport.hover()
  await page.mouse.wheel(0, -100_000)
  await expect(
    viewport
      .locator('[data-timeline-row="UserMessage"]')
      .getByText(expectedTexts[0], { exact: true }),
  ).toBeVisible()
  await expect(
    viewport
      .locator('[data-timeline-row="AssistantPart"]')
      .getByText(expectedTexts[1], { exact: true }),
  ).toBeVisible()
  await expect(
    viewport.getByText(
      /^(?:What is photosynthesis\?|Fixture assistant reply 1:.*|FIXTURE_READ Please read lesson\.md and tell me what it says\.)$/u,
    ),
  ).toHaveText(expectedTexts)
  await expect(page.locator('[data-component="left-sidebar-chat-import-notice"]')).toHaveCount(0)
}

test("the first launch brings over v1 chats and preserves them after a restart", async ({
  buddy,
}) => {
  const restored = z
    .object({ notebook: z.string(), v1Database: z.string(), sha256: z.string() })
    .parse(JSON.parse(await fs.readFile(path.join(buddy.root, "v1-upgrade.json"), "utf8")))
  await waitForImport(buddy.page)
  await assertImportedHistory(buddy.page, restored.notebook)
  expect(
    createHash("sha256")
      .update(await fs.readFile(restored.v1Database))
      .digest("hex"),
  ).toBe(restored.sha256)
  expect(
    (await fs.stat(path.join(path.dirname(restored.v1Database), "opencode-v2.db"))).isFile(),
  ).toBe(true)

  await buddy.restart()

  await waitForImport(buddy.page)
  await assertImportedHistory(buddy.page, restored.notebook)
  expect(
    createHash("sha256")
      .update(await fs.readFile(restored.v1Database))
      .digest("hex"),
  ).toBe(restored.sha256)
})
