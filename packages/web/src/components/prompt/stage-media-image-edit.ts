import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { getPromptDraft, getPromptScopeKey, usePromptStore } from "@/state/prompt-store"
import { fileToPromptComposerAttachment } from "./attachment-utils"
import { requestPromptComposerFocus } from "./prompt-composer-focus"
import type { PromptComposerAttachment } from "./prompt-types"

const DEFAULT_IMAGE_MIME_TYPE = "image/png"

export async function stageMediaImageEdit(input: {
  directory: string
  sessionID: string
  objectID: string
  itemID: string
  fileName: string
  localPath: string
}): Promise<PromptComposerAttachment> {
  const image = requireBuddyData(
    await getBuddyClient(input.directory).objectMediaPresentation.raw({
      objectID: input.objectID,
      itemID: input.itemID,
      directory: input.directory,
      fileName: input.fileName,
    }),
  )
  const mime = image.type || DEFAULT_IMAGE_MIME_TYPE
  if (!mime.startsWith("image/")) {
    throw new Error("The media item is not an image.")
  }

  const previewAttachment = await fileToPromptComposerAttachment(
    new File([image], input.fileName, { type: mime }),
  )
  const attachment: PromptComposerAttachment = {
    ...previewAttachment,
    localPath: input.localPath,
    editTarget: true,
  }
  const promptKey = getPromptScopeKey(input.directory, input.sessionID)
  const store = usePromptStore.getState()
  const draft = getPromptDraft(store, promptKey)

  store.resetHistoryNavigation(promptKey)
  store.setAttachments(promptKey, [...draft.attachments, attachment])
  requestPromptComposerFocus(input.directory)

  return attachment
}
