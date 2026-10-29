import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "./fixtures/app"
import { uiPrompt } from "./fixtures/model-server"
import { createNotebook } from "./fixtures/notebook"

for (const decision of ["Deny", "Allow once"] as const) {
  test(`U4 ${decision} controls an outside-notebook write and shows its outcome`, async ({ buddy }) => {
    const { page, model } = buddy
    const notebook = await createNotebook(path.dirname(buddy.notebook.directory), model.baseURL, `U4 ${decision} notebook`)
    const target = path.join(buddy.root, `U4 ${decision}.txt`)
    const contents = `U4 ${decision} scripted file contents.`
    await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
    await buddy.stubOpenDirectory(notebook.directory)
    await page.getByRole("button", { name: "New notebook", exact: true }).click()
    await page.getByRole("button", { name: "Open existing folder", exact: true }).click()
    const directoryToken = Buffer.from(notebook.directory).toString("base64url")
    await page.waitForURL((url) => url.hash.startsWith(`#/${directoryToken}/chat`))
    const composer = page.getByRole("textbox", { name: "Ask Buddy", exact: true })
    await expect(composer).toBeEditable()
    const prompt = uiPrompt({ kind: "tool", name: "write", arguments: { path: target, content: contents } })
    await composer.fill(prompt)
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await model.waitForRequest((request) => request.text.includes(prompt) && request.instruction?.kind === "tool")
    const dock = page.getByRole("alert").filter({ has: page.getByRole("button", { name: decision, exact: true }) })
    await expect(dock.getByText("Permission needed: Access external folder", { exact: true })).toBeVisible()
    await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
    await dock.getByRole("button", { name: decision, exact: true }).click()
    await expect(dock).toHaveCount(0)

    const activity = page.locator("[data-activity-row]")
    await expect(activity).toHaveCount(1)
    if (decision === "Deny") {
      await expect(page.locator('[data-timeline-row="TurnDivider"]').getByText("Stopped", { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
      const header = activity.getByRole("button", { name: "Permission denied", exact: true, expanded: false })
      await expect(header).toBeVisible()
      await expect(activity.locator("[data-activity-entry]")).toHaveCount(0)
      await expect(page.getByRole("alert")).toHaveCount(0)
      await header.click()
      const entry = activity.locator('[data-activity-entry="tool"]')
      await expect(entry).toHaveCount(1)
      await expect(entry.getByRole("button", { name: "Permission denied", exact: true })).toBeVisible()
      await expect(page.getByRole("alert")).toHaveCount(0)
      await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
    } else {
      await model.waitForRequest((request) => request.text.includes(prompt) && request.tools.length > 0)
      await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
      await expect(activity.getByRole("button", { name: "Created", exact: true, expanded: false })).toBeVisible()
      await activity.getByRole("button", { name: "Created", exact: true, expanded: false }).click()
      const entry = activity.locator('[data-activity-entry="tool"]')
      await expect(entry).toHaveCount(1)
      await expect(entry).toContainText("Created")
      await expect(entry).toContainText(path.basename(target))
      expect(await fs.readFile(target, "utf8")).toBe(contents)
    }
    await expect(composer).toBeEditable()
  })
}
