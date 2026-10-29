import type { PermissionReplyInput, PermissionRequest, SavedPermission } from "@buddy/transcript-contract/permission"
import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"

export type ApprovalScope = { readonly sessions: readonly string[] }

export type ApprovalReply = PermissionReplyInput & {
  readonly sessionID: string
  readonly requestID: string
}

export type SessionRules = {
  readonly rules: PermissionRuleset
  readonly hasParentSession: boolean
  readonly agent?: string
}

export type SessionRulesUpdate = "updated" | "unchanged" | "missing"

export interface Approvals {
  pending(scope: ApprovalScope): Promise<PermissionRequest[]>
  get(sessionID: string, requestID: string): Promise<PermissionRequest>
  reply(input: ApprovalReply): Promise<void>
  saved(directory: string): Promise<SavedPermission[]>
  forget(directory: string, savedID: string): Promise<boolean>
  sessionRules(sessionID: string): Promise<SessionRules | undefined>
  updateSessionRules(sessionID: string, update: (rules: PermissionRuleset, hasParentSession: boolean) => PermissionRuleset): Promise<SessionRulesUpdate>
}
