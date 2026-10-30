import { queryOptions, skipToken } from "@tanstack/react-query"
import type { PromptAccessMode } from "@/components/prompt/components/prompt-access-mode-select"
import { getBuddyClient, requireBuddyData } from "../buddy-client"

export const chatAccessQueryKeys = {
  directory: (directory: string) => ["directory-chat", "access", directory] as const,
  session: (directory: string, sessionID: string | undefined) =>
    ["directory-chat", "access", directory, sessionID] as const,
}

export function chatAccessQueryOptions(directory: string, sessionID: string | undefined) {
  return queryOptions({
    queryKey: chatAccessQueryKeys.session(directory, sessionID),
    queryFn:
      directory && sessionID
        ? async ({ signal }) =>
            requireBuddyData(
              await getBuddyClient(directory).session.access({ sessionID }, { signal }),
            )
        : skipToken,
    staleTime: 0,
  })
}

export async function setChatAccessMode(
  directory: string,
  sessionID: string,
  mode: PromptAccessMode,
): Promise<{ mode: PromptAccessMode }> {
  return requireBuddyData(await getBuddyClient(directory).session.setAccess({ sessionID, mode }))
}
