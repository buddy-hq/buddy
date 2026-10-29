import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { getServerConnection, setRuntimeServerConnection } from "../src/context/server"
import { replyPermission } from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"
import type { PermissionRequest } from "../src/state/permission-types"
import { installTestFetch, restoreTestFetch } from "./test-utils"

const directory = "/workspace/permission-reply"
const permission: PermissionRequest = {
  id: "request-child",
  sessionID: "child",
  action: "read",
  resources: ["private.md"],
}
const originalFetch = globalThis.fetch
const serverConnection = getServerConnection()

beforeEach(() => {
  localStorage.clear()
  useChatStore.setState({ directories: {}, lastSessionByDirectory: {}, openProjects: [] })
  const store = useChatStore.getState()
  store.ensureOpenProject(directory)
  store.setSessions(directory, [
    { id: "selected", title: "Selected chat", time: { created: 1, updated: 1 } },
  ])
  store.setActiveSession(directory, "selected")
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
})

afterEach(() => {
  restoreTestFetch(originalFetch)
  setRuntimeServerConnection(serverConnection)
  useChatStore.setState({ directories: {}, lastSessionByDirectory: {}, openProjects: [] })
})

describe("permission replies", () => {
  test("sends the request's sessionID when the selected chat's local lookup has no request", async () => {
    const requests: Request[] = []
    installTestFetch(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(request)
      return Response.json(request.method === "POST" ? true : [])
    })
    expect(useChatStore.getState().directories[directory]?.pendingPermissions).toEqual([])
    await expect(replyPermission({ directory, request: permission, reply: "once" })).resolves.toBe(
      true,
    )
    const reply = requests.find((request) => request.method === "POST")
    expect(reply).toBeDefined()
    if (!reply) throw new Error("Permission reply was not sent")
    expect(new URL(reply.url).searchParams.get("sessionID")).toBe("child")
    expect(new URL(reply.url).pathname).toBe("/api/permission/request-child/reply")
    expect(await reply.json()).toEqual({ reply: "once" })
  })

  test("reloads the selected chat and fails without sending an unscoped reply if the request has no sessionID", async () => {
    const requests: Request[] = []
    installTestFetch(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(request)
      return Response.json(request.method === "POST" ? true : [])
    })
    const incomplete = { ...permission }
    Reflect.deleteProperty(incomplete, "sessionID")
    await expect(
      replyPermission({ directory, request: incomplete, reply: "once" }),
    ).rejects.toMatchObject({ message: "Could not reply. Try again." })
    expect(
      requests.map((request) => ({
        method: request.method,
        path: new URL(request.url).pathname,
        sessionID: new URL(request.url).searchParams.get("sessionID"),
      })),
    ).toEqual([{ method: "GET", path: "/api/permission", sessionID: "selected" }])
  })
})
