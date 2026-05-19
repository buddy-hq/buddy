import { memo, useMemo } from "react"
import { FileAttachmentPart } from "../parts/file-attachment"
import { UserMessagePart } from "../parts/user-message"
import {
  isChatAgentPart,
  isChatFilePart,
  isChatTextPart,
  readChatReadingSelectionPart,
  type ChatAgentPart,
  type ChatFilePart,
  type ChatTextPart,
} from "../utils/part-guards"
import { isHiddenFromUserMessage } from "../utils/message-visibility"
import {
  readPromptReadingSelectionMetadata,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "@/components/prompt/prompt-types"
import type { MessagePart } from "@/state/chat-types"

import type { UserSectionProps } from "../types"

function isAttachmentFilePart(part: ChatFilePart) {
  return part.mime.startsWith("image/") || part.mime === "application/pdf"
}

function isVisibleUserTextPart(part: MessagePart): part is ChatTextPart {
  return (
    isChatTextPart(part) &&
    part.synthetic !== true &&
    readPromptReadingSelectionMetadata(part.metadata) === undefined
  )
}

type ChatWorkspaceFileReferencePart = MessagePart & {
  type: typeof WORKSPACE_FILE_REFERENCE_PART_TYPE
  path: string
}

type StandaloneReferencePart = ChatAgentPart | ChatFilePart | ChatWorkspaceFileReferencePart

function isChatWorkspaceFileReferencePart(
  part: MessagePart,
): part is ChatWorkspaceFileReferencePart {
  return part.type === WORKSPACE_FILE_REFERENCE_PART_TYPE && typeof part.path === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isStandaloneReferencePart(part: MessagePart): part is StandaloneReferencePart {
  return isChatAgentPart(part) || isChatFilePart(part) || isChatWorkspaceFileReferencePart(part)
}

function hasTextSource(part: ChatAgentPart | ChatFilePart) {
  if (isChatAgentPart(part)) return isRecord(part.source)
  const source = isRecord(part.source) ? part.source : undefined
  return source ? isRecord(source.text) : false
}

function getReferencePath(part: StandaloneReferencePart) {
  if (isChatAgentPart(part)) return part.name
  if (isChatWorkspaceFileReferencePart(part)) return part.path
  return typeof part.filename === "string" && part.filename.length > 0 ? part.filename : part.url
}

function getReferenceText(part: StandaloneReferencePart) {
  return `@${getReferencePath(part)}`
}

function dedupeReferenceParts(parts: StandaloneReferencePart[]): Set<StandaloneReferencePart> {
  const seen = new Set<string>()
  const unique = new Set<StandaloneReferencePart>()
  for (const part of parts) {
    const key = `${isChatAgentPart(part) ? "agent" : "file"}:${getReferencePath(part)}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.add(part)
  }
  return unique
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
  const userWorkspaceReferenceParts = useMemo(
    () => userParts.filter(isChatWorkspaceFileReferencePart),
    [userParts],
  )
  const userReadingSelectionParts = useMemo(
    () => userParts.map(readChatReadingSelectionPart).filter((part) => part !== undefined),
    [userParts],
  )
  const userTextParts = useMemo(() => userParts.filter(isVisibleUserTextPart), [userParts])
  const standaloneReferenceParts = useMemo(
    () =>
      dedupeReferenceParts([
        ...userInlineFileParts.filter((part) => !hasTextSource(part)),
        ...userAgentParts.filter((part) => !hasTextSource(part)),
        ...userWorkspaceReferenceParts,
      ]),
    [userAgentParts, userInlineFileParts, userWorkspaceReferenceParts],
  )
  const combinedTextPart = useMemo(() => {
    const displayParts = userParts.flatMap((part) => {
      if (isVisibleUserTextPart(part)) return [part.text]
      if (isStandaloneReferencePart(part) && standaloneReferenceParts.has(part)) {
        return [` ${getReferenceText(part)} `]
      }
      return []
    })
    const text = displayParts
      .join("")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
    if (!text) return undefined
    const firstPart = userTextParts[0] ?? userParts.find(isChatTextPart)
    if (!firstPart) {
      return {
        id: "inline-user-message",
        sessionID: userMessage?.info.sessionID ?? "",
        messageID: userMessage?.info.id ?? "",
        type: "text" as const,
        text,
      }
    }
    return {
      ...firstPart,
      synthetic: false,
      text,
    }
  }, [
    standaloneReferenceParts,
    userMessage?.info.id,
    userMessage?.info.sessionID,
    userParts,
    userTextParts,
  ])
  const inlineReferences = useMemo(
    () => Array.from(standaloneReferenceParts, (part) => getReferenceText(part)),
    [standaloneReferenceParts],
  )
  const hasVisibleContent =
    userAttachmentParts.length > 0 ||
    standaloneReferenceParts.size > 0 ||
    userReadingSelectionParts.length > 0 ||
    combinedTextPart !== undefined

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
        {combinedTextPart ? (
          <UserMessagePart
            key={combinedTextPart.id}
            part={combinedTextPart}
            info={userMessage.info}
            references={userInlineFileParts}
            agents={userAgentParts}
            inlineReferences={inlineReferences}
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
        ) : null}
      </div>
    </div>
  )
})
