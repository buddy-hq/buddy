import { memo, useMemo } from "react"
import { cn } from "@buddy/ui"
import { FileAttachmentPart } from "../parts/file-attachment"
import { UserMessagePart } from "../parts/user-message"
import { SelectionClip } from "@/components/prompt/selection-clip"
import { FileAttachmentChip } from "@/components/files/file-attachment-chip"
import {
  isChatAgentPart,
  isChatFilePart,
  isChatTextPart,
  type ChatAgentPart,
  type ChatFilePart,
} from "../utils/part-guards"
import { isHiddenFromUserMessage } from "../utils/message-visibility"
import { isVisibleUserTextPart } from "../utils/user-message-text"
import {
  isUserAttachmentFilePart,
  projectUserMessageStackedContent,
} from "../utils/user-message-stacked-content"
import {
  OPENCODE_REFERENCE_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "@/components/prompt/prompt-types"
import type { MessagePart } from "@/state/chat-types"

import type { UserSectionProps } from "../types"
import { parseTString } from "../tools/types"

type ChatWorkspaceFileReferencePart = MessagePart & {
  type: typeof WORKSPACE_FILE_REFERENCE_PART_TYPE
  path: string
}

type ChatOpenCodeReferencePart = MessagePart & {
  type: typeof OPENCODE_REFERENCE_PART_TYPE
  name: string
  path: string
}

type StandaloneReferencePart =
  | ChatAgentPart
  | ChatFilePart
  | ChatWorkspaceFileReferencePart
  | ChatOpenCodeReferencePart

function isChatWorkspaceFileReferencePart(
  part: MessagePart,
): part is ChatWorkspaceFileReferencePart {
  return part.type === WORKSPACE_FILE_REFERENCE_PART_TYPE && parseTString(part.path) !== undefined
}

function isChatOpenCodeReferencePart(part: MessagePart): part is ChatOpenCodeReferencePart {
  return (
    part.type === OPENCODE_REFERENCE_PART_TYPE &&
    parseTString(part.name) !== undefined &&
    parseTString(part.path) !== undefined
  )
}

function isStandaloneReferencePart(part: MessagePart): part is StandaloneReferencePart {
  return (
    isChatAgentPart(part) ||
    isChatFilePart(part) ||
    isChatWorkspaceFileReferencePart(part) ||
    isChatOpenCodeReferencePart(part)
  )
}

function hasTextSource(part: ChatAgentPart | ChatFilePart) {
  return part.source !== null && part.source !== undefined
}

function getReferencePath(part: StandaloneReferencePart) {
  if (isChatAgentPart(part)) return part.name
  if (isChatOpenCodeReferencePart(part)) return part.name
  if (isChatWorkspaceFileReferencePart(part)) return part.path
  const filename = parseTString(part.filename)
  return filename !== undefined && filename.length > 0 ? filename : part.url
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
  onRevertMessage,
  animateEntrance,
}: UserSectionProps) {
  const userParts = useMemo(() => userMessage?.parts ?? [], [userMessage?.parts])
  const userFileParts = useMemo(() => userParts.filter(isChatFilePart), [userParts])
  const stackedContent = useMemo(() => projectUserMessageStackedContent(userParts), [userParts])
  const {
    attachmentParts: userAttachmentParts,
    nativeResourceParts: userNativeResourceParts,
    selectionContextParts: userSelectionContextParts,
    textFileAttachmentParts: userTextFileAttachmentParts,
  } = stackedContent
  const userInlineFileParts = useMemo(
    () => userFileParts.filter((part) => !isUserAttachmentFilePart(part)),
    [userFileParts],
  )
  const userAgentParts = useMemo(() => userParts.filter(isChatAgentPart), [userParts])
  const userWorkspaceReferenceParts = useMemo(
    () => userParts.filter(isChatWorkspaceFileReferencePart),
    [userParts],
  )
  const userOpenCodeReferenceParts = useMemo(
    () => userParts.filter(isChatOpenCodeReferencePart),
    [userParts],
  )
  const userTextParts = useMemo(() => userParts.filter(isVisibleUserTextPart), [userParts])
  const standaloneReferenceParts = useMemo(
    () =>
      dedupeReferenceParts([
        ...userInlineFileParts.filter((part) => !hasTextSource(part)),
        ...userAgentParts.filter((part) => !hasTextSource(part)),
        ...userOpenCodeReferenceParts,
        ...userWorkspaceReferenceParts,
      ]),
    [userAgentParts, userInlineFileParts, userOpenCodeReferenceParts, userWorkspaceReferenceParts],
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
    userNativeResourceParts.length > 0 ||
    userTextFileAttachmentParts.length > 0 ||
    standaloneReferenceParts.size > 0 ||
    userSelectionContextParts.length > 0 ||
    combinedTextPart !== undefined

  if (!userMessage || !hasVisibleContent) return null
  if (isHiddenFromUserMessage(userMessage)) {
    return null
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col items-end gap-2 text-sm",
        // In-place expansion, not a slide: the block scales up from its
        // bottom-right corner (origin-bottom-right + zoom-in) so it grows
        // outward toward the top-left without translating anywhere. It grows
        // from 90% into its already-reserved full-height slot, so the row's
        // measured height is stable the whole time (no reflow, nothing to clip).
        // Safe for the virtualiser: it measures this row's PARENT wrapper, and a
        // child's transform (this scale) never changes the parent's layout
        // height — same reason opacity/blur are safe.
        animateEntrance &&
          "origin-bottom-right animate-in fade-in zoom-in-85 duration-[400ms] ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:animate-none",
      )}
    >
      <div className="group/user flex w-full flex-col items-end gap-2">
        {userAttachmentParts.length > 0 ? (
          <div className="flex w-fit max-w-[min(82%,64ch)] flex-wrap justify-end gap-2">
            {userAttachmentParts.map((part) => (
              <FileAttachmentPart key={part.id} part={part} />
            ))}
          </div>
        ) : null}
        {userNativeResourceParts.length > 0 || userTextFileAttachmentParts.length > 0 ? (
          <div className="flex w-fit max-w-[min(82%,64ch)] flex-wrap justify-end gap-2">
            {userNativeResourceParts.map(({ id, attachment }) => (
              <FileAttachmentChip key={id} fileName={attachment.filename} mime={attachment.mime} />
            ))}
            {userTextFileAttachmentParts.map(({ id, attachment }) => (
              <FileAttachmentChip key={id} fileName={attachment.filename} mime={attachment.mime} />
            ))}
          </div>
        ) : null}
        {userSelectionContextParts.map((part) => (
          <div key={part.id} className="ml-auto w-fit max-w-[min(82%,64ch)]">
            <SelectionClip variant="inline" data={part} />
          </div>
        ))}
        {combinedTextPart ? (
          <UserMessagePart
            key={combinedTextPart.id}
            part={combinedTextPart}
            info={userMessage.info}
            references={userInlineFileParts}
            agents={userAgentParts}
            inlineReferences={inlineReferences}
            providers={providers}
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
