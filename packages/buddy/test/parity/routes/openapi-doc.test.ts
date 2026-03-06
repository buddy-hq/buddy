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
      "/api/global/config",
      "/api/global/dispose",
      "/api/config/agents",
      "/api/config/personas",
      "/api/config",
      "/api/config/providers",
      "/api/project",
      "/api/project/current",
      "/api/project/{projectID}",
      "/api/permission",
      "/api/permission/{requestID}/reply",
      "/api/session",
      "/api/session/{sessionID}",
      "/api/session/{sessionID}/message",
      "/api/session/{sessionID}/abort",
      "/api/learner/state",
      "/api/learner/goals",
      "/api/learner/progress",
      "/api/learner/review",
      "/api/learner/curriculum-view",
      "/api/learner/context",
      "/api/learner/rebuild",
    ]

    for (const path of requiredPaths) {
      expect(paths[path]).toBeDefined()
    }

    const requiredOperations = [
      { path: "/api/health", method: "get", operationId: "health.check" },
      { path: "/api/event", method: "get", operationId: "event.stream" },
      { path: "/api/global/config", method: "get", operationId: "global.config.get" },
      { path: "/api/global/config", method: "patch", operationId: "global.config.patch" },
      { path: "/api/global/dispose", method: "post", operationId: "global.dispose" },
      { path: "/api/config/agents", method: "get", operationId: "config.agents" },
      { path: "/api/config/personas", method: "get", operationId: "config.personas" },
      { path: "/api/project", method: "get", operationId: "project.list" },
      { path: "/api/project/current", method: "get", operationId: "project.current" },
      { path: "/api/project/{projectID}", method: "patch", operationId: "project.update" },
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
      { path: "/api/learner/state", method: "get", operationId: "learner.state" },
      { path: "/api/learner/goals", method: "get", operationId: "learner.goals" },
      { path: "/api/learner/progress", method: "get", operationId: "learner.progress" },
      { path: "/api/learner/review", method: "get", operationId: "learner.review" },
      { path: "/api/learner/curriculum-view", method: "get", operationId: "learner.curriculumView" },
      { path: "/api/learner/context", method: "post", operationId: "learner.context" },
      { path: "/api/learner/rebuild", method: "post", operationId: "learner.rebuild" },
    ] as const

    for (const operation of requiredOperations) {
      const methodDoc = paths[operation.path]?.[operation.method]
      expect(methodDoc?.operationId).toBe(operation.operationId)
    }
  })
})
