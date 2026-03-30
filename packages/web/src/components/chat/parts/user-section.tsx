import { memo, useMemo } from "react"
import type { MessageWithParts, ProviderInfo } from "@/state/chat-types"
import { FileAttachmentPart } from "./file-attachment"
import { UserMessagePart } from "./user-message"
import { isAttachmentFilePart } from "../shared/highlighted-text"
import type { UserSectionProps } from "../types"

export const UserSection = memo(function UserSection({
  userMessage,
  providers,
  onForkMessage,
  onRevertMessage,
}: UserSectionProps) {
  const userParts = useMemo(() => userMessage?.parts ?? [], [userMessage?.parts])
  const userFileParts = useMemo(() => userParts.filter((part) => part.type === "file"), [userParts])
  const userAttachmentParts = useMemo(
    () => userFileParts.filter(isAttachmentFilePart),
    [userFileParts],
  )
  const userInlineFileParts = useMemo(
    () => userFileParts.filter((part) => !isAttachmentFilePart(part)),
    [userFileParts],
  )
  const userAgentParts = useMemo(
    () => userParts.filter((part) => part.type === "agent"),
    [userParts],
  )
  const userTextParts = useMemo(() => userParts.filter((part) => part.type === "text"), [userParts])

  if (!userMessage) return null

  return (
    <div className="ml-auto flex w-fit flex-col items-end gap-2 text-sm">
      <div className="group/user flex w-full flex-col items-end gap-2">
        {userAttachmentParts.length > 0 ? (
          <div className="flex w-fit max-w-[min(82%,64ch)] flex-wrap justify-end gap-2">
            {userAttachmentParts.map((part) => (
              <FileAttachmentPart key={part.id} part={part} />
            ))}
          </div>
        ) : null}
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
