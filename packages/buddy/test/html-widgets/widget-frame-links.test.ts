import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { BUDDY_ENV } from "../../src/storage"
import { INERT_DOCUMENT_CSP } from "../../src/http/inert-document-headers"
import { classifyRouteError } from "../../src/http/route-errors"
import { HTML_WIDGET_RUNTIME_CSP } from "../../src/learning/features/html-widgets/service/types"
import { presentHtmlWidgetObject } from "../../src/learning/features/html-widgets/service/store"
import {
  createWidgetFramePassSigner,
  widgetFramePassSigner,
} from "../../src/learning/features/html-widgets/service/widget-frame-pass"
import { tmpdir } from "../helpers/tmpdir"

const authorization = `Basic ${btoa("widget-test:widget-secret")}`
const document = '<!doctype html><script src="./app.js"></script><p>Widget</p>'
const script = "document.body.dataset.ready = 'true'"
const linkSchema = z.object({ url: z.string() })
const requestLogs: string[] = []
const requestLogger = spyOn(console, "log").mockImplementation((...values) => {
  requestLogs.push(values.map(String).join(" "))
})
afterAll(() => requestLogger.mockRestore())
const { app } = await import("../../src/index")

async function createWidget(directory: string, name: string) {
  const root = path.join(directory, name)
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(path.join(root, "index.html"), document)
  await fs.writeFile(path.join(root, "app.js"), script)
  await fs.writeFile(path.join(root, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await fs.writeFile(path.join(root, "data.xml"), "<data/>")
  await fs.writeFile(
    path.join(root, "page.xhtml"),
    '<html xmlns="http://www.w3.org/1999/xhtml"/>',
  )
  await fs.writeFile(path.join(root, "feed.atom"), "<feed/>")
  await fs.writeFile(path.join(root, `${name}.txt`), name)
  return presentHtmlWidgetObject({
    action: "present_path",
    directory,
    path: name,
    entryPath: "index.html",
    title: name,
    viewportPreset: "standard_16_10",
    origin: {
      kind: "tool",
      sessionID: "ses_frame",
      messageID: "msg_frame",
      callID: "call_frame",
    },
  })
}

async function createWidgetWithFiles(
  directory: string,
  name: string,
  files: ReadonlyArray<readonly [string, string | Uint8Array]>,
) {
  const root = path.join(directory, name)
  for (const [relativePath, contents] of files) {
    await fs.mkdir(path.dirname(path.join(root, relativePath)), { recursive: true })
    await fs.writeFile(path.join(root, relativePath), contents)
  }
  return presentHtmlWidgetObject({
    action: "present_path",
    directory,
    path: name,
    entryPath: "index.html",
    title: name,
    viewportPreset: "standard_16_10",
    origin: {
      kind: "tool",
      sessionID: "ses_frame",
      messageID: "msg_frame",
      callID: "call_frame",
    },
  })
}

function exchange(runtimeUrl: string, authenticated = true) {
  return app.request("/api/frame/widget-links", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { authorization } : undefined),
    },
    body: JSON.stringify({ runtimeUrl }),
  })
}

function framePass(directory: string, widget: Awaited<ReturnType<typeof createWidget>>) {
  return widgetFramePassSigner.mint({
    directory,
    objectID: widget.manifest.objectID,
    versionToken: widget.inlineData.sourceVersion ?? "live",
  })
}

describe("signed widget frame links", () => {
  let previousUsername: string | undefined
  let previousPassword: string | undefined

  beforeEach(() => {
    previousUsername = process.env[BUDDY_ENV.SERVER_USERNAME]
    previousPassword = process.env[BUDDY_ENV.SERVER_PASSWORD]
    process.env[BUDDY_ENV.SERVER_USERNAME] = "widget-test"
    process.env[BUDDY_ENV.SERVER_PASSWORD] = "widget-secret"
  })

  afterEach(() => {
    if (previousUsername === undefined) delete process.env[BUDDY_ENV.SERVER_USERNAME]
    else process.env[BUDDY_ENV.SERVER_USERNAME] = previousUsername
    if (previousPassword === undefined) delete process.env[BUDDY_ENV.SERVER_PASSWORD]
    else process.env[BUDDY_ENV.SERVER_PASSWORD] = previousPassword
  })

  test("serves the minted document, relative files and HEAD without a login, and keeps the saved runtime route", async () => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const pass = framePass(project.path, widget)
    const url = `/api/frame/widget/${pass}/index.html`
    expect(widgetFramePassSigner.verify(pass)).toEqual({
      directory: project.path,
      objectID: widget.manifest.objectID,
      versionToken: widget.inlineData.sourceVersion ?? "live",
    })
    for (const headers of [undefined, { authorization }]) {
      const response = await app.request(url, { headers })
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(document)
      expect(response.headers.get("content-security-policy")).toBe(HTML_WIDGET_RUNTIME_CSP)
      expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable")
      expect(response.headers.get("referrer-policy")).toBe("no-referrer")
      expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    }
    const asset = await app.request(`/api/frame/widget/${pass}/app.js`)
    expect(asset.status).toBe(200)
    expect(await asset.text()).toBe(script)
    expect(asset.headers.get("content-type")).toContain("javascript")
    const head = await app.request(url, { method: "HEAD" })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe("")
    expect(head.headers.get("referrer-policy")).toBe("no-referrer")
    const saved = await app.request(widget.inlineData.runtimeUrl, { headers: { authorization } })
    expect(saved.status).toBe(200)
    expect(await saved.text()).toBe(document)
  })

  test.each(["runtime", "frame"])("returns a 404 for a missing %s asset", async (route) => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const runtimeRoot = widget.inlineData.runtimeUrl.replace(/\/index\.html$/u, "/")
    const frameRoot = `/api/frame/widget/${framePass(project.path, widget)}/`
    for (const assetPath of ["missing.js", "missing/nested.css", "app.js/missing.css", `${"a".repeat(300)}.js`]) {
      const response = await app.request(`${route === "runtime" ? runtimeRoot : frameRoot}${assetPath}`, {
        headers: route === "runtime" ? { authorization } : undefined,
      })
      expect(response.status).toBe(404)
      const body = await response.text()
      if (route === "frame") expect(body).toBe("")
      expect(body).not.toContain(document)
      expect(body).not.toContain(script)
    }
  })

  test("rejects tampered, foreign-key and malformed passes without details", async () => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const pass = framePass(project.path, widget)
    const separator = pass.indexOf(".") + 1
    const tampered = `${pass.slice(0, separator)}${pass[separator] === "A" ? "B" : "A"}${pass.slice(separator + 1)}`
    const foreignPass = createWidgetFramePassSigner().mint({
      directory: project.path,
      objectID: widget.manifest.objectID,
      versionToken: "live",
    })
    for (const invalid of [tampered, foreignPass, "bad", "a.b", "a.b.c", "%%.%%"]) {
      expect(widgetFramePassSigner.verify(invalid)).toBeUndefined()
      const response = await app.request(`/api/frame/widget/${invalid}/index.html`)
      expect(response.status).toBe(404)
      expect(await response.text()).toBe("")
      expect(response.headers.get("referrer-policy")).toBe("no-referrer")
      expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    }
  })

  test("confines a pass to its widget folder", async () => {
    await using project = await tmpdir({ git: true })
    const widgetA = await createWidget(project.path, "widget-a")
    const widgetB = await createWidget(project.path, "widget-b")
    const pass = framePass(project.path, widgetA)
    for (const assetPath of [
      "widget-b.txt",
      "..%2fobject.json",
      `..%2f..%2f${widgetB.manifest.objectID}%2fsource%2fwidget-b.txt`,
    ]) {
      const response = await app.request(`/api/frame/widget/${pass}/${assetPath}`)
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(await response.text()).not.toContain("widget-b")
      expect(response.headers.get("referrer-policy")).toBe("no-referrer")
      expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    }
    const ownFile = await app.request(
      `/api/frame/widget/${framePass(project.path, widgetB)}/widget-b.txt`,
    )
    expect(ownFile.status).toBe(200)
    expect(await ownFile.text()).toBe("widget-b")
  })

  test("makes SVG and XML assets inert", async () => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    for (const assetPath of ["icon.svg", "data.xml", "page.xhtml", "feed.atom"]) {
      const response = await app.request(
        `/api/frame/widget/${framePass(project.path, widget)}/${assetPath}`,
      )
      expect(response.status).toBe(200)
      expect(response.headers.get("content-security-policy")).toBe(INERT_DOCUMENT_CSP)
      expect(response.headers.get("referrer-policy")).toBe("no-referrer")
      expect(response.headers.get("x-content-type-options")).toBe("nosniff")
      await response.body?.cancel()
    }
  })

  test("redacts passes from incoming and outgoing request logs for success and failure", async () => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const pass = framePass(project.path, widget)
    requestLogs.length = 0
    for (const [assetPath, status] of [["index.html", 200], ["..%2fobject.json", 400]] as const) {
      const response = await app.request(`/api/frame/widget/${pass}/${assetPath}`)
      expect(response.status).toBe(status)
      await response.body?.cancel()
    }
    const invalid = await app.request(`/api/frame/widget/${pass}invalid/index.html`)
    expect(invalid.status).toBe(404)
    expect(requestLogs).toHaveLength(6)
    for (const line of requestLogs) {
      expect(line).not.toContain(pass)
      expect(line).toContain("/api/frame/widget/[pass]")
      expect(line).not.toContain("index.html")
    }
    expect(requestLogs.filter((line) => line.includes("<-- GET"))).toHaveLength(3)
    expect(requestLogs.filter((line) => line.includes("--> GET"))).toHaveLength(3)
  })

  test.each(["", "?renderKey=7", "#section"])(
    "redacts a terminal pass in both directions (%s)",
    async (suffix) => {
      await using project = await tmpdir({ git: true })
      const widget = await createWidget(project.path, "widget-a")
      const pass = framePass(project.path, widget)
      requestLogs.length = 0
      const response = await app.request(`/api/frame/widget/${pass}${suffix}`)
      expect(response.status).toBe(404)
      await response.body?.cancel()
      expect(requestLogs).toHaveLength(2)
      for (const line of requestLogs) {
        expect(line).not.toContain(pass)
        expect(line).toContain("/api/frame/widget/[pass]")
        expect(line).not.toContain("renderKey")
      }
      expect(requestLogs[0]).toContain("<-- GET")
      expect(requestLogs[1]).toContain("--> GET")
    },
  )

  test.each(["/api/frame/widget//", "/api/frame//widget/", "/api//frame/widget/"])(
    "redacts a pass after repeated slashes in both directions (%s)",
    async (prefix) => {
      await using project = await tmpdir({ git: true })
      const widget = await createWidget(project.path, "widget-a")
      const pass = framePass(project.path, widget)
      requestLogs.length = 0
      const response = await app.request(`${prefix}${pass}/index.html`)
      expect(response.status).toBeGreaterThanOrEqual(400)
      await response.body?.cancel()
      expect(requestLogs).toHaveLength(2)
      for (const line of requestLogs) {
        expect(line).not.toContain(pass)
        expect(line).toContain("/api/frame/widget/[pass]")
        expect(line).not.toContain("index.html")
      }
    },
  )

  test.each([
    "encoded api", "encoded frame", "encoded widget", "raw query", "encoded query", "asset pass",
  ])("redacts exchanged passes in both request log directions: %s", async (variant) => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const issued = linkSchema.parse(await (await exchange(widget.inlineData.runtimeUrl)).json())
    const pass = issued.url.split("/")[4]
    if (!pass) throw new Error("Exchange returned no pass")
    const encodedPass = Array.from(pass, (character) => `%${character.charCodeAt(0).toString(16)}`).join("")
    const urls: Record<string, string> = {
      "encoded api": issued.url.replace("/api/", "/%61pi/"),
      "encoded frame": issued.url.replace("/frame/", "/fr%61me/"),
      "encoded widget": issued.url.replace("/widget/", "/widg%65t/"),
      "raw query": `${issued.url}?again=${pass}`,
      "encoded query": `${issued.url}?again=${encodedPass}`,
      "asset pass": issued.url.replace("index.html", `${pass}/missing.js`),
    }
    const url = urls[variant]
    if (!url) throw new Error("Missing request variant")
    requestLogs.length = 0
    const response = await app.request(url, { headers: { authorization } })
    expect(response.status).toBe(variant === "asset pass" ? 404 : 200)
    await response.body?.cancel()
    expect(requestLogs).toHaveLength(2)
    expect(requestLogs[0]).toBe("<-- GET /api/frame/widget/[pass]")
    expect(requestLogs[1]).toMatch(new RegExp(`^--> GET /api/frame/widget/\\[pass\\] ${response.status} \\d+ms$`, "u"))
    for (const line of requestLogs) {
      expect(line).not.toContain(pass)
      expect(line.toLowerCase()).not.toContain(encodedPass)
      expect(line).not.toContain("index.html")
      expect(line).not.toContain("?")
    }
  })

  test("keeps other request paths and status fields while dropping queries", async () => {
    requestLogs.length = 0
    const response = await app.request("/api/healthz?private=value")
    expect(response.status).toBe(200)
    await response.body?.cancel()
    expect(requestLogs[0]).toBe("<-- GET /api/healthz")
    expect(requestLogs[1]).toMatch(/^--> GET \/api\/healthz 200 \d+ms$/u)
  })

  test.each(["raw", "encoded", "mixed", "malformed escape"])("redacts a pass in an unclassified route error: %s", async (variant) => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const issued = linkSchema.parse(await (await exchange(widget.inlineData.runtimeUrl)).json())
    const pass = issued.url.split("/")[4]
    if (!pass) throw new Error("Exchange returned no pass")
    const encodedPass = Array.from(pass, (character, index) => variant === "mixed" && index % 2 === 0 ? character : `%${character.charCodeAt(0).toString(16)}`).join("")
    const credential = variant === "raw" || variant === "malformed escape" ? pass : encodedPass
    const logs: string[] = []
    const result = await classifyRouteError(new Error(`Forced failure ${credential}${variant === "malformed escape" ? " %ZZ" : ""}`), (line, cause) => {
      logs.push(`${line} ${String(cause)}`)
    })
    expect(result.status).toBe(500)
    expect(result.body.error).toBe("Internal server error")
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain("Forced failure [pass]")
    expect(logs[0]).not.toContain(pass)
    expect(logs[0]).not.toContain(encodedPass)
  })

  test.each(["dist", "build"])("versions served output in %s", async (outputDirectory) => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const outputRoot = path.join(project.path, widget.sourceRoot, outputDirectory)
    await fs.mkdir(outputRoot)
    await fs.writeFile(path.join(outputRoot, "app.js"), "const version = 1")
    const first = await presentHtmlWidgetObject({
      action: "present_object",
      directory: project.path,
      objectID: widget.manifest.objectID,
    })
    const issued = linkSchema.parse(await (await exchange(first.inlineData.runtimeUrl)).json())
    const assetUrl = issued.url.replace("index.html", `${outputDirectory}/app.js`)
    const asset = await app.request(assetUrl)
    expect(asset.status).toBe(200)
    expect(await asset.text()).toBe("const version = 1")

    await fs.writeFile(path.join(outputRoot, "app.js"), "const version = 2")
    const edited = await presentHtmlWidgetObject({
      action: "present_object",
      directory: project.path,
      objectID: widget.manifest.objectID,
    })
    expect(edited.inlineData.sourceVersion).not.toBe(first.inlineData.sourceVersion)
    const stale = await app.request(assetUrl)
    expect(stale.status).toBe(404)
    expect(await stale.text()).toBe("")

    const refreshed = linkSchema.parse(await (await exchange(first.inlineData.runtimeUrl)).json())
    const current = await app.request(refreshed.url.replace("index.html", `${outputDirectory}/app.js`))
    expect(current.status).toBe(200)
    expect(await current.text()).toBe("const version = 2")
  })

  test("loads a built widget with two 2.6 MB assets through the signed route", async () => {
    await using project = await tmpdir({ git: true })
    const photo = new Uint8Array(2_600_000).fill(7)
    const builtDocument = '<!doctype html><script type="module" src="./dist/app.js"></script>'
    const widget = await createWidgetWithFiles(project.path, "built-widget", [
      ["index.html", builtDocument],
      ["dist/app.js", script],
      ["public/photo.bin", photo],
      ["dist/photo.bin", photo],
    ])
    const response = await exchange(widget.inlineData.runtimeUrl)
    expect(response.status).toBe(200)
    const issued = linkSchema.parse(await response.json())
    for (const [assetPath, byteLength] of [
      ["index.html", Buffer.byteLength(builtDocument)],
      ["dist/app.js", Buffer.byteLength(script)],
      ["dist/photo.bin", photo.byteLength],
      ["public/photo.bin", photo.byteLength],
    ] as const) {
      const asset = await app.request(issued.url.replace("index.html", assetPath))
      expect(asset.status).toBe(200)
      expect((await asset.arrayBuffer()).byteLength).toBe(byteLength)
    }
  })

  test("loads a built widget with 520 files under build through the signed route", async () => {
    await using project = await tmpdir({ git: true })
    const chunks = Array.from({ length: 520 }, (_, index) => [`build/chunk-${index}.js`, `export const chunk = ${index}`] as const)
    const widget = await createWidgetWithFiles(project.path, "chunked-widget", [["index.html", document], ...chunks])
    const response = await exchange(widget.inlineData.runtimeUrl)
    expect(response.status).toBe(200)
    const issued = linkSchema.parse(await response.json())
    const entry = await app.request(issued.url)
    expect(entry.status).toBe(200)
    expect(await entry.text()).toBe(document)
    for (const index of [0, 519]) {
      const chunk = await app.request(issued.url.replace("index.html", `build/chunk-${index}.js`))
      expect(chunk.status).toBe(200)
      expect(await chunk.text()).toBe(`export const chunk = ${index}`)
    }
  })

  test("changes the version when a file is edited or added, and an old pass gets a 404", async () => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const issued = linkSchema.parse(await (await exchange(widget.inlineData.runtimeUrl)).json())
    const sourceRoot = path.join(project.path, widget.sourceRoot)
    await fs.writeFile(path.join(sourceRoot, "app.js"), "document.body.dataset.ready = 'edited'")
    const edited = await presentHtmlWidgetObject({
      action: "present_object",
      directory: project.path,
      objectID: widget.manifest.objectID,
    })
    expect(edited.inlineData.sourceVersion).not.toBeNull()
    expect(edited.inlineData.sourceVersion).not.toBe(widget.inlineData.sourceVersion)
    for (const assetPath of ["index.html", "app.js"]) {
      const stale = await app.request(issued.url.replace("index.html", assetPath))
      expect(stale.status).toBe(404)
      expect(await stale.text()).toBe("")
    }

    await fs.writeFile(path.join(sourceRoot, "added.txt"), "Added file")
    const added = await presentHtmlWidgetObject({
      action: "present_object",
      directory: project.path,
      objectID: widget.manifest.objectID,
    })
    expect(added.inlineData.sourceVersion).not.toBeNull()
    expect(added.inlineData.sourceVersion).not.toBe(edited.inlineData.sourceVersion)
  })

  test.each([
    "later.log",
    "node_modules/dependency/app.js",
    ".git/config",
    ".hg/store/data",
    ".svn/entries",
    ".bzr/branch/format",
    ".pijul/config",
    "_darcs/prefs/defaults",
    "CVS/Entries",
    ".DS_Store",
    ".turbo/cache/data",
    "nested/node_modules/dependency/app.js",
    "nested/output.log/data.json",
  ])("refuses unversioned runtime file %s while retaining authenticated access", async (assetPath) => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const issued = linkSchema.parse(await (await exchange(widget.inlineData.runtimeUrl)).json())
    const target = path.join(project.path, widget.sourceRoot, assetPath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, "Excluded widget data")
    const denied = await app.request(issued.url.replace("index.html", assetPath))
    expect(denied.status).toBe(404)
    expect(await denied.text()).toBe("")
    const refreshed = linkSchema.parse(await (await exchange(widget.inlineData.runtimeUrl)).json())
    const stillDenied = await app.request(refreshed.url.replace("index.html", assetPath))
    expect(stillDenied.status).toBe(404)
    expect(await stillDenied.text()).toBe("")
    const authenticated = await app.request(widget.inlineData.runtimeUrl.replace("index.html", assetPath), {
      headers: { authorization },
    })
    expect(authenticated.status).toBe(200)
    expect(await authenticated.text()).toBe("Excluded widget data")
  })

  test("refuses a symlink to an excluded file through the signed route", async () => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const sourceRoot = path.join(project.path, widget.sourceRoot)
    await fs.writeFile(path.join(sourceRoot, "private.log"), "Excluded log")
    await fs.symlink(path.join(sourceRoot, "private.log"), path.join(sourceRoot, "alias.txt"))
    const issued = linkSchema.parse(await (await exchange(widget.inlineData.runtimeUrl)).json())
    const response = await app.request(issued.url.replace("index.html", "alias.txt"))
    expect(response.status).toBe(404)
    expect(await response.text()).toBe("")
  })

  test("rejects an old pass after edits and exchanges the saved URL for current content", async () => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const issued = linkSchema.parse(await (await exchange(widget.inlineData.runtimeUrl)).json())
    const currentDocument = "<!doctype html><p>Edited widget</p>"
    await fs.writeFile(path.join(project.path, widget.sourceRoot, "index.html"), currentDocument)
    await fs.writeFile(path.join(project.path, widget.sourceRoot, "new.txt"), "New private file")

    for (const url of [issued.url, issued.url.replace("index.html", "new.txt")]) {
      const response = await app.request(url)
      expect(response.status).toBe(404)
      expect(await response.text()).toBe("")
    }

    const refreshedResponse = await exchange(widget.inlineData.runtimeUrl)
    expect(refreshedResponse.status).toBe(200)
    const refreshed = linkSchema.parse(await refreshedResponse.json())
    expect(refreshed.url).not.toBe(issued.url)
    const documentResponse = await app.request(refreshed.url)
    expect(documentResponse.status).toBe(200)
    expect(await documentResponse.text()).toBe(currentDocument)
    const fileResponse = await app.request(refreshed.url.replace("index.html", "new.txt"))
    expect(fileResponse.status).toBe(200)
    expect(await fileResponse.text()).toBe("New private file")
  })

  test("requires a login for exchange and other API routes", async () => {
    expect((await exchange("/api/objects/html-widget/runtime/invalid", false)).status).toBe(401)
    expect((await app.request("/api/objects")).status).toBe(401)
    expect((await app.request("/api/frame/widget-links/anything")).status).toBe(401)
  })

  test("exchanges saved URLs, ignoring render keys, into links usable without a login", async () => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    for (const runtimeUrl of [
      widget.inlineData.runtimeUrl,
      `${widget.inlineData.runtimeUrl}?renderKey=9`,
      `http://localhost${widget.inlineData.runtimeUrl}`,
      widget.inlineData.runtimeUrl.replace(widget.inlineData.sourceVersion ?? "/live/", "OLDVERSION"),
      widget.inlineData.runtimeUrl.replace(widget.inlineData.sourceVersion ?? "/live/", "live"),
    ]) {
      const response = await exchange(runtimeUrl)
      expect(response.status).toBe(200)
      const { url } = linkSchema.parse(await response.json())
      expect(url).toStartWith("/api/frame/widget/")
      expect(url).toEndWith("/index.html")
      const frame = await app.request(url)
      expect(frame.status).toBe(200)
      expect(await frame.text()).toBe(document)
    }
  })

  test("rejects unknown widgets, malformed and foreign URLs without echoing them", async () => {
    await using project = await tmpdir({ git: true })
    const widget = await createWidget(project.path, "widget-a")
    const runtimeUrl = widget.inlineData.runtimeUrl
    for (const invalid of [
      runtimeUrl.replace(widget.manifest.objectID, "00000000000000000000000000"),
      "/malformed-sensitive-url",
      `https://foreign.example${runtimeUrl}`,
      runtimeUrl.replace("/index.html", "/%ZZ"),
    ]) {
      const response = await exchange(invalid)
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain(invalid)
    }
    const malformedJson = await app.request("/api/frame/widget-links", {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: "{",
    })
    expect(malformedJson.status).toBe(404)
  })
})
