import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "./fixtures/app"
import { uiPrompt } from "./fixtures/model-server"
import { createNotebook } from "./fixtures/notebook"

test.describe.configure({ mode: "serial" })

test("U7 reports a moved notebook, keeps the working chat usable, and closes it after restart", async ({ buddy }) => {
  const { model } = buddy
  const missing = await createNotebook(path.dirname(buddy.notebook.directory), model.baseURL, "U7 missing notebook")
  const missingName = path.basename(missing.directory)
  const workingDirectory = buddy.notebook.directory
  const workingToken = Buffer.from(workingDirectory).toString("base64url")
  const noticeTitle = `Couldn't find the "${missingName}" folder`
  const workingReply = "U7 working chat is ready."
  const continuedReply = "U7 working chat still replies after the missing chat was selected."
  let page = buddy.page

  const notebookGroup = (directory: string) => page.locator(`[data-component="left-sidebar-directory-group"][data-directory=${JSON.stringify(directory)}]`)
  const missingGroup = () => notebookGroup(missing.directory)
  const workingGroup = () => notebookGroup(workingDirectory)
  const missingHeader = () => missingGroup().getByRole("button", { name: missingName, exact: true })
  const noticeText = () => page.getByText(noticeTitle, { exact: true })
  const notice = () => page.getByRole("listitem").filter({ has: noticeText() })
  const answer = (text: string) => page.locator('[data-timeline-row="AssistantPart"]').getByText(text, { exact: true })

  async function openNotebook(directory: string) {
    await buddy.stubOpenDirectory(directory)
    await page.getByRole("button", { name: "New notebook", exact: true }).click()
    await page.getByRole("button", { name: "Open existing folder", exact: true }).click()
    const token = Buffer.from(directory).toString("base64url")
    await page.waitForURL((url) => url.hash.startsWith(`#/${token}/chat`))
    await expect(page.getByRole("textbox", { name: "Ask Buddy", exact: true })).toBeVisible()
  }

  async function sendReply(text: string) {
    const composer = page.getByRole("textbox", { name: "Ask Buddy", exact: true })
    await expect(composer).toBeEditable()
    await composer.fill(uiPrompt({ kind: "reply", text }))
    const send = page.getByRole("button", { name: "Send", exact: true })
    await expect(send).toBeEnabled()
    await send.click()
    await model.waitForRequest((request) => request.instruction?.kind === "reply" && request.instruction.text === text)
    await expect(answer(text)).toHaveCount(1)
    await expect(answer(text)).toBeVisible()
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
  }

  async function expectMissingNotice() {
    await expect(noticeText()).toHaveCount(1)
    await expect(noticeText()).toBeVisible()
    await expect(notice().getByText(`${missing.directory} was moved or deleted. Move the folder back to keep using this notebook, or close it.`, { exact: true })).toBeVisible()
    await expect(notice().getByRole("button", { name: "Close notebook", exact: true })).toBeVisible()
    await expect(fs.lstat(missing.directory)).rejects.toMatchObject({ code: "ENOENT" })
  }

  async function startMissingChat() {
    await missingHeader().hover()
    await missingGroup().getByRole("button", { name: `Start new chat in ${missingName}`, exact: true }).click()
    const token = Buffer.from(missing.directory).toString("base64url")
    await page.waitForURL((url) => url.hash.startsWith(`#/${token}/chat`))
    await expectMissingNotice()
    await expect(missingGroup()).toHaveAttribute("data-current", "true")
    await expect(missingGroup().locator('[data-action="left-sidebar-thread-select"][data-active="true"]')).toHaveCount(0)
  }

  await test.step("Open a fresh notebook through the picker and make another notebook's chat current", async () => {
    await openNotebook(missing.directory)
    await sendReply("U7 chat belongs to the notebook that will move.")
    await expect(missingGroup().locator('[data-action="left-sidebar-thread-select"]')).toHaveCount(1)
    await openNotebook(workingDirectory)
    await sendReply(workingReply)
  })

  const workingRow = workingGroup().locator('[data-action="left-sidebar-thread-select"][data-active="true"]')
  await expect(workingRow).toHaveCount(1)
  const workingSessionID = await workingRow.getAttribute("data-session-id")
  if (!workingSessionID) throw new Error("The working chat has no sidebar session identity")
  const selectedWorkingRow = () => workingGroup().locator(`[data-action="left-sidebar-thread-select"][data-session-id=${JSON.stringify(workingSessionID)}]`)
  const workingURL = page.url()

  await test.step("Move the folder and choose its cached chat without losing the current chat", async () => {
    await fs.rename(missing.directory, `${missing.directory} moved`)
    await missingGroup().locator('[data-action="left-sidebar-thread-select"]').click()
    await expectMissingNotice()
    await expect(page).toHaveURL(workingURL)
    await expect(selectedWorkingRow()).toHaveAttribute("data-active", "true")
    await expect(missingGroup().locator('[data-action="left-sidebar-thread-select"]')).toHaveAttribute("data-active", "false")
    await expect(answer(workingReply)).toBeVisible()
    await sendReply(continuedReply)
    await expect(fs.lstat(missing.directory)).rejects.toMatchObject({ code: "ENOENT" })
  })

  await test.step("The notebook header only toggles the list and does not report the missing folder", async () => {
    await expect(noticeText()).toHaveCount(0)
    await expect(missingHeader()).toHaveAttribute("aria-expanded", "true")
    await missingHeader().click()
    await expect(missingHeader()).toHaveAttribute("aria-expanded", "false")
    await expect(noticeText()).toHaveCount(0)
    await missingHeader().click()
    await expect(missingHeader()).toHaveAttribute("aria-expanded", "true")
    await expect(noticeText()).toHaveCount(0)
    await expect(page).toHaveURL(workingURL)
    await expect(selectedWorkingRow()).toHaveAttribute("data-active", "true")
  })

  await test.step("New chat reports the missing folder once, including when its draft is already open", async () => {
    await startMissingChat()
    await expect(noticeText()).toHaveCount(0)
    await startMissingChat()
    await selectedWorkingRow().click()
    await page.waitForURL((url) => url.hash.startsWith(`#/${workingToken}/chat`))
    await expect(selectedWorkingRow()).toHaveAttribute("data-active", "true")
    await expect(answer(continuedReply)).toBeVisible()
  })

  await test.step("Restart with the folder missing, show its warning, and re-check it on expansion", async () => {
    await buddy.restart()
    page = buddy.page
    await page.waitForURL((url) => url.hash.startsWith(`#/${workingToken}/chat`))
    await expect(selectedWorkingRow()).toHaveAttribute("data-active", "true")
    await expect(answer(continuedReply)).toBeVisible()
    await expect(missingGroup().locator('[data-action="left-sidebar-thread-select"]')).toHaveCount(0)
    const folderMissing = missingGroup().getByRole("button", { name: "Folder not found", exact: true })
    await expect(folderMissing).toBeVisible()
    await expect(missingGroup().getByText("No chats", { exact: true })).toHaveCount(0)
    await expect(noticeText()).toHaveCount(0)
    await expect(fs.lstat(missing.directory)).rejects.toMatchObject({ code: "ENOENT" })
    await folderMissing.click()
    await expectMissingNotice()
    await expect(noticeText()).toHaveCount(0)
    await missingHeader().click()
    await expect(missingHeader()).toHaveAttribute("aria-expanded", "false")
    await expect(noticeText()).toHaveCount(0)
    await missingHeader().click()
    await expect(missingHeader()).toHaveAttribute("aria-expanded", "true")
    await expect(folderMissing).toBeVisible()
    await expectMissingNotice()
    await expect(selectedWorkingRow()).toHaveAttribute("data-active", "true")
    await expect(noticeText()).toHaveCount(0)
    await startMissingChat()
  })

  await test.step("Close the missing notebook from its notice and continue the working chat", async () => {
    await selectedWorkingRow().click()
    await notice().hover()
    await page.waitForURL((url) => url.hash.startsWith(`#/${workingToken}/chat`))
    await expect(selectedWorkingRow()).toHaveAttribute("data-active", "true")
    const beforeClose = page.url()
    await notice().getByRole("button", { name: "Close notebook", exact: true }).click()
    await expect(missingGroup()).toHaveCount(0)
    await expect(page).toHaveURL(beforeClose)
    await expect(selectedWorkingRow()).toHaveAttribute("data-active", "true")
    await expect(answer(continuedReply)).toBeVisible()
    await sendReply("U7 working chat still replies after the missing notebook was closed.")
    await expect(fs.lstat(missing.directory)).rejects.toMatchObject({ code: "ENOENT" })
  })
})
