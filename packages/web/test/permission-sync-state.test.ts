import { beforeEach, describe, expect, test } from "bun:test"
import { useChatStore } from "../src/state/chat-store"

const directory = "/tmp/permission-sync"
beforeEach(() => {
  localStorage.clear()
  useChatStore.setState({ directories: {}, lastSessionByDirectory: {}, openProjects: [] })
})

describe("pending permission state", () => {
  test("keeps child requests visible in the parent chat and clears each cascaded reply", () => {
    const store = useChatStore.getState()
    store.ensureOpenProject(directory)
    store.setSessions(directory, [
      { id: "parent", title: "Parent", time: { created: 1, updated: 1 } },
      { id: "child", parentID: "parent", title: "Child", time: { created: 2, updated: 2 } },
      { id: "other", title: "Other", time: { created: 3, updated: 3 } },
    ])
    store.setActiveSession(directory, "child")
    store.setPendingPermissions(directory, [
      { id: "per_child_one", sessionID: "child", action: "shell", resources: ["ls"] },
      { id: "per_child_two", sessionID: "child", action: "read", resources: ["file"] },
      { id: "per_other", sessionID: "other", action: "read", resources: ["other"] },
    ])
    store.setActiveSession(directory, "parent")
    expect(
      useChatStore
        .getState()
        .directories[directory]?.pendingPermissions.map((request) => request.id),
    ).toEqual(["per_child_one", "per_child_two"])
    store.applyPermissionReplied(directory, "per_child_one")
    store.applyPermissionReplied(directory, "per_child_two")
    expect(useChatStore.getState().directories[directory]?.pendingPermissions).toEqual([])
  })
  test("an authoritative reconnect list removes requests whose replies were missed", () => {
    const store = useChatStore.getState()
    store.ensureOpenProject(directory)
    store.applyPermissionAsked(directory, {
      id: "per_stale",
      sessionID: "parent",
      action: "shell",
      resources: ["ls"],
    })
    store.setPendingPermissions(directory, [])
    expect(useChatStore.getState().directories[directory]?.pendingPermissions).toEqual([])
  })
})
