import { expect, type Locator, type Page } from "@playwright/test"
import {
  chatEntryPageSelector,
  directoryChatShellSelector,
  entryDirectoryInputSelector,
  entryOpenDirectoryPickerSelector,
  entryOpenDirectorySubmitSelector,
  leftSidebarArchiveConfirmSelector,
  leftSidebarDirectoryCloseSelector,
  leftSidebarDirectoryGroupSelector,
  leftSidebarDirectoryMenuSelector,
  leftSidebarDirectoryNewThreadSelector,
  leftSidebarRenameInputSelector,
  leftSidebarRenameSaveSelector,
  leftSidebarThreadMenuSelector,
  leftSidebarThreadRenameSelector,
  onboardingPickFolderSelector,
  onboardingSelectFreeModelsSelector,
  promptAttachmentItemSelector,
  promptAttachmentRemoveSelector,
  promptAttachmentsSelector,
  promptEditorSelector,
  promptFileInputSelector,
  promptSubmitSelector,
  rightSidebarShellSelector,
  selectContentSelector,
  selectItemSelector,
} from "./selectors"
import { readPromptProbe, setDesktopPlatformOverrides } from "./probes"

export const BUILTIN_LOCAL_COMMANDS = new Set([
  "new",
  "persona",
  "model",
  "mcp",
  "resource",
  "resources",
])

export async function openNotebookFromEntry(
  page: Page,
  directory: string,
  input?: {
    desktopMode?: boolean
    os?: "macos" | "windows" | "linux"
  },
) {
  if (
    await page
      .locator(directoryChatShellSelector)
      .isVisible()
      .catch(() => false)
  ) {
    return
  }

  await expect(page.locator(chatEntryPageSelector)).toBeVisible()

  if (input?.desktopMode) {
    await setDesktopPlatformOverrides(page, {
      mode: "desktop",
      os: input.os ?? "macos",
      directoryPickerResults: [directory],
    })
    await page.locator(entryOpenDirectoryPickerSelector).click()
  } else {
    const directoryInput = page.locator(entryDirectoryInputSelector)
    const submitButton = page.locator(entryOpenDirectorySubmitSelector)

    await directoryInput.fill(directory)
    try {
      await directoryInput.press("Enter")
    } catch {
      await expect(submitButton).toBeVisible()
      await submitButton.click()
    }
  }

  await expect(page.locator(directoryChatShellSelector)).toBeVisible()
}

export async function completeOnboardingWithFreeModels(page: Page, directory: string) {
  await setDesktopPlatformOverrides(page, {
    mode: "desktop",
    os: "macos",
    directoryPickerResults: [directory],
  })
  await page.locator(onboardingSelectFreeModelsSelector).click()
  await page.locator(onboardingPickFolderSelector).click()
  await expect(page.locator(directoryChatShellSelector)).toBeVisible()
}

export async function promptEditor(page: Page) {
  const editor = page.locator(promptEditorSelector)
  await expect(editor).toBeVisible()
  return editor
}

export async function typePrompt(page: Page, text: string) {
  const editor = await promptEditor(page)
  await editor.click()
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.press("Backspace")
  if (text.length > 0) {
    await page.keyboard.type(text)
  }
}

export async function submitPrompt(page: Page) {
  await page.locator(promptSubmitSelector).click()
}

export async function sendPrompt(page: Page, text: string) {
  await typePrompt(page, text)
  await submitPrompt(page)
}

export async function sendPromptWithEnter(page: Page, text: string) {
  const editor = await promptEditor(page)
  await editor.click()
  await editor.fill(text)
  await editor.press("Enter")
}

export async function waitForPromptSubmissionCount(page: Page, count: number) {
  await expect
    .poll(async () => {
      const prompt = await readPromptProbe(page)
      return prompt?.submissions ?? 0
    })
    .toBe(count)
}

export async function waitForPromptLastSubmissionKind(page: Page, kind: "prompt" | "command") {
  await expect
    .poll(async () => {
      const prompt = await readPromptProbe(page)
      return prompt?.lastSubmission?.kind
    })
    .toBe(kind)
}

export async function findDirectoryGroup(page: Page, directoryLabel: string) {
  const groups = page.locator(leftSidebarDirectoryGroupSelector)
  const group = groups.filter({
    has: page.getByText(directoryLabel, { exact: false }),
  })
  await expect(group.first()).toBeVisible()
  return group.first()
}

export async function closeDirectoryFromSidebar(page: Page, directoryLabel: string) {
  const group = await findDirectoryGroup(page, directoryLabel)
  await group.hover()
  await group.locator(leftSidebarDirectoryMenuSelector).first().click({ force: true })
  const menu = page
    .getByRole("menu")
    .filter({ has: page.locator(leftSidebarDirectoryCloseSelector) })
  await expect(menu).toBeVisible()
  await menu.locator(leftSidebarDirectoryCloseSelector).first().click()
}

export async function createThreadFromSidebar(page: Page, directoryLabel: string) {
  const group = await findDirectoryGroup(page, directoryLabel)
  await group.hover()
  await group.locator(leftSidebarDirectoryNewThreadSelector).first().click({ force: true })
}

export async function renameFirstThread(page: Page, directoryLabel: string, title: string) {
  const group = await findDirectoryGroup(page, directoryLabel)
  await group.hover()
  await group.locator(leftSidebarThreadMenuSelector).first().click({ force: true })
  await page.locator(leftSidebarThreadRenameSelector).first().click()
  await page.locator(leftSidebarRenameInputSelector).fill(title)
  await page.locator(leftSidebarRenameSaveSelector).click()
}

export async function archiveFirstThread(page: Page, directoryLabel: string) {
  const group = await findDirectoryGroup(page, directoryLabel)
  await group.hover()
  await group.locator(leftSidebarThreadMenuSelector).first().click({ force: true })
  await page.getByRole("menuitem").filter({ hasText: "Archive" }).first().click()
  await page.locator(leftSidebarArchiveConfirmSelector).click()
}

export async function selectComboboxItem(page: Page, trigger: string | Locator, itemText: string) {
  if (typeof trigger === "string") {
    await page.locator(trigger).click()
  } else {
    await trigger.click()
  }

  const content = page.locator(`${selectContentSelector}:visible`).last()
  await expect(content).toBeVisible()
  const option = content.locator(selectItemSelector).filter({ hasText: itemText }).first()
  await option.scrollIntoViewIfNeeded()
  try {
    await option.click()
  } catch {
    await option.click({ force: true })
  }
}

export async function openRightSidebarIfClosed(page: Page) {
  const shell = page.locator(rightSidebarShellSelector)
  await expect(shell).toHaveCount(1)
  const open = await shell.getAttribute("data-open")
  if (open === "true") return

  await sendPrompt(page, "/resources")
  await expect(shell).toHaveAttribute("data-open", "true")
}

export async function typeMultilinePrompt(page: Page, firstLine: string, secondLine: string) {
  const editor = await promptEditor(page)
  await editor.click()
  await page.keyboard.type(firstLine)
  await page.keyboard.press("Shift+Enter")
  await page.keyboard.type(secondLine)
}

export async function attachPromptFile(
  page: Page,
  input: { name: string; mimeType: string; buffer: Buffer },
) {
  await page.locator(promptFileInputSelector).setInputFiles({
    name: input.name,
    mimeType: input.mimeType,
    buffer: input.buffer,
  })
  await expect(page.locator(promptAttachmentsSelector)).toBeVisible()
  await expect(page.locator(promptAttachmentItemSelector)).toContainText(input.name)
}

export async function removeFirstPromptAttachment(page: Page) {
  const remove = page.locator(promptAttachmentRemoveSelector).first()
  await expect(remove).toBeVisible()
  await remove.click()
}
