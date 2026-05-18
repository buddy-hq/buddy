import { createContext, useContext, useMemo, type ReactNode, type RefObject } from "react"

type ChatScrollContextValue = {
  viewportRef?: RefObject<HTMLElement | null>
}

const ChatScrollContext = createContext<ChatScrollContextValue>({})

export function ChatScrollProvider(props: {
  viewportRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const value = useMemo(() => ({ viewportRef: props.viewportRef }), [props.viewportRef])

  return <ChatScrollContext.Provider value={value}>{props.children}</ChatScrollContext.Provider>
}

export function useChatScrollViewport(): RefObject<HTMLElement | null> | undefined {
  return useContext(ChatScrollContext).viewportRef
}
