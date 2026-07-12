import { Bookmark, XIcon } from "lucide-react"
import { useState } from "react"
import type { GetStartedChat } from "@/lib/get-started-chats"

type GetStartedChatsProps = {
  chats: readonly GetStartedChat[]
  disabled?: boolean
  onStart: (chat: GetStartedChat) => Promise<void> | void
  onDismiss: () => void
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
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-text-weak">
          <Bookmark className="size-3 shrink-0 text-text-interactive-base" />
          <h2 id="get-started-chats-title" className="min-w-0 truncate">
            Get started
          </h2>
        </div>
        <button
          type="button"
          data-action="dismiss-get-started-chats"
          aria-label="Hide Get Started"
          title="Hide Get Started"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-text-weaker outline-none transition-colors hover:bg-surface-raised-base-hover hover:text-text-base focus-visible:ring-2 focus-visible:ring-border-interactive-base"
          onClick={props.onDismiss}
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="space-y-0.5 pl-4">
        {props.chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            data-action="get-started-chat"
            data-get-started-chat={chat.id}
            disabled={props.disabled || Boolean(startingChatID)}
            className="group/get-started flex w-full items-center rounded-lg px-2 py-1 text-left text-text-weak outline-none transition-colors duration-150 hover:bg-surface-raised-base-hover hover:text-text-strong focus-visible:ring-2 focus-visible:ring-border-interactive-base disabled:cursor-wait disabled:opacity-70"
            onClick={() => {
              void startChat(chat)
            }}
          >
            <span className="min-w-0 flex-1 truncate text-xs font-light">
              {chat.title}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
