import fs from "node:fs/promises"
import { expect, test } from "bun:test"
import { Hono } from "hono"
import z from "zod"
import { getAgentRuntime, closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { putProjectMcpConfig } from "../../src/config/orchestration/project-config-service"
import { temporaryEnvironment } from "../helpers/temporary-environment"
import { createMcpRoutes } from "../../src/routes/mcp"

const rpcRequestSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
})

test("opens a native MCP OAuth attempt, exchanges its loopback callback and removes its credential", async () => {
  await using project = await temporaryDirectory({ prefix: "mcp-oauth-" })
  const directory = await fs.realpath(project.path)
  const runtime = await getAgentRuntime()
  await using cleanup = { [Symbol.asyncDispose]: closeAgentRuntime }
  void cleanup
  using environment = temporaryEnvironment({ BUDDY_ALLOWED_DIRECTORY_ROOTS: directory })
  void environment
  let origin = ""
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/.well-known/oauth-protected-resource")
        return Response.json({ resource: `${origin}/mcp`, authorization_servers: [origin] })
      if (url.pathname === "/.well-known/oauth-authorization-server")
        return Response.json({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        })
      if (url.pathname === "/token")
        return Response.json({
          access_token: "sandbox-token",
          token_type: "Bearer",
          expires_in: 3600,
        })
      if (url.pathname !== "/mcp") return new Response(null, { status: 404 })
      if (request.headers.get("authorization") !== "Bearer sandbox-token")
        return Response.json(
          { error: "unauthorized" },
          {
            status: 401,
            headers: {
              "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
            },
          },
        )
      if (request.method !== "POST") return new Response(null, { status: 405 })
      const rpc = rpcRequestSchema.parse(await request.json())
      if (rpc.id === undefined) return new Response(null, { status: 202 })
      const result =
        rpc.method === "initialize"
          ? {
              protocolVersion: "2025-11-25",
              capabilities: { tools: {}, prompts: {}, resources: {} },
              serverInfo: { name: "sandbox-mcp", version: "1" },
            }
          : rpc.method === "tools/list"
            ? { tools: [] }
            : rpc.method === "prompts/list"
              ? { prompts: [] }
              : rpc.method === "resources/list"
                ? { resources: [] }
                : { resourceTemplates: [] }
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result })
    },
  })
  origin = server.url.origin
  let opened = false
  const app = new Hono().route(
    "/mcp",
    createMcpRoutes({
      getRuntime: async () => runtime,
      saveConfig: async () => {
        throw new Error("Not a config test")
      },
      openBrowser: async (url) => {
        const authorization = new URL(url)
        expect(authorization.origin).toBe(origin)
        const callbackUrl = authorization.searchParams.get("redirect_uri")
        const state = authorization.searchParams.get("state")
        if (!callbackUrl || !state) throw new Error("Missing OAuth callback state")
        const callback = new URL(callbackUrl)
        callback.searchParams.set("state", state)
        callback.searchParams.set("code", "sandbox-code")
        const response = await fetch(callback)
        expect(response.status).toBe(200)
        opened = true
      },
    }),
  )
  const headers = { "x-buddy-directory": directory, "content-type": "application/json" }
  try {
    await putProjectMcpConfig({
      directory,
      name: "docs",
      payload: { type: "remote", url: `${origin}/mcp`, oauth: { clientId: "sandbox-client" } },
    })
    const initial = await app.request("/mcp", { headers })
    expect(await initial.json()).toMatchObject({
      docs: { status: expect.stringMatching(/pending|needs_auth/u) },
    })
    const authenticated = await app.request("/mcp/docs/auth/authenticate", {
      method: "POST",
      headers,
    })
    expect(authenticated.status).toBe(200)
    expect(await authenticated.json()).toEqual({ status: "connected" })
    expect(opened).toBe(true)
    const removed = await app.request("/mcp/docs/auth", { method: "DELETE", headers })
    expect(removed.status).toBe(200)
    expect(await removed.json()).toEqual({ success: true })
    const pending = await app.request("/mcp/docs/auth", { method: "POST", headers })
    expect(pending.status).toBe(200)
    const started = z
      .object({ authorizationUrl: z.string(), attemptID: z.string() })
      .parse(await pending.json())
    const cancelled = await app.request("/mcp/docs/auth", { method: "DELETE", headers })
    expect(cancelled.status).toBe(200)
    const stale = await app.request("/mcp/docs/auth/callback", {
      method: "POST",
      headers,
      body: JSON.stringify({ attemptID: started.attemptID }),
    })
    expect(stale.status).toBe(404)
    await runtime.mcp.disconnect(directory, "docs")
    await runtime.mcp.connect(directory, "docs")
    expect(
      (await runtime.mcp.servers(directory)).find((server) => server.name === "docs")?.status
        .status,
    ).toMatch(/pending|needs_auth/u)
    await putProjectMcpConfig({
      directory,
      name: "manual",
      payload: { type: "remote", url: `${origin}/mcp` },
    })
    const registration = await app.request("/mcp/manual/auth", { method: "POST", headers })
    expect(registration.status).toBe(400)
    expect(await registration.json()).toMatchObject({ code: "McpClientRegistrationRequired" })
    const pastedCode = await app.request("/mcp/docs/auth/callback", {
      method: "POST",
      headers,
      body: JSON.stringify({ code: "ignored-code" }),
    })
    expect(pastedCode.status).toBe(400)
    expect(await pastedCode.json()).toMatchObject({ code: "McpPastedCodeUnsupported" })
  } finally {
    await server.stop(true)
  }
})
