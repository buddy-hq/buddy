import { createHash, randomUUID } from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import z from "zod"

const registrationSchema = z.object({ redirect_uris: z.array(z.string().url()).min(1) }).passthrough()
const rpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
})

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

function json<Body>(response: ServerResponse, status: number, body: Body) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
  response.end(JSON.stringify(body))
}

export async function createOAuthMcpServer() {
  const registrations: z.infer<typeof registrationSchema>[] = []
  const clientID = randomUUID()
  const accessToken = randomUUID()
  const codes = new Map<string, { redirectURI: string; challenge: string }>()
  let origin = ""

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", origin)
    const resource = `${origin}/mcp`
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      return json(response, 200, { resource, authorization_servers: [origin], scopes_supported: ["tools:read"] })
    }
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-authorization-server") {
      return json(response, 200, {
        issuer: origin,
        registration_endpoint: `${origin}/register`,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["tools:read"],
      })
    }
    if (request.method === "POST" && url.pathname === "/register") {
      const body = registrationSchema.parse(JSON.parse(await readBody(request)))
      registrations.push(body)
      return json(response, 201, { ...body, client_id: clientID })
    }
    if (request.method === "GET" && url.pathname === "/authorize") {
      const params = url.searchParams
      const redirectURI = params.get("redirect_uri") ?? ""
      const challenge = params.get("code_challenge") ?? ""
      const state = params.get("state") ?? ""
      if (
        params.get("client_id") !== clientID ||
        params.get("response_type") !== "code" ||
        params.get("resource") !== resource ||
        params.get("code_challenge_method") !== "S256" ||
        !challenge || !state ||
        !registrations.some((registration) => registration.redirect_uris.includes(redirectURI))
      ) return json(response, 400, { error: "invalid_request" })
      const redirect = new URL(redirectURI)
      if (redirect.protocol !== "http:" || redirect.hostname !== "127.0.0.1") {
        return json(response, 400, { error: "invalid_request" })
      }
      const code = randomUUID()
      codes.set(code, { redirectURI, challenge })
      redirect.searchParams.set("code", code)
      redirect.searchParams.set("state", state)
      response.writeHead(302, { location: redirect.href, "cache-control": "no-store" }).end()
      return
    }
    if (request.method === "POST" && url.pathname === "/token") {
      const params = new URLSearchParams(await readBody(request))
      const code = params.get("code") ?? ""
      const authorization = codes.get(code)
      if (
        !authorization ||
        params.get("grant_type") !== "authorization_code" ||
        params.get("client_id") !== clientID ||
        params.get("resource") !== resource ||
        params.get("redirect_uri") !== authorization.redirectURI ||
        createHash("sha256").update(params.get("code_verifier") ?? "").digest("base64url") !== authorization.challenge
      ) return json(response, 400, { error: "invalid_grant" })
      codes.delete(code)
      return json(response, 200, { access_token: accessToken, token_type: "Bearer", scope: "tools:read" })
    }
    if (url.pathname !== "/mcp") return json(response, 404, { error: "not_found" })
    if (request.headers.authorization !== `Bearer ${accessToken}`) {
      response.setHeader("www-authenticate", `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="tools:read"`)
      return json(response, 401, { error: "unauthorized" })
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST")
      response.writeHead(405).end()
      return
    }
    const rpc = rpcSchema.parse(JSON.parse(await readBody(request)))
    if (rpc.id === undefined) {
      response.writeHead(202).end()
      return
    }
    const reply = <Result>(result: Result) => json(response, 200, { jsonrpc: "2.0", id: rpc.id, result })
    if (rpc.method === "initialize") {
      return reply({
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "Local OAuth MCP", version: "1.0.0" },
      })
    }
    if (rpc.method === "tools/list") {
      return reply({ tools: [{ name: "fixture_status", description: "Read the local fixture status", inputSchema: { type: "object", properties: {} } }] })
    }
    if (rpc.method === "ping") return reply({})
    return json(response, 200, { jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: "Method not found" } })
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch(() => json(response, 400, { error: "invalid_request" }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve() })
  })
  const address = server.address()
  if (!address || z.string().safeParse(address).success) throw new Error("OAuth MCP fixture did not bind a TCP port")
  const { port } = z.object({ port: z.number() }).parse(address)
  origin = `http://127.0.0.1:${port}`

  return {
    origin,
    url: `${origin}/mcp`,
    registrations,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
    },
  }
}
