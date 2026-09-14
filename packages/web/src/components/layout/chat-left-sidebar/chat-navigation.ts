/** One chat row in sidebar order. `visible` is false in a collapsed notebook or behind "show more". */
export type SidebarChat = {
  directory: string
  sessionID: string
  visible: boolean
}

/**
 * The chat one row before or after the open one, stepping over hidden rows. A pinned subagent
 * chat is its own row; any other subagent chat is found through its root chat's row. With no
 * open chat in the list, it starts from the nearest end.
 */
export function stepSidebarChat(input: {
  chats: readonly SidebarChat[]
  directory: string
  activeSessionID?: string
  activeRootSessionID?: string
  step: 1 | -1
}): SidebarChat | undefined {
  const indexOf = (sessionID: string | undefined) =>
    input.chats.findIndex(
      (chat) => chat.directory === input.directory && chat.sessionID === sessionID,
    )
  const exactIndex = indexOf(input.activeSessionID)
  const index = exactIndex === -1 ? indexOf(input.activeRootSessionID) : exactIndex

  if (index === -1) {
    const visibleChats = input.chats.filter((chat) => chat.visible)
    return input.step === 1 ? visibleChats[0] : visibleChats.at(-1)
  }

  for (let next = index + input.step; next >= 0 && next < input.chats.length; next += input.step) {
    const chat = input.chats[next]
    if (chat?.visible) return chat
  }
  return undefined
}
