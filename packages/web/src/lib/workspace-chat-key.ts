const WORKSPACE_CHAT_DRAFT_KEY = "draft"
const WORKSPACE_CHAT_SESSION_KEY_PREFIX = "session:"
const WORKSPACE_CHAT_TRANSITION_KEY_PREFIX = "transition:"

export type PersistedWorkspaceChatKey =
  | typeof WORKSPACE_CHAT_DRAFT_KEY
  | `${typeof WORKSPACE_CHAT_SESSION_KEY_PREFIX}${string}`

export type WorkspaceChatKey =
  | PersistedWorkspaceChatKey
  | `${typeof WORKSPACE_CHAT_TRANSITION_KEY_PREFIX}${number}`

export function workspaceChatKeyForSession(sessionID: string | undefined): PersistedWorkspaceChatKey {
  const normalizedSessionID = sessionID?.trim()
  return normalizedSessionID
    ? `${WORKSPACE_CHAT_SESSION_KEY_PREFIX}${normalizedSessionID}`
    : WORKSPACE_CHAT_DRAFT_KEY
}

export function workspaceChatKeyForTransition(transitionID: number): WorkspaceChatKey {
  return `${WORKSPACE_CHAT_TRANSITION_KEY_PREFIX}${transitionID}`
}

export function isPersistedWorkspaceChatKey(value: string): value is PersistedWorkspaceChatKey {
  return (
    value === WORKSPACE_CHAT_DRAFT_KEY ||
    (value.startsWith(WORKSPACE_CHAT_SESSION_KEY_PREFIX) &&
      value.length > WORKSPACE_CHAT_SESSION_KEY_PREFIX.length)
  )
}

export function workspaceSessionIDFromChatKey(
  chatKey: WorkspaceChatKey,
): string | undefined {
  if (!chatKey.startsWith(WORKSPACE_CHAT_SESSION_KEY_PREFIX)) return undefined
  return chatKey.slice(WORKSPACE_CHAT_SESSION_KEY_PREFIX.length)
}

export {
  WORKSPACE_CHAT_DRAFT_KEY,
  WORKSPACE_CHAT_SESSION_KEY_PREFIX,
  WORKSPACE_CHAT_TRANSITION_KEY_PREFIX,
}
