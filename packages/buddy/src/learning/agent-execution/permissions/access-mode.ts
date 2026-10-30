import type { PermissionHookEffect, PermissionHookInput, SessionAccess } from "@buddy/agent-runtime/extension"
import type { MetadataPatch } from "@buddy/agent-runtime/conversations"
import type { JsonObject } from "@buddy/agent-runtime/common"
import {
  evaluatePermission,
  type PermissionRuleset,
} from "@buddy/transcript-contract/permission-rules"
import z from "zod"
import { getAgentRuntime } from "../../../runtime/agent-runtime"

export const CHAT_ACCESS_MODES = ["supervised", "default", "full"] as const

export type ChatAccessMode = (typeof CHAT_ACCESS_MODES)[number]

const STORED_CHAT_ACCESS_MODES = ["supervised", "full"] as const
const CHAT_ACCESS_ROOT_WALK_LIMIT = 32
const SUPERVISED_CHAT_ACTIONS = new Set(["shell", "edit", "webfetch", "websearch"])

type ChatAccessRead =
  | { readonly kind: "mode"; readonly mode: ChatAccessMode }
  | { readonly kind: "unreadable" }

const storedChatAccessSchema = z
  .object({
    mode: z.enum(STORED_CHAT_ACCESS_MODES),
  })
  .strict()

function modeFromMetadata(metadata: JsonObject | undefined): ChatAccessRead {
  if (metadata === undefined || !Object.hasOwn(metadata, "buddyAccess")) {
    return { kind: "mode", mode: "default" }
  }
  const parsed = storedChatAccessSchema.safeParse(metadata.buddyAccess)
  if (!parsed.success) return { kind: "unreadable" }
  return { kind: "mode", mode: parsed.data.mode }
}

export async function readChatAccessMode(
  sessions: Pick<SessionAccess, "get">,
  sessionID: string,
): Promise<ChatAccessRead> {
  const seen = new Set<string>()
  let currentID = sessionID
  for (let depth = 0; depth < CHAT_ACCESS_ROOT_WALK_LIMIT; depth += 1) {
    if (seen.has(currentID)) return { kind: "unreadable" }
    seen.add(currentID)
    const session = await sessions.get(currentID).catch(() => undefined)
    if (session === undefined) return { kind: "unreadable" }
    if (session.parentID === undefined) return modeFromMetadata(session.metadata)
    currentID = session.parentID
  }
  return { kind: "unreadable" }
}

async function effectForChatAccess(
  directory: string,
  mode: ChatAccessMode,
  input: PermissionHookInput,
): Promise<PermissionHookEffect> {
  if (mode === "full" && input.effect === "ask") return "allow"
  if (mode !== "supervised") return input.effect
  if (input.effect !== "allow") return input.effect
  if (!SUPERVISED_CHAT_ACTIONS.has(input.action)) return input.effect
  const saved = await (await getAgentRuntime()).approvals.saved(directory)
  const rules: PermissionRuleset = saved.map((entry) => ({
    permission: entry.action,
    pattern: entry.resource,
    action: "allow",
  }))
  const platform = process.platform === "win32" ? "win32" : "posix"
  for (const resource of input.resources) {
    if (evaluatePermission(input.action, resource, rules, platform).action !== "allow") return "ask"
  }
  return input.effect
}

export async function chatAccessHookEffect(
  sessions: Pick<SessionAccess, "get">,
  directory: string,
  input: PermissionHookInput,
): Promise<PermissionHookEffect> {
  try {
    const read = await readChatAccessMode(sessions, input.sessionID)
    if (read.kind !== "mode") return input.effect
    return await effectForChatAccess(directory, read.mode, input)
  } catch {
    return input.effect
  }
}

export function chatAccessMetadataPatch(mode: ChatAccessMode): MetadataPatch {
  if (mode === "default") return { buddyAccess: undefined }
  return { buddyAccess: { mode } }
}
