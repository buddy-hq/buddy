import type {
  PermissionReply as PermissionDecision,
  PermissionReplyInput,
} from "@buddy/transcript-contract/permission"

export type PermissionReply = PermissionDecision | PermissionReplyInput
export type { PermissionRequest, SavedPermission } from "@buddy/transcript-contract/permission"

export { permissionReplyInput } from "@buddy/transcript-contract/permission"
