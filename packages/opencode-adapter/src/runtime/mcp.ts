import { RuntimeError, type RuntimeErrorKind } from "@buddy/agent-runtime/errors"
import type { Mcp, McpServer, McpStatus } from "@buddy/agent-runtime/mcp"
import type { OpenCodeHost } from "../host"
import { toRuntimeError } from "./errors"
import type { OpenCodeRuntimeOptions } from "./options"

async function mcpRequest<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (cause) {
    const native = cause instanceof Error ? cause : new Error(String(cause))
    const error = toRuntimeError(cause, native.message || "MCP request failed")
    if (cause instanceof RuntimeError) throw error
    let kind: RuntimeErrorKind = "internal"
    if (
      /dynamic client registration|client registration.*not supported|client[_ ]id.*required/iu.test(
        native.message,
      )
    ) {
      kind = "invalid"
    } else {
      switch (native.name) {
        case "McpServerNotFoundError":
        case "IntegrationNotFoundError":
        case "IntegrationAttemptNotFoundError":
          kind = "not_found"
          break
        case "InvalidRequestError":
          kind = "invalid"
          break
      }
    }
    throw error.kind === kind
      ? error
      : new RuntimeError(kind, error.message, { subject: error.subject ?? "mcp", cause })
  }
}

function toBuddyMcpStatus(status: McpStatus): McpStatus {
  switch (status.status) {
    case "connected":
    case "pending":
    case "disabled":
      return { status: status.status }
    case "failed":
    case "needs_auth":
    case "needs_client_registration":
      return { status: status.status, error: status.error }
  }
}

export function createMcp(
  host: Pick<OpenCodeHost, "mcp" | "integration" | "credential">,
  _options: OpenCodeRuntimeOptions,
): Mcp {
  async function oauthServer(directory: string, name: string) {
    const result = await host.mcp.list({ location: { directory } })
    const server = result.data.find((server) => server.name === name)
    if (!server?.integrationID)
      throw new RuntimeError("not_found", "MCP server has no OAuth integration", { subject: "mcp" })
    return server.integrationID
  }

  return {
    servers: (directory) =>
      mcpRequest(async () => {
        const { data } = await host.mcp.list({ location: { directory } })
        return data.map(
          (server): McpServer =>
            Object.assign(
              {
                name: server.name,
                status: toBuddyMcpStatus(server.status),
              },
              server.integrationID === undefined
                ? undefined
                : { integrationID: server.integrationID },
            ),
        )
      }),
    connect: (directory, server) =>
      mcpRequest(async () => {
        await host.mcp.connect({ location: { directory }, server })
      }),
    disconnect: (directory, server) =>
      mcpRequest(async () => {
        await host.mcp.disconnect({ location: { directory }, server })
      }),
    startAuth: (directory, server) =>
      mcpRequest(async () => {
        const integrationID = await oauthServer(directory, server)
        const { data } = await host.integration.oauth.connect({
          location: { directory },
          integrationID,
          methodID: integrationID,
        })
        return {
          server,
          integrationID,
          attemptID: data.attemptID,
          url: data.url,
          expires: data.time.expires,
        }
      }),
    authProgress: (directory, attempt) =>
      mcpRequest(async () => {
        const { data } = await host.integration.oauth.status({
          location: { directory },
          integrationID: attempt.integrationID,
          attemptID: attempt.attemptID,
        })
        return data.status === "failed"
          ? { state: data.status, message: data.message }
          : { state: data.status }
      }),
    cancelAuth: (directory, attempt) =>
      mcpRequest(async () => {
        await host.integration.oauth.cancel({
          location: { directory },
          integrationID: attempt.integrationID,
          attemptID: attempt.attemptID,
        })
      }),
    removeCredentials: (directory, server) =>
      mcpRequest(async () => {
        const integrationID = await oauthServer(directory, server)
        const integration = await host.integration.get({ location: { directory }, integrationID })
        for (const connection of integration.data.connections) {
          if (connection.type === "credential")
            await host.credential.remove({ credentialID: connection.id })
        }
      }),
  }
}
