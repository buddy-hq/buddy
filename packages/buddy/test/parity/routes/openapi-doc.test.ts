import { describe, expect, test } from "bun:test"
import { app } from "../../../src/index.ts"

describe("parity.routes.openapi-doc", () => {
  test("documents compatibility routes required by the web client", async () => {
    const response = await app.request("/doc")
    expect(response.status).toBe(200)

    const doc = (await response.json()) as {
      paths?: Record<string, Record<string, { operationId?: string }>>
    }

    const paths = doc.paths ?? {}
    const requiredPaths = [
      "/api/health",
      "/api/event",
      "/api/config",
      "/api/config/providers",
      "/api/permission",
      "/api/permission/{requestID}/reply",
      "/api/session",
      "/api/session/{sessionID}",
      "/api/session/{sessionID}/message",
      "/api/session/{sessionID}/abort",
      "/api/curriculum",
    ]

    for (const path of requiredPaths) {
      expect(paths[path]).toBeDefined()
    }

    const requiredOperations = [
      { path: "/api/session", method: "get", operationId: "session.list" },
      { path: "/api/session", method: "post", operationId: "session.create" },
      { path: "/api/session/{sessionID}", method: "get", operationId: "session.get" },
      { path: "/api/session/{sessionID}", method: "patch", operationId: "session.update" },
      { path: "/api/session/{sessionID}/message", method: "get", operationId: "session.messages" },
      { path: "/api/session/{sessionID}/message", method: "post", operationId: "session.prompt" },
      { path: "/api/session/{sessionID}/abort", method: "post", operationId: "session.abort" },
      { path: "/api/permission", method: "get", operationId: "permission.list" },
      { path: "/api/permission/{requestID}/reply", method: "post", operationId: "permission.reply" },
      { path: "/api/config/providers", method: "get", operationId: "config.providers" },
    ] as const

    for (const operation of requiredOperations) {
      const methodDoc = paths[operation.path]?.[operation.method]
      expect(methodDoc?.operationId).toBe(operation.operationId)
    }
  })
})
