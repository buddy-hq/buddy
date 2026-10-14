import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { CompatibilityRoutes } from "../src/routes/compatibility"
import { closeOpenCodeHost } from "../src/opencode-runtime/runtime"
import { tmpdir } from "./helpers/tmpdir"

const app = new Hono().route("/api", CompatibilityRoutes)
afterEach(closeOpenCodeHost)

describe("compatibility routes on v2", () => {
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
