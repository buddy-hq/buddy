import path from "node:path"
import { test, expect } from "../fixtures"
import {
  BUILTIN_LOCAL_COMMANDS,
  archiveFirstThread,
  createThreadFromSidebar,
  findDirectoryGroup,
  openNotebookFromEntry,
  openRightSidebarIfClosed,
  renameFirstThread,
  selectComboboxItem,
  sendPrompt,
  waitForPromptSubmissionCount,
} from "../actions"
import {
  directoryChatShellSelector,
  leftSidebarDirectoryGroupSelector,
  leftSidebarDirectoryToggleSelector,
  leftSidebarThreadSelectSelector,
  mermaidCloseFullscreenSelector,
  mermaidFitSelector,
  mermaidFullscreenDiagramSelector,
  mermaidOpenFullscreenSelector,
  mermaidZoomInSelector,
  promptAutocompleteSelector,
  promptEditorSelector,
  promptSubmitSelector,
  promptIntentLearnSelector,
  promptPersonaSelectSelector,
  selectContentSelector,
  selectItemSelector,
  rightSidebarShellSelector,
  rightSidebarTabCapabilitiesSelector,
  rightSidebarTabCurriculumSelector,
  rightSidebarTabDiagramsSelector,
  rightSidebarTabEditorSelector,
  rightSidebarTabResourcesSelector,
  settingsMcpItemSelector,
  settingsMcpPanelSelector,
  settingsNotebookFullTextSelector,
  settingsNotebookIntentSelector,
  settingsNotebookPersonaSelector,
  settingsModelModelSelector,
  settingsModelProviderSelector,
  settingsProvidersItemSelector,
  settingsRouteSelector,
  teachingEditorActiveFileSelector,
  teachingEditorPanelSelector,
  teachingEditorSaveStatusSelector,
  workspaceMermaidItemSelector,
  workspaceMermaidPanelSelector,
} from "../selectors"
import {
  disconnectSync,
  readPromptProbe,
  reconnectSync,
  setDesktopPlatformOverrides,
  waitForSyncStatus,
  waitForDriver,
  waitForPromptPopover,
} from "../probes"

function basename(directory: string) {
  return path.basename(directory)
}

async function reorderDirectoryBefore(
  page: import("@playwright/test").Page,
  sourceLabel: string,
  targetLabel: string,
) {
  const source = page
    .locator(leftSidebarDirectoryToggleSelector)
    .filter({ hasText: sourceLabel })
    .first()
  const target = page
    .locator(leftSidebarDirectoryToggleSelector)
    .filter({ hasText: targetLabel })
    .first()

  await expect(source).toBeVisible()
  await expect(target).toBeVisible()

  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) {
    throw new Error("Cannot reorder directories without bounding boxes")
  }

  await source.hover()
  await page.mouse.down()
  await page.mouse.move(sourceBox.x + 10, sourceBox.y + sourceBox.height + 20)
  await page.mouse.move(targetBox.x + 10, targetBox.y + 4)
  await page.mouse.up()
}

async function selectFirstVisibleSelectItem(page: import("@playwright/test").Page) {
  const content = page.locator(`${selectContentSelector}:visible`).last()
  await expect(content).toBeVisible()
  const option = content.locator(selectItemSelector).first()
  await expect(option).toBeVisible()
  const text = (await option.innerText()).trim()
  await option.click()
  return text
}

const E2E_BACKEND_COMMAND = "e2e-backend-command"

test.describe("core-web", () => {
  test("ENT-05 /skills redirects to /settings?tab=skills and keeps notebook bootstrap", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await e2e.setOpenProjects([notebook])

    await page.goto("/skills")
    await expect(page).toHaveURL(/\/settings\?tab=skills/)
    await expect(page.locator(settingsRouteSelector)).toBeVisible()

    const openProjects = await e2e.listOpenProjects()
    expect(openProjects.directories).toContain(notebook)

    await page.getByRole("button", { name: "Back to chat" }).click()
    await expect(page.locator(directoryChatShellSelector)).toBeVisible()
  })

  test("NB-02 closing notebook removes it from sidebar and persists after reload", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const first = await createNotebook({ name: "nb-close-one" })
    const second = await createNotebook({ name: "nb-close-two" })
    await e2e.setOpenProjects([first, second])

    await page.goto("/chat")
    await closeDirectoryFromSidebar(page, basename(first))
    await expect
      .poll(async () => {
        const openProjects = await e2e.listOpenProjects()
        return openProjects.directories
      })
      .toEqual([second])
    await expect(
      page.locator(leftSidebarDirectoryGroupSelector).filter({ hasText: basename(first) }),
    ).toHaveCount(0)

    await page.reload()
    await expect(
      page.locator(leftSidebarDirectoryGroupSelector).filter({ hasText: basename(first) }),
    ).toHaveCount(0)
    const openProjects = await e2e.listOpenProjects()
    expect(openProjects.directories).toEqual([second])
  })

  test("NB-03 drag-reordering notebooks persists backend order across reload", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const first = await createNotebook({ name: "nb-reorder-one" })
    const second = await createNotebook({ name: "nb-reorder-two" })
    await e2e.setOpenProjects([first, second])

    await page.goto("/chat")
    await reorderDirectoryBefore(page, basename(second), basename(first))

    await expect
      .poll(async () => {
        const openProjects = await e2e.listOpenProjects()
        return openProjects.directories
      })
      .toEqual([second, first])

    await page.reload()
    const firstGroup = page.locator(leftSidebarDirectoryGroupSelector).first()
    await expect(firstGroup).toContainText(basename(second))
  })

  test("NB-04 creating a thread from sidebar only creates draft in selected notebook", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const first = await createNotebook({ name: "nb-draft-one" })
    const second = await createNotebook({ name: "nb-draft-two" })
    await e2e.seedSession({ directory: first, title: "First existing" })
    await e2e.seedSession({ directory: second, title: "Second existing" })
    await e2e.setOpenProjects([first, second])

    const firstCount = (await e2e.listSessions(first)).length
    const secondCount = (await e2e.listSessions(second)).length

    await page.goto("/chat")
    await createThreadFromSidebar(page, basename(second))

    await expect(page.locator(directoryChatShellSelector)).toBeVisible()
    expect((await e2e.listSessions(first)).length).toBe(firstCount)
    expect((await e2e.listSessions(second)).length).toBe(secondCount)
  })

  test("NB-05 selecting, renaming, and archiving a thread persists after reload", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "nb-thread-lifecycle" })
    await e2e.seedSession({ directory: notebook, title: "Initial thread title" })
    await e2e.setOpenProjects([notebook])

    await page.goto("/chat")
    await renameFirstThread(page, basename(notebook), "Renamed thread title")
    await expect(page.locator(leftSidebarDirectoryGroupSelector)).toContainText(
      "Renamed thread title",
    )

    await archiveFirstThread(page, basename(notebook))
    await expect(page.locator(leftSidebarDirectoryGroupSelector)).not.toContainText(
      "Renamed thread title",
    )

    await page.reload()
    await expect(page.locator(leftSidebarDirectoryGroupSelector)).not.toContainText(
      "Renamed thread title",
    )
  })

  test("NB-06 switching notebooks restores per-notebook draft isolation", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const first = await createNotebook({ name: "nb-switch-one" })
    const second = await createNotebook({ name: "nb-switch-two" })
    await e2e.seedSession({ directory: first, title: "Thread one" })
    await e2e.seedSession({ directory: second, title: "Thread two" })
    await e2e.setOpenProjects([first, second])

    await page.goto("/chat")
    await page.locator(promptEditorSelector).fill("draft for first notebook")

    const secondThread = page
      .locator(leftSidebarThreadSelectSelector)
      .filter({ hasText: "Thread two" })
      .first()
    await secondThread.click()
    await page.locator(promptEditorSelector).fill("draft for second notebook")

    const firstThread = page
      .locator(leftSidebarThreadSelectSelector)
      .filter({ hasText: "Thread one" })
      .first()
    await firstThread.click()

    await expect(page.locator(promptEditorSelector)).toContainText("draft for first notebook")
  })

  test("PRM-02 prompt history restores prior prompts and unsent draft", async ({
    page,
    createNotebook,
    gotoChat,
  }) => {
    const notebook = await createNotebook()
    await gotoChat()
    await openNotebookFromEntry(page, notebook)

    await sendPrompt(page, "first history prompt")
    await page.locator(promptEditorSelector).fill("unsent working draft")
    await page.locator(promptEditorSelector).press("Home")
    await page.locator(promptEditorSelector).press("ArrowUp")
    await expect(page.locator(promptEditorSelector)).toContainText("first history prompt")

    await page.locator(promptEditorSelector).press("ArrowDown")
    await expect(page.locator(promptEditorSelector)).toContainText("unsent working draft")
  })

  test("PRM-04 @ file search inserts workspace file reference part", async ({
    page,
    createNotebook,
    gotoChat,
  }) => {
    const notebook = await createNotebook({
      files: {
        "src/mention-target.ts": "export const mentionTarget = true\n",
      },
    })

    await gotoChat()
    await openNotebookFromEntry(page, notebook)
    await page.locator(promptEditorSelector).click()
    await page.locator(promptEditorSelector).fill("@mention-target")

    await expect(page.locator(promptAutocompleteSelector)).toBeVisible()
    await expect(page.locator('[data-component="prompt-mention-option"]')).toContainText(
      "src/mention-target.ts",
    )
    await page.locator(promptEditorSelector).press("Enter")
    await expect(page.locator(promptEditorSelector)).toContainText("@src/mention-target.ts")
  })

  test("PRM-05 local slash commands route local UI/mutation paths", async ({
    page,
    createNotebook,
    createNotebookFile,
    gotoChat,
  }) => {
    const notebook = await createNotebook({ name: "nb-local-slash" })
    const resourceFile = await createNotebookFile(
      notebook,
      "docs/resource.md",
      "# Resource file\n\ncontent",
    )

    await gotoChat()
    await openNotebookFromEntry(page, notebook)

    await sendPrompt(page, "/resources")
    await expect(page.locator(rightSidebarShellSelector)).toHaveAttribute("data-open", "true")
    await expect(page.locator(rightSidebarTabResourcesSelector)).toBeVisible()

    await sendPrompt(page, "/new")
    await expect(page.locator(promptEditorSelector)).toHaveText("")

    await sendPrompt(page, "/mcp")
    await expect(page).toHaveURL(/\/settings\?tab=mcps/)
    await expect(page.locator(settingsMcpPanelSelector)).toBeVisible()

    await page.goto("/chat")
    await sendPrompt(page, `/resource add ${resourceFile} as local-doc`)
    await openRightSidebarIfClosed(page)
    await expect(page.locator('[data-component="resources-item"]')).toContainText("local-doc")
  })

  test("PRM-06 backend slash command dispatches once and restores draft on failure", async ({
    page,
    createNotebook,
    gotoChat,
    e2e,
  }) => {
    const notebook = await createNotebook()
    await gotoChat()
    await openNotebookFromEntry(page, notebook)

    await page.locator(promptEditorSelector).click()
    await page.locator(promptEditorSelector).fill("/")
    await waitForPromptPopover(page, "slash")

    const prompt = await readPromptProbe(page)
    const backendCommand =
      (prompt?.slash.ids ?? []).find((id) => !BUILTIN_LOCAL_COMMANDS.has(id)) ?? E2E_BACKEND_COMMAND

    const attempted = `/${backendCommand} force failure`
    await e2e.setFaults({ failNextCommandMessage: "Injected command failure" })
    await page.locator(promptEditorSelector).fill(attempted)
    await page.locator(promptEditorSelector).press("Enter")

    await expect
      .poll(async () => {
        const state = await e2e.getState()
        return state.runtime.counters.commandCalls
      })
      .toBe(1)

    await expect(page.locator(promptEditorSelector)).toContainText(attempted)
  })

  test("SES-03 switching threads does not bleed transcript content", async ({
    page,
    createNotebook,
    e2e,
    gotoDirectoryChat,
  }) => {
    const notebook = await createNotebook({ name: "nb-transcript-switch" })
    await e2e.seedSession({
      directory: notebook,
      title: "Thread A",
      turnCount: 1,
    })
    await e2e.seedSession({
      directory: notebook,
      title: "Thread B",
      turnCount: 3,
    })

    await gotoDirectoryChat(notebook)

    await page
      .locator(leftSidebarThreadSelectSelector)
      .filter({ hasText: "Thread B" })
      .first()
      .click()
    await expect(page.getByText("Seeded assistant message 3")).toBeVisible()

    await page
      .locator(leftSidebarThreadSelectSelector)
      .filter({ hasText: "Thread A" })
      .first()
      .click()
    await expect(page.getByText("Seeded assistant message 3")).toHaveCount(0)
  })

  test("SES-04 abort during stream leaves thread usable and avoids duplicate assistant content", async ({
    page,
    createNotebook,
    gotoChat,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "nb-abort-stream" })
    await gotoChat()
    await openNotebookFromEntry(page, notebook)
    await waitForSyncStatus(page, "connected")

    await sendPrompt(page, "first prompt to abort")
    await expect
      .poll(async () => {
        const state = await e2e.getState()
        return state.runtime.counters.promptCalls
      })
      .toBe(1)

    try {
      await expect
        .poll(async () => {
          const label = await page.locator(promptSubmitSelector).getAttribute("aria-label")
          return (label ?? "").toLowerCase().includes("stop")
        })
        .toBe(true)
      await page.locator(promptSubmitSelector).click()
    } catch {
      // If the model response finishes before the abort click, continue with usability check.
    }

    await sendPrompt(page, "second prompt after abort")
    await expect
      .poll(async () => {
        const state = await e2e.getState()
        return state.runtime.counters.promptCalls
      })
      .toBe(2)

    await disconnectSync(page)
    await waitForSyncStatus(page, "error")
    await reconnectSync(page)
    await waitForSyncStatus(page, "connected")

    await expect(page.getByText("second prompt after abort")).toHaveCount(1)
  })

  test("CFG-02 notebook settings autosave through config APIs", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "nb-settings-autosave" })
    await e2e.setProviders({ openAIConnected: true })
    await e2e.patchProjectConfig(notebook, { model: null })
    await e2e.setOpenProjects([notebook])

    await page.goto("/settings?tab=notebook")
    await expect(page.locator(settingsRouteSelector)).toBeVisible()

    await selectComboboxItem(page, settingsNotebookPersonaSelector, "Code Buddy")
    await selectComboboxItem(page, settingsNotebookIntentSelector, "Learn")
    await page.locator(settingsNotebookFullTextSelector).click()

    await expect
      .poll(async () => {
        const config = await e2e.readProjectConfig(notebook)
        return {
          persona: config.default_persona,
          intent: config.default_intent,
          fullText: (config.tools as Record<string, unknown> | undefined)
            ?.pedagogy_resource_ingest_full_text,
        }
      })
      .toEqual({
        persona: "code-buddy",
        intent: "learn",
        fullText: false,
      })

    await page.goto("/settings?tab=model")
    const providerTrigger = page.locator(settingsModelProviderSelector)
    const currentProvider = ((await providerTrigger.innerText()).trim() || "").toLowerCase()
    await providerTrigger.click()
    const providerContent = page.locator(`${selectContentSelector}:visible`).last()
    const providerOptions = providerContent.locator(selectItemSelector)
    await expect(providerOptions.first()).toBeVisible()
    const providerCount = await providerOptions.count()
    let providerSelected = false
    for (let index = 0; index < providerCount; index += 1) {
      const option = providerOptions.nth(index)
      const label = ((await option.innerText()).trim() || "").toLowerCase()
      if (!label || label === currentProvider) continue
      await option.click()
      providerSelected = true
      break
    }
    if (!providerSelected) {
      await providerOptions.first().click()
    }

    await page.locator(settingsModelModelSelector).click()
    const selectedModelLabel = await selectFirstVisibleSelectItem(page)
    expect(selectedModelLabel.length).toBeGreaterThan(0)

    await expect
      .poll(async () => {
        const config = await e2e.readProjectConfig(notebook)
        return {
          persona: config.default_persona,
          intent: config.default_intent,
          modelSet: typeof config.model === "string" && config.model.includes("/"),
          fullText: (config.tools as Record<string, unknown> | undefined)
            ?.pedagogy_resource_ingest_full_text,
        }
      })
      .toEqual({
        persona: "code-buddy",
        intent: "learn",
        modelSet: true,
        fullText: false,
      })
  })

  test("CFG-03 providers tab renders provider state without live OAuth", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "nb-providers" })
    await e2e.setOpenProjects([notebook])

    await page.goto("/settings?tab=providers")
    await expect(page.locator(settingsProvidersItemSelector).first()).toBeVisible()
  })

  test("CFG-04 MCP tab reflects seeded status and /mcp opens same surface", async ({
    page,
    createNotebook,
    e2e,
    gotoChat,
  }) => {
    const notebook = await createNotebook({ name: "nb-mcp" })
    await e2e.putMcpConfig(notebook, "local-e2e", {
      type: "local",
      command: ["echo", "hello"],
      enabled: true,
    })
    await e2e.setOpenProjects([notebook])

    await page.goto("/settings?tab=mcps")
    await expect(page.locator(settingsMcpPanelSelector)).toBeVisible()
    const mcpItem = page.locator(settingsMcpItemSelector).filter({ hasText: "local-e2e" }).first()
    await expect(mcpItem).toBeVisible()

    const mcpToggle = mcpItem.locator('[data-action="mcp-toggle"]')
    await mcpToggle.click()
    await expect.poll(async () => mcpItem.getAttribute("data-mcp-status")).toBe("connected")
    await mcpToggle.click()
    await expect.poll(async () => mcpItem.getAttribute("data-mcp-status")).not.toBe("connected")

    await gotoChat()
    await openNotebookFromEntry(page, notebook)
    await sendPrompt(page, "/mcp")
    await expect(page).toHaveURL(/\/settings\?tab=mcps/)
  })

  test("CFG-05 desktop boundary mode checks updater without installing", async ({
    page,
    createNotebook,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "nb-updater" })
    await e2e.setOpenProjects([notebook])

    await page.goto("/chat")
    await waitForDriver(page)
    await setDesktopPlatformOverrides(page, {
      mode: "desktop",
      os: "macos",
      checkUpdateResult: { status: "ready", version: "9.9.9" },
      failUpdate: true,
    })

    await page.goto("/settings?tab=appearance")
    await page.locator('[data-action="settings-check-updates"]').click()

    await expect
      .poll(async () => {
        const driver = await page.evaluate(() => window.__BUDDY_E2E__)
        return driver?.platform?.calls?.checkUpdate ?? 0
      })
      .toBeGreaterThan(0)
  })

  test("TCH-01 persona/intent selections affect outgoing submission metadata", async ({
    page,
    createNotebook,
    gotoChat,
  }) => {
    const notebook = await createNotebook({ name: "nb-teaching-intent" })
    await gotoChat()
    await openNotebookFromEntry(page, notebook)

    await page.locator(promptIntentLearnSelector).click()

    await selectComboboxItem(page, promptPersonaSelectSelector, "Code Buddy")

    await sendPrompt(page, "/resources")
    await waitForPromptSubmissionCount(page, 1)

    const prompt = await readPromptProbe(page)
    expect(prompt?.lastSubmission?.intent).toBe("learn")
    expect(prompt?.lastSubmission?.persona).toBe("code-buddy")
  })

  test("TCH-03 reload in interactive mode restores teaching workspace panel", async ({
    page,
    createNotebook,
    e2e,
    gotoDirectoryChat,
  }) => {
    const notebook = await createNotebook({
      name: "nb-teaching-reload",
      files: {
        "src/lesson.ts": "export const lesson = 1\n",
      },
    })
    await e2e.seedTeachingWorkspace({
      directory: notebook,
      relativePath: "src/lesson.ts",
      code: "export const lesson = 2\n",
      teaching: {
        persona: "code-buddy",
        intent: "practice",
      },
    })

    await gotoDirectoryChat(notebook)
    await sendPrompt(page, "/resources")
    await page.locator(rightSidebarTabEditorSelector).click()
    await expect(page.locator(teachingEditorPanelSelector)).toBeVisible()
    await expect(page.locator(teachingEditorActiveFileSelector)).toHaveAttribute(
      "data-relative-path",
      "src/lesson.ts",
    )
    await expect(page.locator(teachingEditorSaveStatusSelector)).toHaveAttribute(
      "data-state",
      "saved",
    )

    await page.reload()
    await sendPrompt(page, "/resources")
    await page.locator(rightSidebarTabEditorSelector).click()
    await expect(page.locator(teachingEditorPanelSelector)).toBeVisible()
    await expect(page.locator(teachingEditorActiveFileSelector)).toHaveAttribute(
      "data-relative-path",
      "src/lesson.ts",
    )
    await expect(page.locator(teachingEditorSaveStatusSelector)).toHaveAttribute(
      "data-state",
      "saved",
    )
  })

  test("TCH-04 snapshot and capabilities tabs render runtime data", async ({
    page,
    createNotebook,
    e2e,
    gotoDirectoryChat,
  }) => {
    const notebook = await createNotebook({ name: "nb-teaching-runtime" })
    await e2e.seedTeachingWorkspace({
      directory: notebook,
      teaching: {
        persona: "buddy",
        intent: "learn",
      },
    })

    await gotoDirectoryChat(notebook)
    await sendPrompt(page, "/resources")

    await page.locator(rightSidebarTabCurriculumSelector).click()
    await expect(page.getByText("Learning Snapshot", { exact: true })).toBeVisible()

    await page.locator(rightSidebarTabCapabilitiesSelector).click()
    await expect(page.getByText("Runtime Capabilities", { exact: true })).toBeVisible()
  })

  test("RES-01 resource add/rename/rebuild/remove updates resources list", async ({
    page,
    createNotebook,
    createNotebookFile,
    gotoDirectoryChat,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "nb-resources-crud" })
    const sourceFile = await createNotebookFile(notebook, "docs/file.md", "# Resource")

    await e2e.addResource(notebook, {
      sourcePath: sourceFile,
      alias: "crud-resource",
    })
    await gotoDirectoryChat(notebook)
    await openRightSidebarIfClosed(page)
    await page.locator(rightSidebarTabResourcesSelector).click()

    const item = page.locator('[data-component="resources-item"]').first()
    await expect(item).toContainText("crud-resource")

    page.on("dialog", (dialog) => dialog.accept("renamed-resource"))
    await item.locator('[data-action="resources-item-menu"]').click()
    await page.locator('[data-action="resources-rename"]').click()
    await expect(item).toContainText("renamed-resource")

    await item.locator('[data-action="resources-item-menu"]').click()
    await page.locator('[data-action="resources-rebuild"]').click()
    await expect(item).toContainText("renamed-resource")

    await item.locator('[data-action="resources-item-menu"]').click()
    await page.locator('[data-action="resources-remove"]').click()
    await page.locator('[data-action="resources-remove-confirm"]').click()
    await expect(page.locator('[data-component="resources-item"]')).toHaveCount(0)
  })

  test("RES-02 preparing resources auto-refresh to ready", async ({
    page,
    createNotebook,
    createNotebookFile,
    gotoDirectoryChat,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "nb-resources-ready" })
    const sourceFile = await createNotebookFile(notebook, "docs/ready.md", "# Ready")

    await e2e.addResource(notebook, {
      sourcePath: sourceFile,
      alias: "ready-resource",
    })
    await gotoDirectoryChat(notebook)
    await openRightSidebarIfClosed(page)
    await page.locator(rightSidebarTabResourcesSelector).click()

    await expect
      .poll(async () => {
        const list = await e2e.listResources(notebook)
        return list.resources.find((resource) => resource.alias === "ready-resource")?.status
      })
      .toBe("ready")
  })

  test("RES-03 diagrams tab renders seeded mermaid artifacts", async ({
    page,
    createNotebook,
    gotoDirectoryChat,
    e2e,
  }) => {
    const notebook = await createNotebook({ name: "nb-mermaid" })
    await e2e.seedMermaid({
      directory: notebook,
      artifacts: [
        {
          source: "flowchart TD\nA[Start] --> B[End]",
          alt: "Simple flowchart",
          caption: "Flow",
        },
      ],
    })

    await gotoDirectoryChat(notebook)
    await openRightSidebarIfClosed(page)
    await page.locator(rightSidebarTabDiagramsSelector).click()
    await expect(page.locator(workspaceMermaidPanelSelector)).toBeVisible()
    await expect(page.locator(workspaceMermaidItemSelector)).toHaveCount(1)

    const mermaidItem = page.locator(workspaceMermaidItemSelector).first()
    await mermaidItem.hover()
    await mermaidItem.locator(mermaidOpenFullscreenSelector).click()
    await expect(page.locator(mermaidFullscreenDiagramSelector)).toBeVisible()
    await page.locator(mermaidZoomInSelector).click()
    await page.locator(mermaidFitSelector).click()
    await page.locator(mermaidCloseFullscreenSelector).click()
    await expect(page.locator(mermaidFullscreenDiagramSelector)).toHaveCount(0)
  })
})

async function closeDirectoryFromSidebar(
  page: import("@playwright/test").Page,
  directoryLabel: string,
) {
  const group = await findDirectoryGroup(page, directoryLabel)
  await group.hover()
  await group.locator('[data-action="left-sidebar-directory-menu"]').first().click({ force: true })
  const menu = page
    .getByRole("menu")
    .filter({ has: page.locator('[data-action="left-sidebar-directory-close"]') })
  await expect(menu).toBeVisible()
  await menu.locator('[data-action="left-sidebar-directory-close"]').first().click()
}
