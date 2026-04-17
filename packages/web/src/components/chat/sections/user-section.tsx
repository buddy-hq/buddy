import { memo, useMemo } from "react"
import { FileAttachmentPart } from "../parts/file-attachment"
import { UserMessagePart } from "../parts/user-message"
import {
  isChatAgentPart,
  isChatFilePart,
  isChatTextPart,
  type ChatFilePart,
} from "../utils/part-guards"

import type { UserSectionProps } from "../types"

function isAttachmentFilePart(part: ChatFilePart) {
  return part.mime.startsWith("image/") || part.mime === "application/pdf"
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
  const userTextParts = useMemo(() => userParts.filter(isChatTextPart), [userParts])
  const hasVisibleContent = userAttachmentParts.length > 0 || userTextParts.length > 0

  if (!userMessage || !hasVisibleContent) return null

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
