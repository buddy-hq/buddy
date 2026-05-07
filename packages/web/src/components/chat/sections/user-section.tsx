import { memo, useMemo } from "react"
import { FileAttachmentPart } from "../parts/file-attachment"
import { UserMessagePart } from "../parts/user-message"
import {
  isChatAgentPart,
  isChatFilePart,
  isChatTextPart,
  readChatReadingSelectionPart,
  type ChatFilePart,
  type ChatTextPart,
} from "../utils/part-guards"
import { isHiddenFromUserMessage } from "../utils/message-visibility"
import { readPromptReadingSelectionMetadata } from "@/components/prompt/prompt-types"
import type { MessagePart } from "@/state/chat-types"

import type { UserSectionProps } from "../types"

function isAttachmentFilePart(part: ChatFilePart) {
  return part.mime.startsWith("image/") || part.mime === "application/pdf"
}

function isVisibleUserTextPart(part: MessagePart): part is ChatTextPart {
  return isChatTextPart(part) && readPromptReadingSelectionMetadata(part.metadata) === undefined
}

export const UserSection = memo(function UserSection({
  userMessage,
  providers,
  onForkMessage,
  onRevertMessage,
}: UserSectionProps) {
  const userParts = useMemo(() => userMessage?.parts ?? [], [userMessage?.parts])
  const userFileParts = useMemo(() => userParts.filter(isChatFilePart), [userParts])
  const userAttachmentParts = useMemo(
    () => userFileParts.filter(isAttachmentFilePart),
    [userFileParts],
  )
  const userInlineFileParts = useMemo(
    () => userFileParts.filter((part) => !isAttachmentFilePart(part)),
    [userFileParts],
  )
  const userAgentParts = useMemo(() => userParts.filter(isChatAgentPart), [userParts])
  const userReadingSelectionParts = useMemo(
    () => userParts.map(readChatReadingSelectionPart).filter((part) => part !== undefined),
    [userParts],
  )
  const userTextParts = useMemo(() => userParts.filter(isVisibleUserTextPart), [userParts])
  const hasVisibleContent =
    userAttachmentParts.length > 0 ||
    userReadingSelectionParts.length > 0 ||
    userTextParts.length > 0

  if (!userMessage || !hasVisibleContent) return null
  if (isHiddenFromUserMessage(userMessage)) {
    return null
  }

  return (
    <div className="flex w-full flex-col items-end gap-2 text-sm">
      <div className="group/user flex w-full flex-col items-end gap-2">
        {userAttachmentParts.length > 0 ? (
          <div className="flex w-fit max-w-[min(82%,64ch)] flex-wrap justify-end gap-2">
            {userAttachmentParts.map((part) => (
              <FileAttachmentPart key={part.id} part={part} />
            ))}
          </div>
        ) : null}
        {userReadingSelectionParts.map((part) => {
          const metadata = [part.tocLabel, part.pageLabel, part.locationLabel]
            .filter((value) => typeof value === "string" && value.length > 0)
            .join(" • ")

          return (
            <div
              key={part.id}
              className="ml-auto flex w-fit max-w-[min(82%,64ch)] flex-col gap-1 rounded-lg border border-border-weak-base bg-surface-base px-3 py-2"
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                Selected passage
              </div>
              <div className="whitespace-pre-wrap break-words text-sm text-text-base">
                {part.text}
              </div>
              {metadata ? <div className="text-xs text-text-weak">{metadata}</div> : null}
            </div>
          )
        })}
        {userTextParts.map((part) => (
          <UserMessagePart
            key={part.id}
            part={part}
            info={userMessage.info}
            references={userInlineFileParts}
            agents={userAgentParts}
            providers={providers}
            onForkMessage={
              onForkMessage
                ? () =>
                    onForkMessage({
                      sessionID: userMessage.info.sessionID,
                      messageID: userMessage.info.id,
                    })
                : undefined
            }
            onRevertMessage={
              onRevertMessage
                ? () =>
                    onRevertMessage({
                      sessionID: userMessage.info.sessionID,
                      messageID: userMessage.info.id,
                    })
                : undefined
            }
          />
        ))}
      </div>
    </div>
  )
})
