#!/usr/bin/env bun

import assert from "node:assert/strict"
import type { EventEmitter } from "node:events"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import os from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { pathToFileURL } from "node:url"
import z from "zod"
import { restoreV1UpgradeFixture, V1_UPGRADE_FIXTURE } from "../packages/buddy/script/v1-upgrade-fixture"

const repositoryRoot = path.resolve(import.meta.dirname, "..")
const backendDirectory = path.join(repositoryRoot, "packages", "buddy")
const requestTimeout = 30_000
type SmokeRequestBody = { directory: string } | { title: string } | { sourcePath: string; alias: string }
const sessionSchema = z.object({ id: z.string().min(1), title: z.string() })
const resourceSchema = z.object({
  objectID: z.string(),
  status: z.enum(["preparing", "ready", "unsupported", "error", "stale"]),
  fullTextPath: z.string().optional(),
  fullTextCharacters: z.number().optional(),
  warnings: z.array(z.string()),
})

const offlinePreload = `
import { appendFileSync } from "node:fs";
import { Socket } from "node:net";
const allowed = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
function deny(target) {
  appendFileSync(process.env.BUDDY_SMOKE_NETWORK_LOG, String(target) + "\\n");
  throw new Error("Node backend smoke blocked external network: " + target);
}
const fetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (!allowed.has(url.hostname)) deny(url.origin);
  return fetch(input, options);
};
const connect = Socket.prototype.connect;
Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = first && typeof first === "object" ? first.host : typeof args[1] === "string" ? args[1] : "localhost";
  if (!allowed.has(host ?? "localhost")) deny(host);
  return connect.apply(this, args);
};
`

function isolatedEnvironment(root: string, notebook: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  const inheritedKeys = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "SYSTEMDRIVE"])
  for (const [key, value] of Object.entries(process.env)) {
    if (inheritedKeys.has(key.toUpperCase())) environment[key] = value
  }
  const homeDirectory = path.join(root, "home")
  const temporaryDirectory = path.join(root, "tmp")
  Object.assign(environment, {
    HOME: homeDirectory,
    USERPROFILE: homeDirectory,
    APPDATA: path.join(homeDirectory, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(homeDirectory, "AppData", "Local"),
    OPENCODE_TEST_HOME: homeDirectory,
    BUDDY_TEST_HOME: homeDirectory,
    TMPDIR: temporaryDirectory,
    TEMP: temporaryDirectory,
    TMP: temporaryDirectory,
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    XDG_STATE_HOME: path.join(root, "state"),
    BUDDY_GLOBAL_CONFIG_DIR: path.join(homeDirectory, ".buddy"),
    BUDDY_DIRECTORY_BASE: path.dirname(notebook),
    BUDDY_ALLOWED_DIRECTORY_ROOTS: JSON.stringify([path.dirname(notebook)]),
    BUDDY_BACKEND_RESOURCES_DIR: path.join(backendDirectory, "src"),
    BUDDY_TESSDATA_DIR: path.join(backendDirectory, "resources", "tessdata"),
    BUDDY_MIGRATION_DIR: path.join(backendDirectory, "migration"),
    OPENCODE_DB: path.join(root, "data", "buddy", "opencode", "opencode-v2.db"),
    OPENCODE_CLIENT: "desktop",
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
    BUDDY_DISABLE_SKILL_ARTIFACT_FETCH: "1",
    BUDDY_SMOKE_NETWORK_LOG: path.join(root, "external-network.log"),
  })
  for (const directory of [homeDirectory, temporaryDirectory, environment.APPDATA, environment.LOCALAPPDATA]) {
    if (directory) mkdirSync(directory, { recursive: true })
  }
  return environment
}

function fileDigest(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex")
}

async function freePort(): Promise<number> {
  const server = createServer()
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = z.object({ port: z.number().int().min(1).max(65_535) }).parse(server.address())
    return address.port
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

async function main(): Promise<void> {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "buddy-node-backend-smoke-")))
  const notebook = path.join(root, "notebooks", "Node smoke notebook")
  const openCodeData = path.join(root, "data", "buddy", "opencode")
  const upgrade = restoreV1UpgradeFixture({
    root: path.join(root, "v1 upgrade"),
    openCodeDataDirectory: openCodeData,
    notebookParent: path.join(path.dirname(notebook), "v1 upgrade l'été"),
    credentials: false,
  })
  const v1Digest = fileDigest(upgrade.v1Database)
  const cancelled = new AbortController()
  const interrupt = () => { process.exitCode = 130; cancelled.abort() }
  const terminate = () => { process.exitCode = 143; cancelled.abort() }
  const signals: EventEmitter = process
  signals.once("SIGINT", interrupt)
  signals.once("SIGTERM", terminate)
  let backend: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined
  let logs: Promise<string>[] = []
  let activeCase = "boot"
  let passed = 0
  try {
    assert(process.argv.length <= 3, "Usage: bun run smoke:node-backend [path/to/node.js]")
    const bundle = path.resolve(process.argv[2] ?? path.join(backendDirectory, "dist", "node", "node.js"))
    assert(await Bun.file(bundle).exists(), `Bundle not found: ${bundle}; run bun run --cwd packages/buddy build:node`)
    const node = Bun.which("node")
    assert(node, "Node must be available on PATH (CI uses Node 24)")
    mkdirSync(notebook, { recursive: true })
    const preload = path.join(root, "offline.mjs")
    writeFileSync(preload, offlinePreload)
    const port = await freePort()
    cancelled.signal.throwIfAborted()
    const baseUrl = `http://127.0.0.1:${port}/api/`
    backend = Bun.spawn([node, "--import", pathToFileURL(preload).href, bundle, "serve", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: root,
      env: isolatedEnvironment(root, notebook),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    logs = [new Response(backend.stdout).text(), new Response(backend.stderr).text()]
    console.log(`Node backend smoke: root=${root} pid=${backend.pid}`)

    async function request(route: string, method: "GET" | "POST" | "PATCH" | "DELETE" = "GET", body?: SmokeRequestBody, directory = notebook): Promise<Response> {
      const url = new URL(route, baseUrl)
      url.searchParams.set("directory", directory)
      const options: RequestInit = {
        method,
        headers: { "content-type": "application/json" },
        signal: AbortSignal.any([cancelled.signal, AbortSignal.timeout(requestTimeout)]),
        redirect: "error",
      }
      if (body !== undefined) options.body = JSON.stringify(body)
      const response = await fetch(url, options)
      if (!response.ok) assert.fail(`${method} ${route}: HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
      return response
    }

    let sessionID = ""
    const cases: ReadonlyArray<readonly [string, () => Promise<void>]> = [
      ["boot", async () => {
        const deadline = Date.now() + 60_000
        while (true) {
          cancelled.signal.throwIfAborted()
          assert(backend && backend.exitCode === null, "Backend exited before health became ready")
          try {
            const response = await fetch(new URL("healthz", baseUrl), {
              signal: AbortSignal.any([cancelled.signal, AbortSignal.timeout(1_000)]),
              redirect: "error",
            })
            z.object({ healthy: z.literal(true) }).parse(await response.json())
            assert(response.ok, "Health endpoint did not return success")
            break
          } catch (error) {
            if (cancelled.signal.aborted || Date.now() >= deadline) throw error
            await delay(100, undefined, { signal: cancelled.signal })
          }
        }
        z.object({ healthy: z.literal(true), version: z.string().min(1) }).parse(await (await request("health")).json())
      }],
      ["v1 upgrade", async () => {
        const reportSchema = z.object({
          upgrade: z.object({ state: z.string() }),
          import: z.object({ status: z.string(), error: z.string().optional() }).nullable(),
          skipped: z.array(z.unknown()),
        })
        const deadline = Date.now() + 60_000
        let report = reportSchema.parse(await (await request("runtime/v1-import")).json())
        while (report.import?.status !== "completed") {
          assert(report.import?.status !== "error", `v1 import failed: ${report.import?.error}`)
          assert(Date.now() < deadline, `v1 import did not complete: ${JSON.stringify(report)}`)
          await delay(100, undefined, { signal: cancelled.signal })
          report = reportSchema.parse(await (await request("runtime/v1-import")).json())
        }
        assert.equal(report.upgrade.state, "ready")
        assert.equal(report.skipped.length, 0)
        const v2 = path.join(openCodeData, "opencode-v2.db")
        if (process.platform !== "win32") assert.equal(statSync(v2).mode & 0o777, 0o600)
        assert.equal(fileDigest(upgrade.v1Database), v1Digest, "opencode.db changed during the upgrade")
        const opened = z.object({ directory: z.string() }).parse(await (await request("open-projects", "POST", { directory: upgrade.notebook }, upgrade.notebook)).json())
        assert.equal(realpathSync(opened.directory), realpathSync(upgrade.notebook))
        const listed = z.array(z.object({ id: z.string(), directory: z.string(), parentID: z.string().optional() }))
        const roots = listed.parse(await (await request("session?roots=true", "GET", undefined, upgrade.notebook)).json())
        assert.deepEqual(roots.map((session) => session.id).toSorted(), [V1_UPGRADE_FIXTURE.parentSessionID, V1_UPGRADE_FIXTURE.separateSessionID].toSorted())
        const children = listed.parse(await (await request(`session/${V1_UPGRADE_FIXTURE.parentSessionID}/children`, "GET", undefined, upgrade.notebook)).json())
        assert.deepEqual(children.map((session) => [session.id, session.parentID]), [[V1_UPGRADE_FIXTURE.childSessionID, V1_UPGRADE_FIXTURE.parentSessionID]])
        const messages = z.array(z.object({ info: z.object({ id: z.string() }), parts: z.array(z.object({ type: z.string(), text: z.string().optional() })) }))
          .parse(await (await request(`session/${V1_UPGRADE_FIXTURE.parentSessionID}/message`, "GET", undefined, upgrade.notebook)).json())
        const ids = new Set(messages.map((message) => message.info.id))
        for (const id of [V1_UPGRADE_FIXTURE.parentFirstMessageID, V1_UPGRADE_FIXTURE.citedMessageID, V1_UPGRADE_FIXTURE.mermaidMessageID]) assert(ids.has(id), `Imported message ${id} is missing`)
        assert(messages.some((message) => message.parts.some((part) => part.text?.includes("```mermaid"))), "The mermaid reply is missing")
      }],
      ["open notebook", async () => {
        const opened = z.object({ directory: z.string() }).parse(await (await request("open-projects", "POST", { directory: notebook })).json())
        assert.equal(realpathSync(opened.directory), notebook)
        const listed = z.object({ directories: z.array(z.string()) }).parse(await (await request("open-projects")).json())
        assert(listed.directories.includes(opened.directory), "Opened notebook is missing from the registry")
      }],
      ["providers", async () => {
        z.object({ all: z.array(z.object({ id: z.string() })).min(1), connected: z.array(z.string()) }).parse(await (await request("provider")).json())
      }],
      ["commands", async () => {
        const commands = z.array(z.object({ name: z.string().min(1) })).parse(await (await request("command")).json())
        assert(commands.length > 0, "Built-in commands are missing")
      }],
      ["skills", async () => {
        const skills = z.object({ installed: z.array(z.object({ name: z.string().min(1) })) }).parse(await (await request("skills")).json())
        assert(skills.installed.length > 0, "Bundled skills are missing")
      }],
      ["create and list session", async () => {
        const session = sessionSchema.parse(await (await request("session", "POST", { title: "Node smoke" })).json())
        sessionID = session.id
        const sessions = z.array(sessionSchema).parse(await (await request("session")).json())
        assert(sessions.some((entry) => entry.id === sessionID), "Created session is missing from the session list")
      }],
      ["rename session", async () => {
        const renamed = sessionSchema.parse(await (await request(`session/${sessionID}`, "PATCH", { title: "Node smoke renamed" })).json())
        assert.equal(renamed.title, "Node smoke renamed")
        const stored = sessionSchema.parse(await (await request(`session/${sessionID}`)).json())
        assert.equal(stored.title, renamed.title)
      }],
      ["event stream", async () => {
        const response = await request("event")
        assert(response.headers.get("content-type")?.includes("text/event-stream"), "Expected an SSE response")
        const reader = response.body?.getReader()
        assert(reader, "Event stream has no body")
        try {
          const decoder = new TextDecoder()
          let frame = ""
          while (!frame.includes("\n\n")) {
            const chunk = await reader.read()
            assert(!chunk.done, "Event stream ended before its first event")
            frame += decoder.decode(chunk.value, { stream: true }).replaceAll("\r\n", "\n")
          }
          const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")
          z.object({ payload: z.object({ type: z.string().min(1) }) }).parse(JSON.parse(data))
        } finally {
          await reader.cancel()
          reader.releaseLock()
        }
      }],
      ["WASM resource preparation", async () => {
        const sourcePath = path.join(notebook, "wasm smoke.md")
        const text = "Buddy prepares local reading material without a model. ".repeat(4_000)
        writeFileSync(sourcePath, text)
        const created = resourceSchema.parse(await (await request("objects/resource", "POST", { sourcePath, alias: "node-wasm-smoke" })).json())
        const deadline = Date.now() + requestTimeout
        while (true) {
          const resources = z.object({ resources: z.array(resourceSchema) }).parse(await (await request("objects/resource")).json())
          const resource = resources.resources.find((entry) => entry.objectID === created.objectID)
          assert(resource, "Imported resource is missing from the resource list")
          assert(["preparing", "ready"].includes(resource.status), `Resource preparation failed: ${resource.warnings.join("; ")}`)
          if (resource.status === "ready") {
            assert(resource.fullTextPath && resource.fullTextCharacters && resource.fullTextCharacters > 0, "Prepared resource has no extracted text")
            const fullText = z.object({ content: z.string() }).parse(await (await request(`file/content?path=${encodeURIComponent(resource.fullTextPath)}`)).json())
            assert(fullText.content.includes("Buddy prepares local reading material"), "Prepared text is not readable through the file API")
            return
          }
          assert(Date.now() < deadline, "Resource preparation did not finish")
          await delay(100, undefined, { signal: cancelled.signal })
        }
      }],
      ["delete session", async () => {
        assert.equal(await (await request(`session/${sessionID}`, "DELETE")).json(), true)
        const sessions = z.array(sessionSchema).parse(await (await request("session")).json())
        assert(!sessions.some((entry) => entry.id === sessionID), "Deleted session is still listed")
      }],
    ]
    for (const [name, run] of cases) {
      activeCase = name
      await run()
      console.log(`PASS ${name}`)
      passed += 1
    }
  } catch (error) {
    console.error(`FAIL ${activeCase}: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode ||= 1
  } finally {
    try {
      if (backend) {
        let forced = false
        const forceStop = setTimeout(() => {
          forced = true
          backend?.kill("SIGKILL")
        }, 5_000)
        try {
          backend.kill("SIGTERM")
          const exitCode = await backend.exited
          assert(!forced, "Backend did not stop within 5 s")
          assert(exitCode === 0 || (process.platform === "win32" && exitCode === 1), `Backend stopped with exit code ${exitCode}`)
        } finally {
          clearTimeout(forceStop)
        }
      }
      const networkLog = path.join(root, "external-network.log")
      assert(!existsSync(networkLog), `External network was attempted: ${await Bun.file(networkLog).text().catch(() => "")}`)
    } catch (error) {
      console.error(`FAIL shutdown/offline: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode ||= 1
    } finally {
      if (process.exitCode) {
        for (const log of await Promise.allSettled(logs)) {
          if (log.status === "fulfilled") console.error(log.value.slice(-6_000))
          else console.error("Could not read backend output", log.reason)
        }
      }
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        assert(!existsSync(root), "Temporary root still exists")
        console.log(`PASS cleanup: backend stopped; removed ${root}`)
      } catch (error) {
        console.error(`FAIL cleanup: ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode ||= 1
      }
      signals.removeListener("SIGINT", interrupt)
      signals.removeListener("SIGTERM", terminate)
    }
  }
  console.log(`${passed} API cases passed`)
}

await main()
