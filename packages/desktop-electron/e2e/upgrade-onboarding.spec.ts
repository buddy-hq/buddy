import fs from "node:fs/promises"
import path from "node:path"
import { BUDDY_ENV } from "@buddy/script/storage-env"
import { expect, test } from "./fixtures/app"
import { restoreUpgrade, upgradeProgressText, upgradeSeedPauseMilliseconds, waitForImport } from "./fixtures/v1-upgrade"

test.use({
  expectedBlockedHosts: ["chatgpt.com", "fonts.googleapis.com"],
  launchEnvironment: { [BUDDY_ENV.TEST_V2_SEED_PAUSE_MS]: upgradeSeedPauseMilliseconds },
  firstLaunchReady: async ({ playwright: _playwright }, use) => {
    await use(async (page) => {
      await expect(page.getByText(upgradeProgressText, { exact: true })).toBeVisible()
    })
  },
  beforeLaunch: async ({ playwright: _playwright }, use) => {
    await use(async (input) => {
      await restoreUpgrade(input)
      await fs.rm(path.join(input.userData, "buddy.onboarding.dat"))
    })
  },
})

test("shows upgrade progress before onboarding and completes the import", async ({ buddy }) => {
  await buddy.page.getByRole("button", { name: "Let's begin", exact: true }).click()
  await expect(buddy.page.getByText("For students, researchers, and lifelong learners.", { exact: true })).toBeVisible()
  await waitForImport(buddy.page)
})
