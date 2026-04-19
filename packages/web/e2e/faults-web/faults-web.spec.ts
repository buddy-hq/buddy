import { test, expect } from "../fixtures"
import {
  openNotebookFromEntry,
  openRightSidebarIfClosed,
  sendPrompt,
  waitForPromptSubmissionCount,
} from "../actions"
import {
  leftSidebarDirectoryGroupSelector,
  promptEditorSelector,
  rightSidebarShellSelector,
} from "../selectors"
import { disconnectSync, reconnectSync, waitForSyncStatus } from "../probes"

test.describe("faults-web", () => {
  test("SES-05 forced SSE disconnect/reconnect resyncs without duplicate parts", async ({
    page,
    createNotebook,
    gotoChat,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "fault-disconnect" })
    await e2e.seedSession({
      directory: notebook,
      turnCount: 4,
      title: "Disconnect test",
    })

    await gotoChat()
    await openNotebookFromEntry(page, notebook)
    await waitForSyncStatus(page, "connected")

    await disconnectSync(page)
    await waitForSyncStatus(page, "error")
    await reconnectSync(page)
    await waitForSyncStatus(page, "connected")

    await expect(page.getByText("Seeded user message 1")).toHaveCount(1)
  })

  test("SES-06 polluted local storage cannot invent notebook membership", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "fault-storage-real" })
    await e2e.setOpenProjects([notebook])

    await page.addInitScript(() => {
      localStorage.setItem(
        "buddy.chat.v4",
        JSON.stringify({
          state: {
            activeDirectory: "/tmp/fake-notebook",
            lastSessionByDirectory: {
              "/tmp/fake-notebook": "ses_fake",
            },
            activeReadingResourceByDirectory: {
              "/tmp/fake-notebook": {
                name: "Fake chapter",
                path: "/tmp/fake-notebook/README.md",
              },
            },
            linkedSessionByResource: {
              "/tmp/fake-notebook::resource_fake": "ses_fake",
            },
          },
          version: 0,
        }),
      )
    })

    await page.goto("/chat")
    await expect(page.locator(leftSidebarDirectoryGroupSelector)).toContainText(
      "fault-storage-real",
    )
    await expect(page.locator(leftSidebarDirectoryGroupSelector)).not.toContainText("fake-notebook")
  })

  test("SES-07 long seeded transcript remains usable with virtualization", async ({
    page,
    createNotebook,
    gotoChat,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "fault-long-transcript" })
    await e2e.seedSession({
      directory: notebook,
      turnCount: 180,
      longAssistantChars: 5000,
      title: "Long transcript",
    })

    await gotoChat()
    await openNotebookFromEntry(page, notebook)
    await expect(page.getByText("Seeded assistant message 180")).toBeVisible()

    await sendPrompt(page, "/resources")
    await waitForPromptSubmissionCount(page, 1)
    await expect(page.locator(promptEditorSelector)).toHaveText("")
  })

  test("SES-08 session error and instance disposal show error then recover", async ({
    page,
    createNotebook,
    gotoChat,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "fault-restart" })

    await gotoChat()
    await openNotebookFromEntry(page, notebook)
    await waitForSyncStatus(page, "connected")

    await e2e.emitSessionError({
      directory: notebook,
      message: "Injected E2E session error",
    })

    await expect(page.getByText("Injected E2E session error")).toBeVisible()

    await e2e.emitInstanceDisposed({ directory: notebook })
    await reconnectSync(page)
    await waitForSyncStatus(page, "connected")

    await expect(page.getByText("Injected E2E session error")).toHaveCount(0)
    await openRightSidebarIfClosed(page)
    await expect(page.locator(rightSidebarShellSelector)).toHaveAttribute("data-open", "true")
  })
})
