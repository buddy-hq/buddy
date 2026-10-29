import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import fs from "node:fs"
import path from "node:path"
import z from "zod"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { createOpenCodeHost, openCodeV1ImportReport, startOpenCodeHost, type OpenCodeHost, type OpenCodeRuntimeDatabasePaths } from "../src/host"
import { importV1GlobalConfig } from "../src/global-config-import"
import { writeV1ImportEntryAt } from "../src/v1-import-guard"

const FIXTURE_MCP_AUTH = path.resolve(import.meta.dir, "../../buddy/test/fixtures/v1-upgrade/mcp-auth.json")
const SERVER_URL = "https://mcp.example.invalid/mcp"
const ORIGIN = new URL(SERVER_URL).origin
const FIXTURE_SERVER = "fixture-remote-mcp"
const EXPIRED_SERVER = "expired"
const NO_URL_SERVER = "no-url"
const SIGNED_IN_AGAIN_SERVER = "signed-in-again"
const ACCEPTED_AUTHORIZATIONS = new Set(["Bearer fixture-mcp-access-token-not-real", "Bearer fake-rotated-access"])
const ENVIRONMENT_KEYS = ["OPENCODE_DISABLE_MODELS_FETCH", "BUDDY_GLOBAL_CONFIG_DIR", "BUDDY_MIGRATION_DIR"] as const

const rpcMessageSchema = z.object({ id: z.union([z.string(), z.number()]).optional(), method: z.string().optional() })

let counter = 0
const savedEnvironment = new Map<string, string | undefined>()
const unfakedFetch = globalThis.fetch

function runtimeRoot(name: string) {
  counter += 1
  const root = path.join(TEST_SANDBOX.root, "v1-settings-import", `${counter}-${name}`)
  const data = path.join(root, "data")
  const paths: OpenCodeRuntimeDatabasePaths = {
    data,
    cache: path.join(root, "cache"),
    config: path.join(root, "config"),
    state: path.join(root, "state"),
    tmp: path.join(root, "tmp"),
    database: path.join(data, "opencode-v2.db"),
    v1Database: path.join(data, "opencode.db"),
  }
  const directory = path.join(root, "notebook")
  for (const entry of [paths.data, paths.cache, paths.config, paths.state, paths.tmp, directory]) fs.mkdirSync(entry, { recursive: true })
  return { paths, directory }
}

function startHost(paths: OpenCodeRuntimeDatabasePaths) {
  return startOpenCodeHost({
    environment: { configDirectory: paths.config, resolvePaths: () => paths },
    initializeStorage: async () => undefined,
    configure: async () => ({ config: { project: false } }),
    decorate: (host) => host,
  })
}

async function fakeMcpFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.origin !== ORIGIN) throw new Error(`Unexpected request in test: ${url.origin}`)
  const body = request.method === "POST" ? await request.text() : ""
  if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
    return Response.json({ resource: SERVER_URL, authorization_servers: [ORIGIN] })
  }
  if (url.pathname === "/.well-known/oauth-authorization-server") {
    return Response.json({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/authorize`,
      token_endpoint: `${ORIGIN}/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    })
  }
  if (url.pathname === "/token") {
    const form = new URLSearchParams(body)
    const refreshesWithImportedClient = form.get("grant_type") === "refresh_token"
      && form.get("refresh_token") === "fake-refresh"
      && form.get("client_id") === "fake-client"
      && form.get("client_secret") === "fake-secret"
    if (!refreshesWithImportedClient) return Response.json({ error: "invalid_grant" }, { status: 400 })
    return Response.json({ access_token: "fake-rotated-access", refresh_token: "fake-rotated-refresh", token_type: "Bearer", expires_in: 3600 })
  }
  if (url.pathname === "/mcp") {
    if (!ACCEPTED_AUTHORIZATIONS.has(request.headers.get("authorization") ?? "")) {
      return new Response(null, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"` } })
    }
    if (request.method !== "POST") return new Response(null, { status: 405 })
    const message = rpcMessageSchema.parse(JSON.parse(body))
    if (message.id === undefined) return new Response(null, { status: 202 })
    const result = message.method === "initialize"
      ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } }
      : message.method === "tools/list" ? { tools: [] } : {}
    return Response.json({ jsonrpc: "2.0", id: message.id, result })
  }
  throw new Error(`Unexpected request in test: ${request.method} ${url.pathname}`)
}

async function integrationIDs(host: OpenCodeHost, directory: string, names: readonly string[]) {
  for (const name of names) await host.mcp.add({ location: { directory }, server: name, config: { type: "remote", url: SERVER_URL } })
  const { data } = await host.mcp.list({ location: { directory } })
  return new Map(data.flatMap((server) => (server.integrationID ? [[server.name, server.integrationID] as const] : [])))
}

async function signInOnAnEarlierV2Start(paths: OpenCodeRuntimeDatabasePaths, directory: string, server: string) {
  const host = await createOpenCodeHost({ clientName: "buddy-test", paths, databasePath: paths.database, fetchModels: false, fs: { filewatcher: false, fff: false }, config: { project: false } })
  try {
    const integrationID = (await integrationIDs(host, directory, [server])).get(server) ?? ""
    return await host.credential.create({
      integrationID,
      label: "Signed in again",
      value: { type: "oauth", methodID: integrationID, access: "fake-new-access", refresh: "", expires: 0 },
    })
  } finally {
    await host.close()
  }
}

async function credentialsFor(host: OpenCodeHost, integrationID: string | undefined) {
  return (await host.credential.list()).filter((credential) => credential.integrationID === integrationID)
}

beforeAll(() => {
  for (const key of ENVIRONMENT_KEYS) savedEnvironment.set(key, process.env[key])
  process.env.OPENCODE_DISABLE_MODELS_FETCH = "1"
  globalThis.fetch = Object.assign(fakeMcpFetch, { preconnect: unfakedFetch.preconnect })
})

afterAll(() => {
  globalThis.fetch = unfakedFetch
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("carrying settings over from the previous version", () => {
  test("the completed import report includes chats another window skipped after this window's import failed", async () => {
    const { paths } = runtimeRoot("import-report")
    fs.copyFileSync(path.resolve(import.meta.dir, "../../buddy/test/fixtures/v1-upgrade/opencode.db"), paths.database)
    const database = new Database(paths.database)
    try {
      database.exec("CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, time_created INTEGER, time_updated INTEGER)")
      database.query("INSERT INTO kv (key, value) VALUES (?, ?)").run("migration.v1-v2", JSON.stringify({ phase: "completed" }))
    } finally {
      database.close(false)
    }
    const initialized = await createOpenCodeHost({ clientName: "buddy-test", paths, databasePath: paths.database, fetchModels: false, fs: { filewatcher: false, fff: false }, config: { project: false } })
    await initialized.close()
    const pending = new Database(paths.database)
    try {
      pending.query("UPDATE kv SET value = ? WHERE key = ?").run(JSON.stringify({ phase: "sessions" }), "migration.v1-v2")
      pending.exec("CREATE TRIGGER fail_v1_import BEFORE INSERT ON session_message BEGIN SELECT RAISE(ABORT, 'import report regression'); END")
    } finally {
      pending.close(false)
    }
    const host = await startHost(paths)
    try {
      const deadline = Date.now() + 5_000
      while (openCodeV1ImportReport()?.status?.status !== "error" && Date.now() < deadline) await Bun.sleep(50)
      expect(openCodeV1ImportReport()).toMatchObject({ status: { status: "error" }, skipped: [] })
      const skipped = [{ id: "ses_e9bc348c6ffeVYp3hNj10v5E1K", at: 1, error: "import report regression" }]
      writeV1ImportEntryAt(paths.database, "skipped", skipped)
      const otherWindow = new Database(paths.database)
      try {
        otherWindow.query("UPDATE kv SET value = ? WHERE key = ?").run(JSON.stringify({ phase: "completed" }), "migration.v1-v2")
      } finally {
        otherWindow.close(false)
      }
      const report = openCodeV1ImportReport()
      expect(report?.status).toEqual({ status: "completed" })
      expect(report?.skipped).toEqual(skipped)
    } finally {
      await host.close()
    }
  }, 60_000)

  test("v1 MCP sign-ins are carried over once at startup and never restored after a sign-out", async () => {
    const { paths, directory } = runtimeRoot("mcp")
    const signInFile = path.join(paths.data, "mcp-auth.json")
    fs.writeFileSync(signInFile, JSON.stringify({
      ...z.record(z.string(), z.unknown()).parse(JSON.parse(fs.readFileSync(FIXTURE_MCP_AUTH, "utf8"))),
      [EXPIRED_SERVER]: {
        tokens: { accessToken: "fake-expired-access", refreshToken: "fake-refresh", expiresAt: 1_700_000_000.1234, scope: "read" },
        clientInfo: { clientId: "fake-client", clientSecret: "fake-secret", clientIdIssuedAt: 1_700_000_000, clientSecretExpiresAt: 0 },
        serverUrl: SERVER_URL,
      },
      [NO_URL_SERVER]: { tokens: { accessToken: "fake-no-url-access" } },
      [SIGNED_IN_AGAIN_SERVER]: { tokens: { accessToken: "fake-old-access" }, serverUrl: SERVER_URL },
    }), { mode: 0o600 })
    const signInBytes = fs.readFileSync(signInFile)

    const signedInAgain = await signInOnAnEarlierV2Start(paths, directory, SIGNED_IN_AGAIN_SERVER)

    const first = await startHost(paths)
    let fixtureIntegration: string | undefined
    try {
      const ids = await integrationIDs(first, directory, [FIXTURE_SERVER, EXPIRED_SERVER, NO_URL_SERVER, SIGNED_IN_AGAIN_SERVER])
      fixtureIntegration = ids.get(FIXTURE_SERVER)
      for (const name of [FIXTURE_SERVER, EXPIRED_SERVER]) await first.mcp.connect({ location: { directory }, server: name })
      const statuses = new Map((await first.mcp.list({ location: { directory } })).data.map((server) => [server.name, server.status.status]))
      expect(statuses.get(FIXTURE_SERVER)).toBe("connected")
      expect(statuses.get(EXPIRED_SERVER)).toBe("connected")
      expect(await credentialsFor(first, ids.get(NO_URL_SERVER))).toEqual([])
      expect(await credentialsFor(first, ids.get(SIGNED_IN_AGAIN_SERVER))).toEqual([signedInAgain])
      const [imported] = await credentialsFor(first, fixtureIntegration)
      expect(imported?.value).toMatchObject({ type: "oauth", access: "fixture-mcp-access-token-not-real" })
      if (imported) await first.credential.remove({ credentialID: imported.id })
    } finally {
      await first.close()
    }
    expect(fs.readFileSync(signInFile)).toEqual(signInBytes)

    const second = await startHost(paths)
    try {
      expect(await credentialsFor(second, fixtureIntegration)).toEqual([])
    } finally {
      await second.close()
    }
  }, 60_000)

  test("a global config.json is copied to opencode.jsonc only when neither opencode.json nor opencode.jsonc exists", async () => {
    const v1Text = "{\n  // set on the previous version\n  \"username\": \"from-config-json\",\n}\n"
    const { paths, directory } = runtimeRoot("config-copied")
    fs.writeFileSync(path.join(paths.config, "config.json"), v1Text, { mode: 0o644 })
    const host = await startHost(paths)
    try {
      const documents = (await host.config.get({ location: { directory } })).filter((entry) => entry.type === "document")
      const copied = documents.find((entry) => entry.path?.endsWith(`${path.sep}opencode.jsonc`))
      expect(copied?.info.username).toBe("from-config-json")
    } finally {
      await host.close()
    }
    const copy = path.join(paths.config, "opencode.jsonc")
    expect(fs.readFileSync(copy, "utf8")).toBe(v1Text)
    expect(fs.readFileSync(path.join(paths.config, "config.json"), "utf8")).toBe(v1Text)
    if (process.platform !== "win32") expect(fs.statSync(copy).mode & 0o777).toBe(0o600)

    const kept = runtimeRoot("config-kept").paths.config
    const currentText = "{ \"username\": \"from-opencode-json\" }\n"
    fs.writeFileSync(path.join(kept, "config.json"), v1Text)
    fs.writeFileSync(path.join(kept, "opencode.json"), currentText)
    await importV1GlobalConfig(kept)
    expect(fs.readdirSync(kept).toSorted()).toEqual(["config.json", "opencode.json"])
    expect(fs.readFileSync(path.join(kept, "opencode.json"), "utf8")).toBe(currentText)
  }, 60_000)
})
