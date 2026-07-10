import { LoaderCircleIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"
import type { GetStartedChat } from "@/lib/get-started-chats"

type GetStartedChatsProps = {
  chats: readonly GetStartedChat[]
  disabled?: boolean
  onStart: (chat: GetStartedChat) => Promise<void> | void
}

export function GetStartedChats(props: GetStartedChatsProps) {
  const [startingChatID, setStartingChatID] = useState<GetStartedChat["id"] | undefined>(
    undefined,
  )

  async function startChat(chat: GetStartedChat) {
    if (startingChatID || props.disabled) return

    setStartingChatID(chat.id)
    try {
      await props.onStart(chat)
    } finally {
      setStartingChatID(undefined)
    }
  }

  if (props.chats.length === 0) return null

  return (
    <section
      aria-labelledby="get-started-chats-title"
      data-component="get-started-chats"
      className="mb-3 space-y-1"
    >
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-text-weak">
        <SparklesIcon className="size-3 text-text-interactive-base" />
        <h2 id="get-started-chats-title">Get started</h2>
      </div>
      <div className="space-y-0.5">
        {props.chats.map((chat) => {
          const isStarting = startingChatID === chat.id
          return (
            <button
              key={chat.id}
              type="button"
              data-action="get-started-chat"
              data-get-started-chat={chat.id}
              disabled={props.disabled || Boolean(startingChatID)}
              className="group/get-started flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-surface-raised-base-hover focus-visible:ring-2 focus-visible:ring-border-interactive-base disabled:cursor-wait disabled:opacity-70"
              onClick={() => {
                void startChat(chat)
              }}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border-weaker-base bg-surface-raised-base text-icon-base group-hover/get-started:border-border-interactive-base/50 group-hover/get-started:text-icon-interactive-base">
                {isStarting ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="size-3.5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-base group-hover/get-started:text-text-strong">
                  {chat.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-text-weak">
                  {chat.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
