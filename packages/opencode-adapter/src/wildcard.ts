import { matchPermissionPattern } from "@buddy/transcript-contract/permission-rules"

export const Wildcard = {
  match(input: string, pattern: string) {
    return matchPermissionPattern(input, pattern, process.platform === "win32" ? "win32" : "posix")
  },
}
