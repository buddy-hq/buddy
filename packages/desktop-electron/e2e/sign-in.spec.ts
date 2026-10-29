import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { expect, test } from "./fixtures/app"
import { createOAuthMcpServer } from "./fixtures/oauth-mcp-server"

test("MCP sign-in brands the callback and registration as Buddy and restores its window", async ({ buddy }) => {
  const server = await createOAuthMcpServer()
  try {
    const { page, notebook, electron } = buddy
    await buddy.stubOpenDirectory(notebook.directory)
    await page.getByRole("button", { name: "New notebook", exact: true }).click()
    await page.getByRole("button", { name: "Open existing folder", exact: true }).click()
    const directoryToken = Buffer.from(notebook.directory).toString("base64url")
    await page.waitForURL((url) => url.hash.startsWith(`#/${directoryToken}/chat`))
    await expect(page.getByRole("textbox", { name: "Ask Buddy", exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Settings", exact: true }).click()
    await page.getByRole("button", { name: "MCPs", exact: true }).click()
    await page.getByRole("button", { name: "Add MCP", exact: true }).click()
    const editor = page.getByRole("dialog", { name: "Add extension", exact: true })
    const name = "sign-in-fixture"
    await editor.getByRole("textbox", { name: "Name", exact: true }).fill(name)
    await editor.getByRole("tab", { name: "Remote", exact: true }).click()
    await editor.getByRole("textbox", { name: "Remote URL", exact: true }).fill(server.url)
    await editor.getByRole("button", { name: "Add MCP", exact: true }).click()
    await expect(editor).toHaveCount(0)

    const row = page.locator("div.border-t").filter({ has: page.getByText(name, { exact: true }) })
    const browserLog = path.join(buddy.root, "browser-urls.txt")
    await fs.writeFile(browserLog, "")
    await row.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect.poll(async () => (await fs.readFile(browserLog, "utf8")).trim(), {
      message: "The harness must capture the MCP authorization URL without opening a browser",
    }).not.toBe("")
    const captured = z.array(z.string().url()).length(1).parse((await fs.readFile(browserLog, "utf8")).trim().split("\n"))
    const authorizationURL = new URL(captured[0])
    expect(authorizationURL.origin).toBe(server.origin)
    expect(authorizationURL.pathname).toBe("/authorize")

    expect(server.registrations).toEqual(expect.arrayContaining([expect.objectContaining({
      client_name: "Buddy",
      client_uri: "https://hibuddy.in",
      logo_uri: expect.stringMatching(/^https:\/\/.+/u),
    })]))

    const window = await electron.browserWindow(page)
    await window.evaluate((window) => window.minimize())
    await expect.poll(() => window.evaluate((window) => window.isMinimized())).toBe(true)

    const authorization = await fetch(authorizationURL, { redirect: "manual" })
    expect(authorization.status).toBe(302)
    const callbackURL = new URL(z.string().url().parse(authorization.headers.get("location")))
    expect(callbackURL.protocol).toBe("http:")
    expect(callbackURL.hostname).toBe("127.0.0.1")
    const callback = await fetch(callbackURL, { redirect: "error" })
    expect(callback.status).toBe(200)
    const html = await callback.text()
    const document = await page.evaluate((html) => {
      const parsed = new DOMParser().parseFromString(html, "text/html")
      for (const element of parsed.querySelectorAll("script, style, [hidden]")) element.remove()
      return { title: parsed.title, text: parsed.body.textContent ?? "" }
    }, html)
    expect(document.title).toMatch(/· Buddy$/u)
    expect(document.text).toContain("Buddy is now connected")
    expect(document.text).not.toMatch(/opencode/iu)

    await expect(row.getByText("Connected", { exact: true })).toBeVisible()
    await expect.poll(() => window.evaluate((window) => ({ minimized: window.isMinimized(), visible: window.isVisible() }))).toEqual({ minimized: false, visible: true })
  } finally {
    await server.close()
  }
})
