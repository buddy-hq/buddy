import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { INERT_DOCUMENT_CSP } from "../src/http/inert-document-headers"
import { readRawFileResponse } from "../src/project/raw-file-response-service"
import { CompatibilityRoutes } from "../src/routes/compatibility"
import { closeAgentRuntime } from "../src/runtime/agent-runtime"
import { tmpdir } from "./helpers/tmpdir"

const app = new Hono().route("/api", CompatibilityRoutes)
afterEach(closeAgentRuntime)

describe("compatibility routes on v2", () => {
  test.each([
    {
      name: "figure.html",
      content: "<!doctype html><script>alert(1)</script>",
      csp: INERT_DOCUMENT_CSP,
    },
    {
      name: "figure.svg",
      content: '<svg xmlns="http://www.w3.org/2000/svg" />',
      csp: INERT_DOCUMENT_CSP,
    },
    {
      name: "figure.xhtml",
      content: '<html xmlns="http://www.w3.org/1999/xhtml" />',
      csp: INERT_DOCUMENT_CSP,
    },
    {
      name: "figure.xml",
      content: '<svg xmlns="http://www.w3.org/2000/svg" />',
      csp: INERT_DOCUMENT_CSP,
    },
    ...[
      ["rdf", "application/rdf+xml"],
      ["xslt", "application/xslt+xml"],
      ["rss", "application/rss+xml"],
      ["atom", "application/atom+xml"],
      ["mathml", "application/mathml+xml"],
      ["x3d", "model/x3d+xml"],
    ].map(([extension, contentType]) => ({
      name: `figure.${extension}`,
      content: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      contentType,
      csp: INERT_DOCUMENT_CSP,
    })),
    {
      name: "figure.png",
      content: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a07kAAAAASUVORK5CYII=",
        "base64",
      ),
      csp: null,
    },
    { name: "figure.txt", content: "ordinary text", csp: null },
  ])("serves $name with its document security policy", async (fixture) => {
    const { name, content, csp } = fixture
    await using project = await tmpdir({ git: true })
    await fs.writeFile(path.join(project.path, name), content)
    for (const method of ["GET", "HEAD"]) {
      const response = await app.request(`/api/file/raw/${name}?path=${encodeURIComponent(name)}`, {
        method,
        headers: { "x-buddy-directory": project.path },
      })
      expect(response.status).toBe(200)
      expect(response.headers.get("content-security-policy")).toBe(csp)
      if (csp !== null) {
        expect(response.headers.get("x-content-type-options")).toBe("nosniff")
      }
      if ("contentType" in fixture) {
        expect(response.headers.get("content-type")).toBe(fixture.contentType)
      }
      await response.arrayBuffer()
    }
  })

  test.each([
    { includeBody: true, rangeHeader: undefined, status: 200 },
    { includeBody: false, rangeHeader: undefined, status: 200 },
    { includeBody: true, rangeHeader: "bytes=0-3", status: 206 },
    { includeBody: false, rangeHeader: "bytes=0-3", status: 206 },
    { includeBody: true, rangeHeader: "bytes=9999-", status: 416 },
    { includeBody: false, rangeHeader: "bytes=9999-", status: 416 },
  ])("protects shared XML responses ($includeBody, $rangeHeader)", async (input) => {
    await using project = await tmpdir()
    const absolutePath = path.join(project.path, "figure.rdf")
    await fs.writeFile(absolutePath, '<svg xmlns="http://www.w3.org/2000/svg" />')
    const response = await readRawFileResponse({
      absolutePath,
      downloadName: "figure.rdf",
      includeBody: input.includeBody,
      rangeHeader: input.rangeHeader,
    })
    expect(response.status).toBe(input.status)
    expect(response.headers.get("content-type")).toBe("application/rdf+xml")
    expect(response.headers.get("content-security-policy")).toBe(INERT_DOCUMENT_CSP)
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    await response.arrayBuffer()
  })

  test.each(["GET", "HEAD"])("%s raw files reject traversal and external symlinks", async (method) => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir()
    const inside = path.join(project.path, "inside.txt")
    const outside = path.join(external.path, "outside.txt")
    await Promise.all([fs.writeFile(inside, "inside bytes"), fs.writeFile(outside, "outside bytes")])
    await fs.symlink(outside, path.join(project.path, "escape.txt"))
    const request = (filePath: string) => app.request(`/api/file/raw/file.txt?path=${encodeURIComponent(filePath)}`, { method, headers: { "x-buddy-directory": project.path } })
    const response = await request("inside.txt")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-length")).toBe("12")
    expect(await response.text()).toBe(method === "GET" ? "inside bytes" : "")
    expect((await request(outside)).status).toBe(403)
    expect((await request(path.relative(project.path, outside))).status).toBe(403)
    expect((await request("escape.txt")).status).toBe(403)
  })

  test("lists Buddy commands with directory-scoped display metadata", async () => {
    await using project = await tmpdir({ git: true })
    await fs.writeFile(path.join(project.path, "opencode.jsonc"), JSON.stringify({ commands: { explain: { description: "Explain a topic", template: "Explain $ARGUMENTS" } } }))
    const response = await app.request("/api/command", { headers: { "x-buddy-directory": project.path } })
    expect(response.status).toBe(200)
    expect(await response.json()).toContainEqual({ name: "explain", description: "Explain a topic", source: "command" })
    const health = await app.request("/api/health")
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ healthy: true, version: "2.0.24" })
  })
})
