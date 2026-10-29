import path from "node:path"
import { expect, test } from "./fixtures/app"
import { uiPrompt } from "./fixtures/model-server"
import { addReferenceFixture, createNotebook } from "./fixtures/notebook"

test("U5 keeps a reference-chip draft across a chat switch and restart, then sends the reference", async ({ buddy }) => {
  const { model } = buddy
  const notebook = await createNotebook(path.dirname(buddy.notebook.directory), model.baseURL, "U5 draft notebook")
  const reference = await addReferenceFixture(notebook.directory)
  const directoryToken = Buffer.from(notebook.directory).toString("base64url")
  let page = buddy.page
  const composer = () => page.getByRole("textbox", { name: "Ask Buddy", exact: true })
  const answer = (text: string) => page.locator('[data-timeline-row="AssistantPart"]').getByText(text, { exact: true })

  async function sendReply(text: string) {
    await expect(composer()).toBeEditable()
    await composer().fill(uiPrompt({ kind: "reply", text }))
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await model.waitForRequest((request) => request.instruction?.kind === "reply" && request.instruction.text === text)
    await expect(answer(text)).toBeVisible()
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
  }

  await buddy.stubOpenDirectory(notebook.directory)
  await page.getByRole("button", { name: "New notebook", exact: true }).click()
  await page.getByRole("button", { name: "Open existing folder", exact: true }).click()
  await page.waitForURL((url) => url.hash.startsWith(`#/${directoryToken}/chat`))
  await sendReply("U5 draft chat is ready.")
  const draftURL = page.url()
  const selected = page.locator('[data-action="left-sidebar-thread-select"][data-active="true"]').first()
  await expect(selected).toHaveAttribute("data-session-id", /\S+/u)
  const sessionID = await selected.getAttribute("data-session-id")
  if (!sessionID) throw new Error("The draft chat has no sidebar session identity")
  const draftChat = () => page.locator(`[data-action="left-sidebar-thread-select"][data-session-id=${JSON.stringify(sessionID)}]`).first()
  const reply = "U5 sent the persisted reference draft."
  const prompt = uiPrompt({ kind: "reply", text: reply })
  const draftText = `${prompt} Please use `

  async function expectDraft() {
    await expect(composer()).toBeEditable()
    await expect(composer()).toHaveText(`${draftText}@${reference.name} `)
    const chip = composer().locator('[data-type="reference"][contenteditable="false"]')
    await expect(chip).toHaveCount(1)
    await expect(chip).toHaveText(`@${reference.name}`)
    await expect(chip).toHaveAttribute("data-name", reference.name)
    await expect(chip).toHaveAttribute("data-path", reference.path)
  }

  await composer().fill(draftText)
  await composer().press("End")
  await composer().pressSequentially(`@${reference.name}`)
  await page.getByRole("option").filter({ has: page.getByText(`@${reference.name}`, { exact: true }) }).click()
  await expectDraft()

  await page.locator('[data-action="left-sidebar-new-chat"]').click()
  await expect(draftChat()).not.toHaveAttribute("data-active", "true")
  await expect(composer()).toBeEmpty()
  await sendReply("U5 other chat is ready.")
  await draftChat().click()
  await expect(draftChat()).toHaveAttribute("data-active", "true")
  await expectDraft()

  await buddy.restart()
  page = buddy.page
  const notebookToggle = page.locator(`[data-action="left-sidebar-directory-toggle"][data-directory=${JSON.stringify(notebook.directory)}]`)
  await expect(notebookToggle).toBeVisible()
  if (await notebookToggle.getAttribute("aria-expanded") === "false") await notebookToggle.click()
  await draftChat().click()
  await expect(page).toHaveURL(draftURL)
  await expect(draftChat()).toHaveAttribute("data-active", "true")
  await expectDraft()

  const submitted = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith(`/session/${sessionID}/prompt_async`))
  await page.getByRole("button", { name: "Send", exact: true }).click()
  expect((await submitted).postDataJSON()).toMatchObject({ parts: expect.arrayContaining([expect.objectContaining({ type: "reference", name: reference.name, path: reference.path })]) })
  const received = await model.waitForRequest((request) => request.instruction?.kind === "reply" && request.instruction.text === reply)
  expect(received.text).toContain(reference.filename)
  expect(received.text).toContain(path.basename(reference.path))
  await expect(answer(reply)).toHaveCount(1)
  await expect(answer(reply)).toBeVisible()
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
  const userRow = page.locator('[data-timeline-row="UserMessage"]').filter({ hasText: prompt })
  await expect(userRow).toHaveCount(1)
  await expect(userRow.getByText(reference.name, { exact: true })).toHaveCount(1)
  await expect(userRow.getByText(reference.name, { exact: true })).toBeVisible()
  await expect(composer()).toBeEmpty()
})
