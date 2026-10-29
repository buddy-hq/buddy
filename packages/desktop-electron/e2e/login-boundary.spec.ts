import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import { createServer } from "node:http"
import path from "node:path"
import { crc32 } from "node:zlib"
import type { Page } from "@playwright/test"
import z from "zod"
import { expect, test as appTest } from "./fixtures/app"
import { uiPrompt } from "./fixtures/model-server"
import { createNotebook } from "./fixtures/notebook"

const imageName = "login-boundary.gif"
const pdfName = "login-boundary.pdf"
const widgetTitle = "Login boundary widget"
const widgetSelector = `iframe[title="${widgetTitle}"][src*="/api/frame/widget/"]`
const imageBytes = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

function smallPdf() {
  const content = "BT /F1 12 Tf 20 60 Td (Login boundary PDF) Tj ET\n"
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`
  return `${pdf}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
}

function smallEpub(chapter: string) {
  const files = [
    ["mimetype", "application/epub+zip"],
    ["META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ["EPUB/package.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">login-boundary-epub</dc:identifier><dc:title>Login boundary book</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-10-27T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" properties="scripted"/></manifest><spine><itemref idref="chapter"/></spine></package>'],
    ["EPUB/nav.xhtml", '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>'],
    ["EPUB/chapter.xhtml", chapter],
  ] as const
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [filename, content] of files) {
    const name = Buffer.from(filename)
    const data = Buffer.from(content)
    const checksum = crc32(data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt32LE(checksum, 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(name.length, 26)
    local.push(header, name, data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt32LE(checksum, 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)
    offset += header.length + name.length + data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}

function xmlAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
}

const test = appTest.extend<{ boundary: Awaited<ReturnType<typeof createNotebook>> }>({
  boundary: async ({ buddy }, use) => {
    const notebook = await createNotebook(path.dirname(buddy.notebook.directory), buddy.model.baseURL, `Login boundary ${randomUUID()}`)
    const widget = path.join(notebook.directory, "boundary-widget")
    await fs.mkdir(widget)
    await Promise.all([
      fs.writeFile(path.join(notebook.directory, imageName), imageBytes),
      fs.writeFile(path.join(notebook.directory, pdfName), smallPdf()),
      fs.writeFile(path.join(widget, "index.html"), '<!doctype html><title>Login boundary widget</title><output id="script-loaded">pending</output><output id="own-status">pending</output><output id="api-status">pending</output><script src="./probe.js"></script>'),
      fs.writeFile(path.join(widget, "own.txt"), "Widget folder file loaded."),
      fs.writeFile(path.join(widget, "probe.js"), `
document.querySelector("#script-loaded").textContent = "Widget script loaded.";
async function check(url, id) {
  try {
    const response = await fetch(url);
    document.querySelector(id).textContent = String(response.status);
  } catch (error) {
    document.querySelector(id).textContent = String(error);
  }
}
void check("./own.txt", "#own-status");
void check("/api/objects", "#api-status");
`),
    ])
    const chat = new URL(buddy.page.url())
    chat.hash = "/chat"
    await buddy.page.goto(chat.href)
    await buddy.stubOpenDirectory(notebook.directory)
    await buddy.page.getByRole("button", { name: "New notebook", exact: true }).click()
    await buddy.page.getByRole("button", { name: "Open existing folder", exact: true }).click()
    const token = Buffer.from(notebook.directory).toString("base64url")
    await buddy.page.waitForURL((url) => url.hash.startsWith(`#/${token}/chat`))
    await expect(buddy.page.getByRole("textbox", { name: "Ask Buddy", exact: true })).toBeEditable()
    await use(notebook)
  },
})

test.describe.configure({ mode: "serial" })
test.use({ launchEnvironment: { BUDDY_E2E_LOGIN_BOUNDARY: "1" } })

test.afterEach(async ({ buddy }, testInfo) => {
  const diagnostics = await fs.readFile(path.join(buddy.root, "login-boundary.jsonl"), "utf8")
  await testInfo.attach("electron-login-boundary", { body: diagnostics, contentType: "application/x-ndjson" })
  if (testInfo.status !== testInfo.expectedStatus) console.log(`Electron login boundary diagnostics:\n${diagnostics}`)
})

async function presentWidget(page: Page, directory: string) {
  const prompt = uiPrompt({
    kind: "tool",
    name: "present_html_widget",
    arguments: { action: "present_path", path: path.join(directory, "boundary-widget"), entryPath: "index.html", title: widgetTitle, viewportPreset: "standard_16_10" },
  })
  await page.getByRole("textbox", { name: "Ask Buddy", exact: true }).fill(prompt)
  await page.getByRole("button", { name: "Send", exact: true }).click()
  return prompt
}

test("app media keeps the backend login", async ({ buddy, boundary }) => {
  const { page } = buddy
  const prompt = uiPrompt({ kind: "tool", name: "bench_present", arguments: { action: "present_file", path: imageName } })
  await page.getByRole("textbox", { name: "Ask Buddy", exact: true }).fill(prompt)
  const received = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().resourceType() === "image" && url.pathname === `/api/file/raw/${imageName}` && url.searchParams.get("directory") === boundary.directory
  })
  await page.getByRole("button", { name: "Send", exact: true }).click()
  const response = await received
  expect(response.status(), "The authenticated backend must accept the app image request").toBe(200)
  expect(await response.body()).toEqual(imageBytes)
  const image = page.locator('[data-component="bench-media-image"] img')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement ? element.naturalWidth : 0)).toBeGreaterThan(0)
  const withoutLogin = await fetch(response.url())
  expect(withoutLogin.status, "The same backend URL must require the login").toBe(401)
  console.log(`App image backend response: ${response.status()}; without login: ${withoutLogin.status}`)
})

test("a widget renders with files from its own folder", async ({ buddy, boundary }) => {
  const prompt = await presentWidget(buddy.page, boundary.directory)
  await buddy.model.waitForRequest((request) => request.text.includes(prompt) && request.tools.length > 0)
  const iframe = buddy.page.locator(widgetSelector).first()
  await expect(iframe).toHaveAttribute("src", /\/api\/frame\/widget\//u)
  const frame = buddy.page.frameLocator(widgetSelector).first()
  await expect(frame.locator("#script-loaded")).toHaveText("Widget script loaded.")
  expect(await frame.locator("body").evaluate((body) => body.ownerDocument.location.pathname)).toMatch(/^\/api\/frame\/widget\//u)
  await expect(frame.locator("#own-status")).toHaveText("200")
})

test("a request inside a widget frame is refused by the authenticated backend", async ({ buddy, boundary }) => {
  const refused = buddy.page.waitForResponse((response) => new URL(response.url()).pathname === "/api/objects" && response.request().frame().parentFrame() !== null)
  await presentWidget(buddy.page, boundary.directory)
  const frame = buddy.page.frameLocator(widgetSelector).first()
  await expect(frame.locator("#script-loaded")).toHaveText("Widget script loaded.")
  await expect(frame.locator("#own-status")).toHaveText("200")
  await expect(frame.locator("#api-status")).toHaveText("401")
  const response = await refused
  expect(response.status()).toBe(401)
  console.log(`Widget backend response: ${response.status()}; own folder response: 200`)
})

test("a Bench PDF opens from an app-fetched blob", async ({ buddy, boundary }) => {
  const { page, model } = buddy
  const prompt = uiPrompt({ kind: "tool", name: "present_media", arguments: { items: [{ path: path.join(boundary.directory, pdfName) }] } })
  await page.getByRole("textbox", { name: "Ask Buddy", exact: true }).fill(prompt)
  await page.getByRole("button", { name: "Send", exact: true }).click()
  const result = await model.waitForRequest((request) => request.text.includes(prompt) && request.tools.length > 0)
  const objectID = /object_id=([a-zA-Z0-9]{26})/u.exec(JSON.stringify(result.tools))?.[1]
  expect(objectID, "present_media must return the persisted PDF object identity").toBeDefined()
  if (!objectID) throw new Error("The PDF presentation did not return an object identity")
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
  const open = uiPrompt({ kind: "tool", name: "bench_present", arguments: { action: "present_object", objectID } })
  await page.getByRole("textbox", { name: "Ask Buddy", exact: true }).fill(open)
  await page.getByRole("button", { name: "Send", exact: true }).click()
  const iframe = page.locator(`iframe[title="${pdfName}"]`)
  await expect(iframe).toBeVisible()
  await expect(iframe).toHaveAttribute("src", /^blob:/u)
  await expect(page.getByText(/Buddy couldn't preview this PDF|File could not be loaded|Preview URL is unavailable/u)).toHaveCount(0)
})

test("an in-app browser popup gets no backend login", async ({ buddy, boundary }) => {
  const { page, electron } = buddy
  const backend = await page.evaluate(async () => (await window.api.awaitInitialization(() => undefined)).url)
  const image = new URL(`/api/file/raw/${imageName}`, backend)
  image.searchParams.set("directory", boundary.directory)
  image.searchParams.set("popup", randomUUID())
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" })
    response.end(request.url === "/popup"
      ? `<!doctype html><title>Local sign-in popup</title><img crossorigin="anonymous" src="${image.href}">`
      : '<!doctype html><title>Local browser page</title><a href="/popup" target="oauthPopup">Open sign-in popup</a>')
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve() })
  })
  let popup: Page | undefined
  try {
    const address = z.object({ port: z.number() }).parse(server.address())
    const localURL = `http://127.0.0.1:${address.port}/`
    const prompt = uiPrompt({ kind: "tool", name: "inapp_browser_open", arguments: { url: localURL } })
    await page.getByRole("textbox", { name: "Ask Buddy", exact: true }).fill(prompt)
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await expect.poll(() => electron.evaluate(({ webContents }, url) =>
      webContents.getAllWebContents().some((contents) => contents.getType() === "webview" && contents.getURL() === url && !contents.isLoading()), localURL),
    ).toBe(true)

    const opened = electron.waitForEvent("window")
    const received = electron.context().waitForEvent("response", { predicate: (response) => response.url() === image.href })
    await electron.evaluate(async ({ webContents }, url) => {
      const guest = webContents.getAllWebContents().find((contents) => contents.getType() === "webview" && contents.getURL() === url)
      if (!guest) throw new Error("The local page is missing from the in-app browser")
      await guest.executeJavaScript('document.querySelector("a").click()', true)
    }, localURL)
    popup = await opened
    await popup.waitForURL(`http://127.0.0.1:${address.port}/popup`)
    const response = await received
    expect(response.status(), "The popup must be refused by the authenticated backend").toBe(401)
    const headers = await response.request().allHeaders()
    expect(Object.keys(headers).some((header) => header.toLowerCase() === "authorization")).toBe(false)
    const window = await electron.browserWindow(popup)
    expect(await window.evaluate((window) => window.webContents.getType())).toBe("window")
    console.log(`In-app browser popup backend response: ${response.status()}; Authorization header: absent`)
  } finally {
    await popup?.close()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test("EPUB chapter scripts cannot reach the app page or its backend login", async ({ buddy, boundary }) => {
  const { page } = buddy
  const backend = await page.evaluate(async () => (await window.api.awaitInitialization(() => undefined)).url)
  const probeID = randomUUID()
  const probe = (vector: string) => {
    const url = new URL("/api/objects", backend)
    url.searchParams.set("epubProbe", probeID)
    url.searchParams.set("vector", vector)
    return `(() => {
  const append = (doc, stage, value) => {
    const output = doc.createElement("output");
    output.setAttribute("data-epub-boundary-probe", ${JSON.stringify(probeID)});
    output.setAttribute("data-vector", ${JSON.stringify(vector)});
    output.setAttribute("data-stage", stage);
    output.textContent = String(value);
    doc.documentElement.appendChild(output);
  };
  const record = (stage, value) => {
    append(document, stage, value);
    try { append(parent.document, stage, value); }
    catch (error) { append(document, "parent-error", String(error)); }
  };
  record("execution", "ran");
  try {
    parent.window.api.awaitInitialization(() => undefined).then(
      result => record("initialization", result ? "received" : "empty"),
      error => record("initialization-error", String(error))
    );
  } catch (error) { record("initialization-error", String(error)); }
  void fetch(${JSON.stringify(url.href)}).then(
    response => record("backend-status", response.status),
    error => record("backend-error", String(error))
  );
})()`
  }
  const chapterText = "The login boundary chapter is readable."
  const chapter = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Login boundary chapter</title><script><![CDATA[${probe("inline")}]]></script></head><body onload="${xmlAttribute(probe("onload"))}"><h1>${chapterText}</h1><p>A book can show its text while its authored code stays inactive.</p><a id="epub-script-link" href="${xmlAttribute(`javascript:${probe("link")}`)}">Try the chapter link</a></body></html>`
  const filename = "login-boundary.epub"
  await fs.writeFile(path.join(boundary.directory, filename), smallEpub(chapter))
  const loaded = page.waitForEvent("framenavigated", { predicate: (frame) => frame.parentFrame() === page.mainFrame() && frame.url().startsWith("blob:") })
  const prompt = uiPrompt({ kind: "tool", name: "bench_present", arguments: { action: "present_file", path: filename } })
  await page.getByRole("textbox", { name: "Ask Buddy", exact: true }).fill(prompt)
  await page.getByRole("button", { name: "Send", exact: true }).click()
  const frame = await loaded
  await frame.waitForLoadState("load")
  await expect(page.locator('[data-component="foliate-reader"]')).toBeVisible()
  await expect(frame.getByRole("heading", { name: chapterText, exact: true })).toBeVisible()
  const marker = `[data-epub-boundary-probe="${probeID}"]`
  await expect(page.locator(marker), "No chapter probe may mark or record results in the app document").toHaveCount(0)
  await expect(frame.locator(marker), "Inline script and onload must record no execution or capability results").toHaveCount(0)
  await frame.locator("#epub-script-link").click()
  await expect(frame.getByRole("heading", { name: chapterText, exact: true })).toBeVisible()
  await expect(page.locator(marker), "The chapter link must not mark or record results in the app document").toHaveCount(0)
  await expect(frame.locator(marker), "The chapter link must record no execution or capability results").toHaveCount(0)
  const diagnostics = z.array(z.object({ url: z.string(), hasAuthorization: z.boolean(), isMainFrame: z.boolean(), resourceType: z.string() })).parse(
    (await fs.readFile(path.join(buddy.root, "login-boundary.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line)),
  )
  const requests = diagnostics.filter((entry) => new URL(entry.url).searchParams.get("epubProbe") === probeID)
  expect(requests.filter((entry) => entry.hasAuthorization), "No backend request initiated by chapter code may carry the app login").toEqual([])
  console.log(`EPUB chapter rendered; parent markers: 0; capability results: 0; probe backend requests: ${requests.length}; authenticated probe requests: 0`)
})

test("an unregistered window in the default session gets no backend login", async ({ buddy, boundary }) => {
  const backend = await buddy.page.evaluate(async () => (await window.api.awaitInitialization(() => undefined)).url)
  const url = new URL(`/api/file/raw/${imageName}`, backend)
  url.searchParams.set("path", imageName)
  url.searchParams.set("directory", boundary.directory)
  url.searchParams.set("unregisteredWindowProbe", randomUUID())
  const result = z.object({ usesDefaultSession: z.boolean(), webContentsType: z.string(), status: z.number().int() }).parse(
    await buddy.electron.evaluate(async ({ BrowserWindow, session }, requestURL) => {
      const window = new BrowserWindow({
        show: false,
        webPreferences: { session: session.defaultSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
      })
      try {
        await window.loadURL("data:text/html,<!doctype html><title>Unregistered default-session window</title>")
        return {
          usesDefaultSession: window.webContents.session === session.defaultSession,
          webContentsType: window.webContents.getType(),
          status: await window.webContents.executeJavaScript(`fetch(${JSON.stringify(requestURL)}, { credentials: "omit" }).then(response => response.status)`),
        }
      } finally {
        window.destroy()
      }
    }, url.href),
  )
  const diagnostics = z.array(z.object({
    url: z.string(),
    webContentsType: z.string().nullable(),
    hasFrame: z.boolean(),
    isMainFrame: z.boolean(),
    resourceType: z.string(),
    hasAuthorization: z.boolean(),
  })).parse((await fs.readFile(path.join(buddy.root, "login-boundary.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line)))
  const requests = diagnostics.filter((entry) => entry.url === url.href)
  console.log(`Unregistered default-session window: ${JSON.stringify({ ...result, requests })}`)
  expect({ ...result, requests }).toEqual({
    usesDefaultSession: true,
    webContentsType: "window",
    status: 401,
    requests: [{ url: url.href, webContentsType: "window", hasFrame: true, isMainFrame: true, resourceType: "xhr", hasAuthorization: false }],
  })
})
