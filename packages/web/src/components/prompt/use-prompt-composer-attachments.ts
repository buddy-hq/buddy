import {
  NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT,
  nativeResourceDefinitionFromPath,
} from "@buddy/workspace-file-policy"
import { useEffect, useRef, useState } from "react"
import { getPlatform } from "@/context/platform"
import { copyNotebookUpload } from "@/lib/notebook-uploads"
import {
  attachmentRequiresVisionInput,
  createAttachmentID,
  fileToPromptComposerAttachment,
  resolvePromptAttachmentMime,
} from "./attachment-utils"
import {
  isPromptModelAttachment,
  type PromptComposerAttachment,
  type PromptModelAttachment,
  type PromptNativeResourceAttachment,
} from "./prompt-types"

const MAX_CONCURRENT_RESOURCE_COPIES = 2
const RESOURCE_COPY_FAILED_MESSAGE = "Copy failed. Click to retry or remove this file."
const RESOURCE_PATH_UNAVAILABLE_MESSAGE =
  "Buddy could not resolve this file's desktop path. Remove it and try again."

type PromptAttachmentUpdate =
  | PromptComposerAttachment[]
  | ((attachments: PromptComposerAttachment[]) => PromptComposerAttachment[])

type UsePromptComposerAttachmentsProps = {
  scopeKey: string
  directory: string
  attachments: PromptComposerAttachment[]
  setDraftAttachments: (update: PromptAttachmentUpdate) => void
  discardTransientAttachments: (scopeKey: string) => void
  resetHistoryNavigation: () => void
  acceptsImages: boolean
  onUnsupportedImages?: (count: number) => void
  onUnsupportedFiles?: (count: number) => void
  onNativeResourceLimitExceeded?: (count: number) => void
}

type QueuedResourceCopy = {
  attachmentID: string
  generation: number
  scopeKey: string
  directory: string
}

function errorMessage<TError>(error: TError): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return RESOURCE_COPY_FAILED_MESSAGE
}

export function usePromptComposerAttachments(props: UsePromptComposerAttachmentsProps) {
  const [previewAttachment, setPreviewAttachment] = useState<PromptModelAttachment | null>(null)
  const propsRef = useRef(props)
  const mountedRef = useRef(true)
  const activeCopiesRef = useRef(0)
  const queuedCopiesRef = useRef<QueuedResourceCopy[]>([])
  const generationByAttachmentRef = useRef(new Map<string, number>())
  const fileByAttachmentRef = useRef(new Map<string, File>())
  const pathByAttachmentRef = useRef(new Map<string, string>())
  const abortByAttachmentRef = useRef(new Map<string, AbortController>())
  propsRef.current = props

  function updateAttachments(
    update: (attachments: PromptComposerAttachment[]) => PromptComposerAttachment[],
  ): void {
    if (!mountedRef.current) return
    propsRef.current.setDraftAttachments(update)
  }

  function currentGeneration(attachmentID: string): number {
    return generationByAttachmentRef.current.get(attachmentID) ?? 0
  }

  function isCurrentCopy(copy: QueuedResourceCopy): boolean {
    return (
      mountedRef.current &&
      propsRef.current.scopeKey === copy.scopeKey &&
      currentGeneration(copy.attachmentID) === copy.generation
    )
  }

  function setResourceCopyError(attachmentID: string, message: string): void {
    updateAttachments((attachments) =>
      attachments.map((attachment) =>
        attachment.id === attachmentID && attachment.kind === "native-resource"
          ? { ...attachment, status: "error", error: message }
          : attachment,
      ),
    )
  }

  async function runResourceCopy(copy: QueuedResourceCopy): Promise<void> {
    if (!isCurrentCopy(copy)) return
    const sourcePath = pathByAttachmentRef.current.get(copy.attachmentID)
    if (!sourcePath) {
      setResourceCopyError(copy.attachmentID, RESOURCE_PATH_UNAVAILABLE_MESSAGE)
      return
    }

    const controller = new AbortController()
    abortByAttachmentRef.current.set(copy.attachmentID, controller)
    try {
      const upload = await copyNotebookUpload({
        directory: copy.directory,
        sourcePath,
        signal: controller.signal,
      })
      if (!isCurrentCopy(copy)) return

      updateAttachments((attachments) =>
        attachments.map((attachment) =>
          attachment.id === copy.attachmentID &&
          attachment.kind === "native-resource" &&
          attachment.status === "copying"
            ? {
                ...attachment,
                status: "ready",
                uploadID: upload.uploadID,
                workspacePath: upload.workspacePath,
                localPath: upload.absolutePath,
                sizeBytes: upload.sizeBytes,
              }
            : attachment,
        ),
      )
      fileByAttachmentRef.current.delete(copy.attachmentID)
      pathByAttachmentRef.current.delete(copy.attachmentID)
    } catch (error) {
      if (!isCurrentCopy(copy) || controller.signal.aborted) return
      setResourceCopyError(copy.attachmentID, errorMessage(error))
    } finally {
      if (abortByAttachmentRef.current.get(copy.attachmentID) === controller) {
        abortByAttachmentRef.current.delete(copy.attachmentID)
      }
    }
  }

  function drainResourceCopies(): void {
    while (
      activeCopiesRef.current < MAX_CONCURRENT_RESOURCE_COPIES &&
      queuedCopiesRef.current.length > 0
    ) {
      const copy = queuedCopiesRef.current.shift()
      if (!copy || !isCurrentCopy(copy)) continue

      activeCopiesRef.current += 1
      void runResourceCopy(copy).finally(() => {
        activeCopiesRef.current -= 1
        drainResourceCopies()
      })
    }
  }

  function enqueueResourceCopy(attachmentID: string, scopeKey = propsRef.current.scopeKey): void {
    const generation = currentGeneration(attachmentID) + 1
    generationByAttachmentRef.current.set(attachmentID, generation)
    queuedCopiesRef.current.push({
      attachmentID,
      generation,
      scopeKey,
      directory: propsRef.current.directory,
    })
    drainResourceCopies()
  }

  async function resolveAndEnqueueResourceCopy(attachmentID: string, file: File): Promise<void> {
    const resolvePath = getPlatform().resolveDroppedFilePath
    if (!resolvePath) {
      setResourceCopyError(attachmentID, RESOURCE_PATH_UNAVAILABLE_MESSAGE)
      return
    }

    const scopeKey = propsRef.current.scopeKey
    try {
      const sourcePath = await resolvePath(file)
      if (
        propsRef.current.scopeKey !== scopeKey ||
        !generationByAttachmentRef.current.has(attachmentID)
      ) {
        return
      }
      if (!sourcePath) {
        setResourceCopyError(attachmentID, RESOURCE_PATH_UNAVAILABLE_MESSAGE)
        return
      }
      pathByAttachmentRef.current.set(attachmentID, sourcePath)
      enqueueResourceCopy(attachmentID, scopeKey)
    } catch {
      if (
        propsRef.current.scopeKey !== scopeKey ||
        !generationByAttachmentRef.current.has(attachmentID)
      ) {
        return
      }
      setResourceCopyError(attachmentID, RESOURCE_PATH_UNAVAILABLE_MESSAGE)
    }
  }

  async function addModelAttachments(files: File[]): Promise<void> {
    const next: PromptModelAttachment[] = []
    let unsupportedFileCount = 0
    let unsupportedImageCount = 0

    for (const file of files) {
      const mime = await resolvePromptAttachmentMime(file).catch(() => undefined)
      if (!mime) {
        unsupportedFileCount += 1
        continue
      }
      if (!propsRef.current.acceptsImages && attachmentRequiresVisionInput(mime)) {
        unsupportedImageCount += 1
        continue
      }

      const attachment = await fileToPromptComposerAttachment(file, mime).catch(() => undefined)
      if (attachment) next.push(attachment)
    }

    if (unsupportedFileCount > 0) {
      propsRef.current.onUnsupportedFiles?.(unsupportedFileCount)
    }
    if (unsupportedImageCount > 0) {
      propsRef.current.onUnsupportedImages?.(unsupportedImageCount)
    }
    if (next.length > 0) {
      updateAttachments((attachments) => [...attachments, ...next])
    }
  }

  async function addAttachments(files: FileList | File[]): Promise<void> {
    const list = Array.from(files)
    if (list.length === 0) return

    const nativeResources: Array<{
      file: File
      attachment: PromptNativeResourceAttachment
    }> = []
    const modelFiles: File[] = []
    const nativeResourceAttachmentIDs = new Set(
      propsRef.current.attachments.flatMap((attachment) =>
        attachment.kind === "native-resource" ? [attachment.id] : [],
      ),
    )
    for (const attachmentID of generationByAttachmentRef.current.keys()) {
      nativeResourceAttachmentIDs.add(attachmentID)
    }
    let remainingNativeResourceSlots = Math.max(
      0,
      NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT - nativeResourceAttachmentIDs.size,
    )
    let nativeResourceLimitExceededCount = 0
    for (const file of list) {
      const definition = nativeResourceDefinitionFromPath(file.name)
      if (!definition) {
        modelFiles.push(file)
        continue
      }
      if (remainingNativeResourceSlots === 0) {
        nativeResourceLimitExceededCount += 1
        continue
      }
      remainingNativeResourceSlots -= 1

      const id = createAttachmentID()
      generationByAttachmentRef.current.set(id, 0)
      fileByAttachmentRef.current.set(id, file)
      nativeResources.push({
        file,
        attachment: {
          id,
          filename: file.name,
          mime: definition.mime,
          kind: "native-resource",
          format: definition.format,
          delivery: definition.delivery,
          status: "copying",
        },
      })
    }

    propsRef.current.resetHistoryNavigation()
    if (nativeResourceLimitExceededCount > 0) {
      propsRef.current.onNativeResourceLimitExceeded?.(nativeResourceLimitExceededCount)
    }
    if (nativeResources.length > 0) {
      updateAttachments((attachments) => [
        ...attachments,
        ...nativeResources.map(({ attachment }) => attachment),
      ])
      for (const { attachment, file } of nativeResources) {
        void resolveAndEnqueueResourceCopy(attachment.id, file)
      }
    }
    if (modelFiles.length > 0) {
      await addModelAttachments(modelFiles)
    }
  }

  function removeAttachment(id: string): void {
    propsRef.current.resetHistoryNavigation()
    generationByAttachmentRef.current.delete(id)
    queuedCopiesRef.current = queuedCopiesRef.current.filter((copy) => copy.attachmentID !== id)
    abortByAttachmentRef.current.get(id)?.abort()
    abortByAttachmentRef.current.delete(id)
    fileByAttachmentRef.current.delete(id)
    pathByAttachmentRef.current.delete(id)
    updateAttachments((attachments) => attachments.filter((attachment) => attachment.id !== id))
  }

  function retryAttachment(id: string): void {
    if (!fileByAttachmentRef.current.has(id)) return
    updateAttachments((attachments) =>
      attachments.map((attachment) =>
        attachment.id === id && attachment.kind === "native-resource"
          ? { ...attachment, status: "copying" }
          : attachment,
      ),
    )
    if (pathByAttachmentRef.current.has(id)) {
      enqueueResourceCopy(id)
      return
    }
    const file = fileByAttachmentRef.current.get(id)
    if (file) void resolveAndEnqueueResourceCopy(id, file)
  }

  function cancelAllResourceCopies(): void {
    queuedCopiesRef.current = []
    for (const controller of abortByAttachmentRef.current.values()) controller.abort()
    abortByAttachmentRef.current.clear()
  }

  useEffect(() => {
    const liveAttachmentIDs = new Set(props.attachments.map((attachment) => attachment.id))
    queuedCopiesRef.current = queuedCopiesRef.current.filter((copy) =>
      liveAttachmentIDs.has(copy.attachmentID),
    )
    for (const attachmentID of generationByAttachmentRef.current.keys()) {
      if (liveAttachmentIDs.has(attachmentID)) continue
      generationByAttachmentRef.current.delete(attachmentID)
      abortByAttachmentRef.current.get(attachmentID)?.abort()
      abortByAttachmentRef.current.delete(attachmentID)
      fileByAttachmentRef.current.delete(attachmentID)
      pathByAttachmentRef.current.delete(attachmentID)
    }
  }, [props.attachments])

  useEffect(() => {
    const scopeKey = props.scopeKey
    const discardTransientAttachments = props.discardTransientAttachments
    const generationByAttachment = generationByAttachmentRef.current
    const fileByAttachment = fileByAttachmentRef.current
    const pathByAttachment = pathByAttachmentRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelAllResourceCopies()
      discardTransientAttachments(scopeKey)
      generationByAttachment.clear()
      fileByAttachment.clear()
      pathByAttachment.clear()
    }
  }, [props.discardTransientAttachments, props.scopeKey])

  return {
    previewAttachment,
    openPreviewAttachment: (attachment: PromptComposerAttachment) => {
      if (isPromptModelAttachment(attachment)) setPreviewAttachment(attachment)
    },
    closePreviewAttachment: () => setPreviewAttachment(null),
    addAttachments,
    removeAttachment,
    retryAttachment,
  }
}
