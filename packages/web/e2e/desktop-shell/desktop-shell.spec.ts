import { test, expect } from "../fixtures"
import { openNotebookFromEntry } from "../actions"
import {
  chatEntryPageSelector,
  desktopTitlebarSelector,
  settingsColorSchemeSelector,
  settingsThemeSelector,
  titlebarToggleLeftSelector,
} from "../selectors"
import {
  readPlatformCalls,
  resetPlatformCalls,
  setDesktopPlatformOverrides,
  waitForDriver,
} from "../probes"

const realDesktopEnabled = process.env.BUDDY_E2E_DESKTOP_SHELL === "1"

test.describe("desktop-shell", () => {
  test.skip(!realDesktopEnabled, "Set BUDDY_E2E_DESKTOP_SHELL=1 to run desktop-shell suite")

  test("DSK-01 titlebar controls do not trigger window drag", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await e2e.setProviders({ openAIConnected: true })

    await page.goto("/chat")
    await waitForDriver(page)
    await setDesktopPlatformOverrides(page, {
      mode: "desktop",
      os: "macos",
      directoryPickerResults: [notebook],
    })
    await page.reload()

    await expect(page.locator(chatEntryPageSelector)).toBeVisible()
    await openNotebookFromEntry(page, notebook, {
      desktopMode: true,
      os: "macos",
    })

    await expect(page.locator(desktopTitlebarSelector)).toBeVisible()

    await resetPlatformCalls(page)
    await page.locator(titlebarToggleLeftSelector).click()
    const interactiveCalls = await readPlatformCalls(page)
    expect(interactiveCalls?.toggleWindowMaximize ?? 0).toBe(0)
    expect(interactiveCalls?.startWindowDragging ?? 0).toBe(0)
  })

  test("DSK-02 native folder picker cancel keeps state, success opens notebook", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await e2e.setProviders({ openAIConnected: true })

    await page.goto("/chat")
    await waitForDriver(page)
    await setDesktopPlatformOverrides(page, {
      mode: "desktop",
      os: "macos",
      directoryPickerResults: [null, notebook],
    })
    await page.reload()

    await expect(page.locator(chatEntryPageSelector)).toBeVisible()
    await page.locator('[data-action="entry-open-directory-picker"]').click()
    await expect(page.locator(chatEntryPageSelector)).toBeVisible()

    await page.locator('[data-action="entry-open-directory-picker"]').click()
    await expect(page.locator('[data-component="directory-chat-shell"]')).toBeVisible()
  })

  test("DSK-03 desktop storage persists theme, notebook registry, and active notebook across relaunch", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "desktop-persist" })
    await e2e.setProviders({ openAIConnected: true })

    await page.goto("/chat")
    await waitForDriver(page)
    await setDesktopPlatformOverrides(page, {
      mode: "desktop",
      os: "macos",
      directoryPickerResults: [notebook],
    })
    await page.reload()

    await openNotebookFromEntry(page, notebook, {
      desktopMode: true,
      os: "macos",
    })

    await page.goto("/settings?tab=appearance")
    await page.locator(settingsColorSchemeSelector).click()
    await page.locator('[data-slot="select-item"]').filter({ hasText: "Light" }).first().click()
    await expect(page.locator(settingsColorSchemeSelector)).toContainText("Light")
    await page.locator(settingsThemeSelector).click()
    const themeOption = page.locator('[data-slot="select-item"]').nth(1)
    const themeLabel = (await themeOption.innerText()).trim()
    expect(themeLabel.length).toBeGreaterThan(0)
    await themeOption.click()
    await expect(page.locator(settingsThemeSelector)).toContainText(themeLabel)

    await page.goto("/")
    await expect(page.locator('[data-component="directory-chat-shell"]')).toBeVisible()

    const openProjects = await e2e.listOpenProjects()
    expect(openProjects.directories).toContain(notebook)

    await page.goto("/settings?tab=appearance")
    await expect(page.locator(settingsColorSchemeSelector)).toContainText("Light")
    await expect(page.locator(settingsThemeSelector)).toContainText(themeLabel)
  })
})
