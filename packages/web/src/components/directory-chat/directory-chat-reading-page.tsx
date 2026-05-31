import { useEffect, useMemo, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { DirectoryInvalidNotebook } from "./directory-invalid-notebook"
import { DirectoryChatReadingReaderPane } from "@/components/directory-chat/directory-chat-reading-reader-pane"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { READING_SELECTION_PART_TYPE } from "@/components/prompt/prompt-types"
import { serializePromptEditorParts } from "@/components/prompt/prompt-parts"
import { language } from "@/context/language"
import { fileNameFromPath, normalizeRelativePath } from "@/lib/workspace-file-paths"
import { useChatStore } from "@/state/chat-store"
import { getPromptDraft, usePromptStore } from "@/state/prompt-store"
import { resourceFileExtensionFromFormat, resourcesQueryOptions } from "@/state/resources-query"
import { useTeachingRuntime, teachingSelectionKey } from "@/state/teaching-runtime"
import { type ResourceRecord } from "@/state/resource-actions"

type DirectoryChatReadingPageProps = {
  directory: string
  resourcePath: string
  resourceKey?: string
}

function normalizeResourceRecordPath(record: ResourceRecord) {
  return normalizeRelativePath(record.sourceOriginRelpath ?? record.sourceRelpath)
}

const READING_DRAFT_SESSION_ID = undefined

function createReadingSelectionKey() {
  const random = Math.random().toString(36).slice(2, 10)
  return `sel_${Date.now().toString(36)}_${random}`
}

export function DirectoryChatReadingPage(props: DirectoryChatReadingPageProps) {
  const { controller } = useDirectoryNotebookRouteContext()
  const normalizedPath = normalizeRelativePath(props.resourcePath)
  const resourceName = fileNameFromPath(normalizedPath) || language.t("sidebar.resources")
  const readyDirectory =
    controller.status === "ready" ? controller.mainPaneProps.directory : undefined
  const readingSessionID =
    controller.status === "ready" ? controller.mainPaneProps.chatState.sessionID : undefined
  const setActiveReadingResource = useChatStore((state) => state.setActiveReadingResource)
  const updateActiveReadingResourceLocation = useChatStore(
    (state) => state.updateActiveReadingResourceLocation,
  )
  const appendReadingTrailEntry = useChatStore((state) => state.appendReadingTrailEntry)
  const setActiveReadingAnnotationSummary = useChatStore(
    (state) => state.setActiveReadingAnnotationSummary,
  )
  const setLastOpenedReadingResource = useChatStore((state) => state.setLastOpenedReadingResource)
  const setSessionPersona = useTeachingRuntime((state) => state.setSessionPersona)
  const clearSessionPersona = useTeachingRuntime((state) => state.clearSessionPersona)
  const readingPersonaSessionKey = useMemo(
    () => (readyDirectory ? teachingSelectionKey(readyDirectory, readingSessionID) : ""),
    [readingSessionID, readyDirectory],
  )
  const selectedPersonaForSession = useTeachingRuntime((state) =>
    readingPersonaSessionKey ? state.selectedPersonaBySession[readingPersonaSessionKey] : undefined,
  )
  const previousPersonaBySessionRef = useRef<Record<string, string | undefined>>({})
  const resourcesQuery = useQuery({
    ...resourcesQueryOptions(readyDirectory ?? ""),
    enabled: readyDirectory !== undefined,
  })
  const resourceRecord = useMemo(() => {
    if (props.resourceKey) {
      return resourcesQuery.data?.processed.find(
        (resource) => resource.id === props.resourceKey || resource.alias === props.resourceKey,
      )
    }

    if (!normalizedPath) return undefined

    return resourcesQuery.data?.processed.find(
      (resource) => normalizeResourceRecordPath(resource) === normalizedPath,
    )
  }, [normalizedPath, props.resourceKey, resourcesQuery.data?.processed])
  useEffect(() => {
    if (!readyDirectory) {
      return
    }

    const sessionKey = teachingSelectionKey(readyDirectory, readingSessionID)
    const draftSessionKey = teachingSelectionKey(readyDirectory, READING_DRAFT_SESSION_ID)

    if (
      readingSessionID &&
      !(sessionKey in previousPersonaBySessionRef.current) &&
      draftSessionKey in previousPersonaBySessionRef.current
    ) {
      previousPersonaBySessionRef.current[sessionKey] =
        previousPersonaBySessionRef.current[draftSessionKey]
      delete previousPersonaBySessionRef.current[draftSessionKey]
    }

    const currentPersona = selectedPersonaForSession

    if (currentPersona === "buddy") return

    if (!(sessionKey in previousPersonaBySessionRef.current)) {
      previousPersonaBySessionRef.current[sessionKey] = currentPersona
    }

    setSessionPersona(sessionKey, "buddy")
  }, [readingSessionID, readyDirectory, selectedPersonaForSession, setSessionPersona])

  useEffect(() => {
    return () => {
      for (const [sessionKey, previousPersona] of Object.entries(
        previousPersonaBySessionRef.current,
      )) {
        if (previousPersona !== undefined) {
          setSessionPersona(sessionKey, previousPersona)
          continue
        }

        clearSessionPersona(sessionKey)
      }
      previousPersonaBySessionRef.current = {}
    }
  }, [clearSessionPersona, setSessionPersona])

  useEffect(() => {
    if (!readyDirectory || !normalizedPath) return
    setActiveReadingResource(readyDirectory, {
      ...(resourceRecord?.id ? { resourceID: resourceRecord.id } : {}),
      ...(resourceRecord?.alias ? { alias: resourceRecord.alias } : {}),
      name: resourceName,
      path: normalizedPath,
      ...(resourceRecord?.status ? { status: resourceRecord.status } : {}),
    })
    setLastOpenedReadingResource(readyDirectory, {
      ...(resourceRecord?.id ? { resourceID: resourceRecord.id } : {}),
      name: resourceName,
      path: normalizedPath,
    })

    return () => {
      setActiveReadingResource(readyDirectory, undefined)
    }
  }, [
    normalizedPath,
    readyDirectory,
    resourceName,
    resourceRecord,
    setActiveReadingResource,
    setLastOpenedReadingResource,
  ])

  if (controller.status === "invalid") {
    return <DirectoryInvalidNotebook />
  }

  if (controller.status === "opening") {
    return (
      <div data-component="directory-chat-reading-opening" className="p-6">
        {language.t("directoryChat.openingNotebook")}
      </div>
    )
  }

  const readyController = controller
  function stageReadingSelection(input: {
    text: string
    cfi: string
    index: number
    selectionKey?: string
    tocLabel?: string
    pageLabel?: string
    locationLabel?: string
  }) {
    const promptKey = readyController.mainPaneProps.chatState.promptKey
    const setPromptDraft = readyController.mainPaneProps.chatState.setPromptDraft
    const currentDraft = getPromptDraft(usePromptStore.getState(), promptKey)
    const resourceKey = resourceRecord?.id ?? resourceRecord?.alias ?? props.resourceKey
    const nextParts = [
      ...currentDraft.parts,
      {
        type: READING_SELECTION_PART_TYPE,
        text: input.text,
        selectionKey: input.selectionKey ?? createReadingSelectionKey(),
        ...(resourceKey ? { resourceKey } : {}),
        cfi: input.cfi,
        index: input.index,
        ...(input.tocLabel ? { tocLabel: input.tocLabel } : {}),
        ...(input.pageLabel ? { pageLabel: input.pageLabel } : {}),
        ...(input.locationLabel ? { locationLabel: input.locationLabel } : {}),
      },
    ]
    const nextValue = serializePromptEditorParts(nextParts)

    setPromptDraft(promptKey, {
      value: nextValue,
      parts: nextParts,
      attachments: currentDraft.attachments,
      cursor: nextValue.length,
    })
  }

  function removeStagedReadingSelection(selectionKey: string) {
    const promptKey = readyController.mainPaneProps.chatState.promptKey
    const setPromptDraft = readyController.mainPaneProps.chatState.setPromptDraft
    const currentDraft = getPromptDraft(usePromptStore.getState(), promptKey)
    const nextParts = currentDraft.parts.filter((part) => {
      if (part.type !== READING_SELECTION_PART_TYPE) return true
      return part.selectionKey !== selectionKey
    })

    if (nextParts.length === currentDraft.parts.length) {
      return
    }

    const nextValue = serializePromptEditorParts(nextParts)
    const nextCursor = Math.max(0, Math.min(currentDraft.cursor, nextValue.length))
    setPromptDraft(promptKey, {
      value: nextValue,
      parts: nextParts,
      attachments: currentDraft.attachments,
      cursor: nextCursor,
    })
  }

  return readyDirectory && normalizedPath ? (
    <div data-component="directory-chat-reading-page" className="h-full min-h-0 w-full">
      <DirectoryChatReadingReaderPane
        directory={readyDirectory}
        resourceName={resourceName}
        resourcePath={normalizedPath}
        resourceID={resourceRecord?.id}
        coverRelpath={resourceRecord?.coverRelpath}
        coverExtension={resourceFileExtensionFromFormat(resourceRecord?.format ?? "")}
        resourceStatus={resourceRecord?.status}
        onLocationChange={(location) => {
          updateActiveReadingResourceLocation(readyDirectory, {
            cfi: location.cfi,
            index: location.index,
            fraction: location.fraction,
            locationLabel: location.locationLabel,
            tocLabel: location.tocLabel,
            pageLabel: location.pageLabel,
            currentPassageText: location.currentPassageText,
          })
          if (location.tocLabel) {
            appendReadingTrailEntry(readyDirectory, {
              tocLabel: location.tocLabel,
              cfi: location.cfi,
              fraction: location.fraction,
            })
          }
        }}
        onChatSelection={(selection) => {
          stageReadingSelection(selection)
        }}
        onChatSelectionRemoved={(selectionKey) => {
          removeStagedReadingSelection(selectionKey)
        }}
        onAnnotationsChange={(annotations) => {
          const summary = annotations.slice(-10).map((annotation) => {
            const note = annotation.note?.trim()
            return note ? { text: annotation.text ?? "", note } : { text: annotation.text ?? "" }
          })
          setActiveReadingAnnotationSummary(readyDirectory, summary)
        }}
      />
    </div>
  ) : null
}
