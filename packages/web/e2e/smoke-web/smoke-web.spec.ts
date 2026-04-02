import { test, expect } from "../fixtures"
import {
  attachPromptFile,
  openRightSidebarIfClosed,
  openNotebookFromEntry,
  removeFirstPromptAttachment,
  sendPrompt,
  typeMultilinePrompt,
} from "../actions"
import {
  chatEntryEmptyStateSelector,
  directoryChatShellSelector,
  onboardingSetupSelector,
  leftSidebarThreadSelectSelector,
  promptAttachmentItemSelector,
  promptEditorSelector,
  titlebarDisconnectOpenAiSelector,
  titlebarTestOnboardingSelector,
  rightSidebarTabEditorSelector,
  teachingEditorPanelSelector,
  teachingEmptyStateSelector,
  teachingStartSelector,
} from "../selectors"
import { setDesktopPlatformOverrides, waitForDriver } from "../probes"

function normalizeText(value: string | null) {
  return (value ?? "").replaceAll("\u200B", "").trim()
}

async function readPromptText(page: import("@playwright/test").Page) {
  return normalizeText(
    await page.locator(promptEditorSelector).evaluate((node) => (node as HTMLElement).innerText),
  )
}

test.describe("smoke-web", () => {
  test("ENT-01 web /chat without open notebooks renders entry screen", async ({ page }) => {
    await page.goto("/chat")
    await expect(page.locator(chatEntryEmptyStateSelector)).toBeVisible()
    await expect(page).toHaveURL(/\/chat$/)
  })

  test("ENT-02 desktop first launch routes to onboarding", async ({ page }) => {
    await page.goto("/chat")
    await waitForDriver(page)
    await setDesktopPlatformOverrides(page, { mode: "desktop", os: "macos" })
    await page.reload()

    await page.goto("/")
    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(page.locator(onboardingSetupSelector)).toBeVisible()
  })

  test("ENT-03 onboarding is skipped when backend already has a notebook", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await e2e.setOpenProjects([notebook])

    await page.goto("/chat")
    await waitForDriver(page)
    await setDesktopPlatformOverrides(page, {
      mode: "desktop",
      os: "macos",
    })
    await page.reload()

    await page.goto("/")
    await expect(page.locator(directoryChatShellSelector)).toBeVisible()
    await expect(page).not.toHaveURL(/\/onboarding$/)
  })

  test("ENT-03 onboarding is skipped when OpenAI provider is already connected", async ({
    page,
    e2e,
  }) => {
    await e2e.setOpenProjects([])
    await e2e.setProviders({ openAIConnected: true })

    await page.goto("/chat")
    await waitForDriver(page)
    await setDesktopPlatformOverrides(page, {
      mode: "desktop",
      os: "macos",
    })
    await page.reload()

    await page.goto("/")
    await expect(page).toHaveURL(/\/chat$/)
    await expect(page.locator(chatEntryEmptyStateSelector)).toBeVisible()
    await expect(page.locator(onboardingSetupSelector)).toHaveCount(0)
  })

  test("ENT-04 dev titlebar shortcut toggles onboarding test mode from chat", async ({
    page,
    createNotebook,
    gotoDirectoryChat,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await e2e.setOpenProjects([notebook])
    await e2e.setProviders({ openAIConnected: true })

    await page.goto("/chat")
    await waitForDriver(page)
    await setDesktopPlatformOverrides(page, {
      mode: "desktop",
      os: "macos",
    })
    await page.reload()

    await gotoDirectoryChat(notebook)
    await page.locator(titlebarTestOnboardingSelector).click()

    await expect(page).toHaveURL(/\/onboarding\?test=onboarding(?:&returnTo=.*)?$/)
    await expect(page.locator(onboardingSetupSelector)).toBeVisible()

    await page.locator(titlebarTestOnboardingSelector).click()
    await expect(page.locator(directoryChatShellSelector)).toBeVisible()
    await expect(page).toHaveURL(/\/chat$/)
  })

  test("ENT-06 dev titlebar shortcut disconnects OpenAI from the runtime", async ({
    page,
    createNotebook,
    gotoDirectoryChat,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await e2e.setOpenProjects([notebook])
    await e2e.setProviders({ openAIConnected: true })

    await page.goto("/chat")
    await waitForDriver(page)
    await setDesktopPlatformOverrides(page, {
      mode: "desktop",
      os: "macos",
    })
    await page.reload()

    await gotoDirectoryChat(notebook)
    await expect(page.locator(titlebarDisconnectOpenAiSelector)).toBeVisible()

    await page.locator(titlebarDisconnectOpenAiSelector).click()
    await expect
      .poll(async () => {
        const state = await e2e.getState()
        return state.runtime.providers.openAIConnected
      })
      .toBe(false)
  })

  test("ENT-05 direct /$directory/chat bootstraps notebook membership", async ({
    createNotebook,
    gotoDirectoryChat,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await gotoDirectoryChat(`${notebook}/`)

    const openProjects = await e2e.listOpenProjects()
    expect(openProjects.directories).toContain(notebook)
  })

  test("NB-01 opening notebook from entry stores canonical directory and navigates to chat", async ({
    page,
    createNotebook,
    gotoChat,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await gotoChat()
    await openNotebookFromEntry(page, `${notebook}/`)

    const openProjects = await e2e.listOpenProjects()
    expect(openProjects.directories[0]).toBe(notebook)
    await expect(page.locator(directoryChatShellSelector)).toBeVisible()
  })

  test("PRM-01 Enter submits while Shift+Enter inserts newline", async ({
    page,
    createNotebook,
    gotoChat,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await gotoChat()
    await openNotebookFromEntry(page, notebook)

    await typeMultilinePrompt(page, "line one", "line two")
    await expect.poll(() => readPromptText(page)).toContain("line one\nline two")

    await page.locator(promptEditorSelector).press("Enter")
    await expect
      .poll(async () => {
        const state = await e2e.getState()
        return state.runtime.counters.promptCalls
      })
      .toBe(1)
  })

  test("SES-01 first prompt send auto-creates session and transitions to idle", async ({
    page,
    createNotebook,
    gotoChat,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await gotoChat()
    await openNotebookFromEntry(page, notebook)
    await sendPrompt(page, "create a first turn")

    let sessionID = ""
    await expect
      .poll(async () => {
        const sessions = await e2e.listSessions(notebook)
        sessionID = sessions[0]?.id ?? ""
        return sessionID.length > 0
      })
      .toBe(true)

    await expect
      .poll(async () => {
        const state = await e2e.getState()
        return state.runtime.counters.promptCalls
      })
      .toBe(1)

    await expect
      .poll(async () => {
        const messages = await e2e.listSessionMessages(notebook, sessionID)
        return messages.map((message) => message.info.role).join(",")
      })
      .toContain("user")
  })

  test("SES-02 reload restores active transcript and draft", async ({
    page,
    createNotebook,
    gotoDirectoryChat,
    e2e,
  }) => {
    const notebook = await createNotebook()
    const seeded = await e2e.seedSession({
      directory: notebook,
      title: "Smoke transcript",
      turnCount: 2,
    })

    await gotoDirectoryChat(notebook)
    await page
      .locator(leftSidebarThreadSelectSelector)
      .filter({ hasText: "Smoke transcript" })
      .first()
      .click()
    await expect(page.getByText("Seeded user message 1")).toBeVisible()

    await page.locator(promptEditorSelector).click()
    await page.locator(promptEditorSelector).fill("draft text survives reload")
    await page.reload()

    await expect(page.getByText("Seeded user message 1")).toBeVisible()
    await expect.poll(() => readPromptText(page)).toContain("draft text survives reload")
    expect(seeded.sessionID.length).toBeGreaterThan(0)
  })

  test("CFG-01 appearance theme and color scheme survive reload", async ({
    page,
    createNotebook,
    gotoDirectoryChat,
  }) => {
    const notebook = await createNotebook()
    await gotoDirectoryChat(notebook)

    await page.goto("/settings?tab=appearance")
    await page.locator('[data-action="settings-color-scheme"]').click()
    await page.locator('[data-slot="select-item"]').filter({ hasText: "Light" }).first().click()

    await page.locator('[data-action="settings-theme"]').click()
    await page.locator('[data-slot="select-item"]').nth(1).click()

    const beforeReload = await page.evaluate(() => ({
      colorScheme: localStorage.getItem("opencode-color-scheme"),
      themeId: localStorage.getItem("opencode-theme-id"),
    }))

    await page.reload()
    await expect(page).toHaveURL(/\/settings\?tab=appearance/)

    const afterReload = await page.evaluate(() => ({
      colorScheme: localStorage.getItem("opencode-color-scheme"),
      themeId: localStorage.getItem("opencode-theme-id"),
    }))

    expect(afterReload.colorScheme).toBe(beforeReload.colorScheme)
    expect(afterReload.themeId).toBe(beforeReload.themeId)
  })

  test("TCH-02 starting interactive lesson opens editor panel", async ({
    page,
    createNotebook,
    gotoChat,
    e2e,
  }) => {
    const notebook = await createNotebook({
      files: {
        "src/main.ts": "export const value = 1\n",
      },
    })
    await e2e.patchProjectConfig(notebook, {
      default_persona: "code-buddy",
    })
    await e2e.seedSession({
      directory: notebook,
      title: "Interactive seed",
      includeAssistant: false,
    })

    await gotoChat()
    await openNotebookFromEntry(page, notebook)

    await openRightSidebarIfClosed(page)
    await page.locator(rightSidebarTabEditorSelector).click()
    await expect(page.locator(teachingEmptyStateSelector)).toBeVisible()
    await expect(page.locator(teachingStartSelector)).toBeEnabled()

    await page.locator(teachingStartSelector).click()
    await expect(page.locator(teachingEditorPanelSelector)).toBeVisible({ timeout: 45_000 })
  })

  test("PRM-03 attachment preview/remove and submit sends attachment part", async ({
    page,
    createNotebook,
    gotoChat,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await gotoChat()
    await openNotebookFromEntry(page, notebook)

    await attachPromptFile(page, {
      name: "attachment.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("buddy-e2e-attachment"),
    })
    await expect(page.locator(promptAttachmentItemSelector)).toHaveCount(1)

    await removeFirstPromptAttachment(page)
    await expect(page.locator(promptAttachmentItemSelector)).toHaveCount(0)

    await attachPromptFile(page, {
      name: "attachment.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("buddy-e2e-attachment"),
    })
    await sendPrompt(page, "please read attached file")

    let sessionID = ""
    await expect
      .poll(async () => {
        const sessions = await e2e.listSessions(notebook)
        sessionID = sessions[0]?.id ?? ""
        return sessionID.length > 0
      })
      .toBe(true)

    await expect
      .poll(async () => {
        const messages = await e2e.listSessionMessages(notebook, sessionID)
        return messages.flatMap((message) => message.parts.map((part) => part.type)).join(",")
      })
      .toContain("file")
  })
})
