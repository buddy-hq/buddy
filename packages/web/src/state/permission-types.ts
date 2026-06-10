import type { PermissionReplyData } from "@buddy/sdk"

export type PermissionReply = NonNullable<PermissionReplyData["body"]>["reply"]
