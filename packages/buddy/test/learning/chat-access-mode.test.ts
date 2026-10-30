import { afterEach, expect, test } from "bun:test"
import type { SessionAccess, SessionView } from "@buddy/agent-runtime/extension"
import type { JsonObject } from "@buddy/agent-runtime/common"
import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import { createBuddyHooks } from "../../src/runtime/buddy-hooks"
import { closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { tmpdir } from "../helpers/tmpdir"

afterEach(closeAgentRuntime)

function view(id: string, parentID?: string, metadata?: JsonObject): SessionView {
  const rules: PermissionRuleset = []
  if (parentID !== undefined && metadata !== undefined) return { id, rules, parentID, metadata }
  if (parentID !== undefined) return { id, rules, parentID }
  if (metadata !== undefined) return { id, rules, metadata }
  return { id, rules }
}

function sessionAccess(sessions: readonly SessionView[]): SessionAccess {
  const byID = new Map(sessions.map((session) => [session.id, session]))
  return {
    async get(sessionID) {
      const session = byID.get(sessionID)
      if (session === undefined) throw new Error(`Missing session ${sessionID}`)
      return session
    },
    async patchMetadata() {},
    async setRules() {},
    async agentRules() {
      return []
    },
    async toolPermissions() {
      return {}
    },
  }
}

test("full access turns ask into allow for the root and its children", async () => {
  await using directory = await temporaryDirectory({ prefix: "chat-access-mode-" })
  const stored = sessionAccess([
    view("root", undefined, { buddyAccess: { mode: "full" } }),
    view("child", "root", { buddyAccess: { mode: "supervised" } }),
    view("grandchild", "child"),
    view("plain"),
  ])
  const permission = createBuddyHooks({ directory: directory.path }, stored).permission
  const ask = { action: "shell", resources: ["echo hi"], effect: "ask" as const }
  expect(await permission({ ...ask, sessionID: "root" })).toBe("allow")
  expect(await permission({ ...ask, sessionID: "child" })).toBe("allow")
  expect(await permission({ ...ask, sessionID: "grandchild" })).toBe("allow")
  expect(await permission({ ...ask, sessionID: "plain" })).toBe("ask")
  expect(await permission({ ...ask, sessionID: "root", effect: "allow" })).toBe("allow")
})

test("a lookup failure leaves the incoming effect", async () => {
  await using directory = await temporaryDirectory({ prefix: "chat-access-mode-" })
  const stored = sessionAccess([
    view("invalid", undefined, { buddyAccess: { mode: "full", extra: true } }),
    view("cycle-a", "cycle-b"),
    view("cycle-b", "cycle-a", { buddyAccess: { mode: "full" } }),
  ])
  const missing: SessionAccess = {
    ...stored,
    async get() {
      throw new Error("session store unavailable")
    },
  }
  const ask = { action: "shell", resources: ["echo hi"], effect: "ask" as const }
  const allow = { action: "shell", resources: ["echo hi"], effect: "allow" as const }
  const permission = createBuddyHooks({ directory: directory.path }, stored).permission
  const failed = createBuddyHooks({ directory: directory.path }, missing).permission
  expect(await permission({ ...ask, sessionID: "invalid" })).toBe("ask")
  expect(await permission({ ...allow, sessionID: "invalid" })).toBe("allow")
  expect(await permission({ ...ask, sessionID: "cycle-a" })).toBe("ask")
  expect(await failed({ ...ask, sessionID: "root" })).toBe("ask")
  expect(await failed({ ...allow, sessionID: "root" })).toBe("allow")
})

test("supervised asks for shell, edit, webfetch, and websearch allows", async () => {
  await using project = await tmpdir({ git: true })
  const stored = sessionAccess([
    view("root", undefined, { buddyAccess: { mode: "supervised" } }),
    view("child", "root"),
    view("plain"),
  ])
  const permission = createBuddyHooks({ directory: project.path }, stored).permission
  const allow = { resources: ["echo hi"], effect: "allow" as const }
  expect(await permission({ ...allow, sessionID: "root", action: "shell" })).toBe("ask")
  expect(await permission({ ...allow, sessionID: "child", action: "shell" })).toBe("ask")
  expect(await permission({ ...allow, sessionID: "root", action: "edit" })).toBe("ask")
  expect(await permission({ ...allow, sessionID: "root", action: "webfetch" })).toBe("ask")
  expect(await permission({ ...allow, sessionID: "root", action: "websearch" })).toBe("ask")
  expect(await permission({ ...allow, sessionID: "root", action: "read" })).toBe("allow")
  expect(await permission({ ...allow, sessionID: "plain", action: "shell" })).toBe("allow")
  expect(
    await permission({
      sessionID: "root",
      action: "shell",
      resources: ["echo hi"],
      effect: "ask",
    }),
  ).toBe("ask")
})
