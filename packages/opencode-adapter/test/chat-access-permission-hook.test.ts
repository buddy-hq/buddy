import { expect, test } from "bun:test"
import { Schema } from "effect"
import type { ExtensionHooks } from "@buddy/agent-runtime/extension"
import type { OpenCodeHost } from "../src/host"
import { Session } from "@opencode/schema/session"
import type { PermissionEvaluation } from "@opencode/plugin/promise/permission"
import type { Context as PluginContext } from "@opencode/plugin/promise/plugin"
import { registerExtensionHooks } from "../src/extension/hooks"

function evaluation(
  effect: PermissionEvaluation["effect"],
  action = "shell",
): PermissionEvaluation {
  return {
    sessionID: Schema.decodeUnknownSync(Session.ID)("ses_access"),
    action,
    resources: ["echo hi"],
    effect,
  }
}

const sessionHook: PluginContext["session"]["hook"] = async () => ({
  dispose: async () => undefined,
})

const toolHook: PluginContext["tool"]["hook"] = async () => ({
  dispose: async () => undefined,
})

async function registered(permission: ExtensionHooks["permission"]) {
  let evaluate: ((event: PermissionEvaluation) => Promise<void> | void) | undefined
  const permissionHook: PluginContext["permission"]["hook"] = async (name, callback) => {
    if (name === "evaluate") evaluate = callback
    return { dispose: async () => undefined }
  }
  const hooks: ExtensionHooks = {
    async hydrate() {},
    async compaction() {},
    async prompt() {},
    async context() {
      return { system: [] }
    },
    async beforeTool() {},
    permission,
  }
  await registerExtensionHooks(
    {
      session: {
        hook: sessionHook,
        context: async () => {
          throw new Error("session context is not used by the permission hook")
        },
      },
      tool: { hook: toolHook },
      permission: { hook: permissionHook },
    },
    hooks,
    async (): Promise<Pick<OpenCodeHost, "message">> => {
      throw new Error("message client is not used by the permission hook")
    },
  )
  if (evaluate === undefined) throw new Error("Permission evaluate hook was not registered")
  return evaluate
}

test("allow and ask take the extension result and deny stays untouched", async () => {
  const seen: string[] = []
  const evaluate = await registered(async (input) => {
    seen.push(`${input.effect}:${input.action}`)
    if (input.effect === "allow" && input.action === "shell") return "ask"
    if (input.effect === "ask" && input.action === "shell") return "allow"
    return input.effect
  })
  const asked = evaluation("ask")
  await evaluate(asked)
  expect(asked.effect).toBe("allow")
  const supervised = evaluation("allow", "shell")
  await evaluate(supervised)
  expect(supervised.effect).toBe("ask")
  const allowed = evaluation("allow", "edit")
  await evaluate(allowed)
  const denied = evaluation("deny", "edit")
  await evaluate(denied)
  expect(allowed.effect).toBe("allow")
  expect(denied.effect).toBe("deny")
  expect(seen).toEqual(["ask:shell", "allow:shell", "allow:edit"])
})

test("a permission hook failure leaves ask unchanged", async () => {
  const recorded: unknown[][] = []
  const original = console.error
  console.error = (...args) => {
    recorded.push(args)
  }
  try {
    const evaluate = await registered(async () => {
      throw new Error("session store unavailable")
    })
    const asked = evaluation("ask")
    await evaluate(asked)
    expect(asked.effect).toBe("ask")
    expect(recorded[0]?.[0]).toBe("Chat access permission hook failed")
  } finally {
    console.error = original
  }
})
