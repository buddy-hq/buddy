import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button, toast } from "@buddy/ui"
import { formatReaderPositionAnchor } from "@buddy/reader-contract"
import { DirectoryInvalidNotebook } from "./directory-invalid-notebook"
import { DirectoryChatReadingReaderPane } from "@/components/directory-chat/directory-chat-reading-reader-pane"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import {
  useRegisterBenchContextProvider,
  type BenchContextProvider,
} from "@/components/bench/bench-route-context"
import { objectRef, workspaceFileRef } from "@/components/bench/bench-context-utils"
import {
  appendReadingSelectionToDraft,
  removeReadingSelectionFromDraft,
} from "@/components/readers/utils/reading-selection-draft"
import type { ReaderSelection } from "@/components/readers/reader-types"
import { language } from "@/context/language"
import { fileNameFromPath, normalizeRelativePath } from "@/lib/workspace-file-paths"
import { useChatStore } from "@/state/chat-store"
import { getPromptDraft, usePromptStore } from "@/state/prompt-store"
import { resourceFileExtensionFromFormat, resourcesQueryOptions } from "@/state/resources-query"
import { useTeachingRuntime, teachingSelectionKey } from "@/state/teaching-runtime"
import { addResource, rebuildResource, type ResourceRecord } from "@/state/resource-actions"
import type { BenchTarget } from "@/lib/bench-navigation"
import { stringifyError } from "@/lib/api-client"

type DirectoryChatReadingPageProps = {
  directory: string
  resourcePath: string
  resourceKey?: string
  target: BenchTarget
}

function normalizeResourceRecordPath(record: ResourceRecord) {
  return normalizeRelativePath(record.sourceOriginRelpath ?? record.sourceRelpath)
}

const READING_DRAFT_SESSION_ID = undefined

export function DirectoryChatReadingPage(props: DirectoryChatReadingPageProps) {
  const queryClient = useQueryClient()
  const [processing, setProcessing] = useState(false)
  const [processingError, setProcessingError] = useState<string | undefined>(undefined)
  const [processBannerDismissed, setProcessBannerDismissed] = useState(false)
  const { controller } = useDirectoryNotebookRouteContext()
  const normalizedPath = normalizeRelativePath(props.resourcePath)
  const resourceName = fileNameFromPath(normalizedPath) || language.t("sidebar.resources")
  const readyDirectory =
    controller.status === "ready" ? controller.mainPaneProps.directory : undefined
  const readingSessionID =
    controller.status === "ready" ? controller.mainPaneProps.chatState.sessionID : undefined
  const setActiveReadingResource = useChatStore((state) => state.setActiveReadingResource)
  const activeReadingResource = useChatStore(
    (state) => state.activeReadingResourceByDirectory[props.directory],
  )
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
        (resource) =>
          resource.objectID === props.resourceKey || resource.alias === props.resourceKey,
      )
    }

    if (!normalizedPath) return undefined

    return resourcesQuery.data?.processed.find(
      (resource) => normalizeResourceRecordPath(resource) === normalizedPath,
    )
  }, [normalizedPath, props.resourceKey, resourcesQuery.data?.processed])
  const canProcessResource = !resourceRecord?.objectID && !processBannerDismissed
  const readerStatus =
    resourceRecord?.status === "error"
      ? "error"
      : resourceRecord?.status === "preparing"
        ? "preparing"
        : resourceRecord?.status === "unsupported"
          ? "unsupported"
          : resourcesQuery.isLoading
            ? "loading"
            : "ready"
  const targetStatus =
    readerStatus === "error"
      ? "error"
      : readerStatus === "loading" || readerStatus === "preparing"
        ? "loading"
        : readerStatus === "unsupported"
          ? "unavailable"
          : "ready"
  const contextProvider = useMemo<BenchContextProvider>(
    () => ({
      read: () => {
        const routeObjectID =
          props.target.type === "object" && props.target.ref.kind === "resource"
            ? props.target.ref.objectID
            : null
        const objectID =
          routeObjectID ?? resourceRecord?.objectID ?? activeReadingResource?.objectID ?? null
        const alias = resourceRecord?.alias ?? activeReadingResource?.alias
        const location = activeReadingResource?.location
        const anchor = location?.anchor
        const metadata = [
          `resource_status: ${resourceRecord?.status ?? activeReadingResource?.status ?? "unknown"}`,
          ...(alias ? [`resource_alias: ${alias}`] : []),
          `reader_status: ${readerStatus}`,
          ...(location?.locationLabel ? [`location_label: ${location.locationLabel}`] : []),
          ...(location?.pageLabel ? [`page_label: ${location.pageLabel}`] : []),
          ...(location?.tocLabel ? [`toc_label: ${location.tocLabel}`] : []),
          ...(anchor ? [`reader_anchor: ${JSON.stringify(anchor)}`] : []),
          ...(anchor?.kind === "cfi-position" ? [`cfi: ${anchor.cfi}`] : []),
          ...(anchor?.kind === "cfi-position" && anchor.sectionIndex !== undefined
            ? [`section_index: ${anchor.sectionIndex}`]
            : []),
          ...(anchor?.kind === "pdf-position" ? [`page_index: ${anchor.pageIndex}`] : []),
          ...(location?.fraction !== undefined ? [`fraction: ${location.fraction}`] : []),
        ]
        const contentParts = [
          `Current reading surface: ${resourceName}`,
          activeReadingResource?.currentPassageText
            ? `current_passage:\n${activeReadingResource.currentPassageText}`
            : undefined,
          activeReadingResource?.visibleStartText
            ? `visible_start:\n${activeReadingResource.visibleStartText}`
            : undefined,
          activeReadingResource?.visibleEndText
            ? `visible_end:\n${activeReadingResource.visibleEndText}`
            : undefined,
          activeReadingResource?.readingTrail?.length
            ? `reading_trail:\n${activeReadingResource.readingTrail
                .map((entry) => {
                  const details = [
                    formatReaderPositionAnchor(entry.anchor),
                    entry.fraction !== undefined ? `fraction=${entry.fraction}` : undefined,
                  ].filter((detail): detail is string => detail !== undefined)
                  return `- ${entry.label}${details.length > 0 ? ` (${details.join(", ")})` : ""}`
                })
                .join("\n")}`
            : undefined,
          activeReadingResource?.annotationSummary?.length
            ? `recent_annotations:\n${activeReadingResource.annotationSummary
                .map((entry) => `- ${entry.text}${entry.note ? ` (note: ${entry.note})` : ""}`)
                .join("\n")}`
            : undefined,
        ].filter((part): part is string => part !== undefined)

        return {
          targetStatus,
          title: resourceName,
          metadata,
          content: contentParts.join("\n\n"),
          refs: [
            workspaceFileRef({
              path: normalizedPath,
              note: "Reading file on Bench.",
            }),
            ...(objectID
              ? [
                  objectRef({
                    objectID,
                    note: "Prepared reading resource object.",
                  }),
                ]
              : []),
          ],
          hints: ["Use resource or file tools for broader book context."],
        }
      },
    }),
    [
      activeReadingResource,
      normalizedPath,
      props.target,
      readerStatus,
      resourceName,
      resourceRecord,
      targetStatus,
    ],
  )
  useRegisterBenchContextProvider({ target: props.target, provider: contextProvider })

  async function processResourceForBuddy() {
    if (!readyDirectory || !normalizedPath || processing) return
    setProcessing(true)
    setProcessingError(undefined)
    try {
      if (resourceRecord?.objectID) {
        await rebuildResource(readyDirectory, { resourceKey: resourceRecord.objectID })
      } else {
        await addResource(readyDirectory, { sourcePath: normalizedPath })
      }
      await queryClient.invalidateQueries({
        queryKey: resourcesQueryOptions(readyDirectory).queryKey,
      })
    } catch (error) {
      setProcessingError(stringifyError(error))
      toast.error(stringifyError(error))
    } finally {
      setProcessing(false)
    }
  }

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
      ...(resourceRecord?.objectID ? { objectID: resourceRecord.objectID } : {}),
      ...(resourceRecord?.alias ? { alias: resourceRecord.alias } : {}),
      name: resourceName,
      path: normalizedPath,
      ...(resourceRecord?.status ? { status: resourceRecord.status } : {}),
    })
    setLastOpenedReadingResource(readyDirectory, {
      ...(resourceRecord?.objectID ? { objectID: resourceRecord.objectID } : {}),
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
  function stageReadingSelection(input: ReaderSelection) {
    const promptKey = readyController.mainPaneProps.chatState.promptKey
    const setPromptDraft = readyController.mainPaneProps.chatState.setPromptDraft
    const currentDraft = getPromptDraft(usePromptStore.getState(), promptKey)
    const resourceKey = resourceRecord?.objectID ?? resourceRecord?.alias ?? props.resourceKey
    setPromptDraft(
      promptKey,
      appendReadingSelectionToDraft(currentDraft, {
        text: input.text,
        selectionKey: input.selectionKey,
        ...(resourceKey ? { resourceKey } : {}),
        anchor: input.anchor,
        ...(input.tocLabel ? { tocLabel: input.tocLabel } : {}),
        ...(input.pageLabel ? { pageLabel: input.pageLabel } : {}),
        ...(input.locationLabel ? { locationLabel: input.locationLabel } : {}),
      }),
    )
  }

  function removeStagedReadingSelection(selectionKey: string) {
    const promptKey = readyController.mainPaneProps.chatState.promptKey
    const setPromptDraft = readyController.mainPaneProps.chatState.setPromptDraft
    const currentDraft = getPromptDraft(usePromptStore.getState(), promptKey)
    const nextDraft = removeReadingSelectionFromDraft(currentDraft, selectionKey)
    if (nextDraft) setPromptDraft(promptKey, nextDraft)
  }

  return readyDirectory && normalizedPath ? (
    <div
      data-component="directory-chat-reading-page"
      className="flex h-full min-h-0 w-full flex-col"
    >
      {canProcessResource || processing || processingError ? (
        <div className="shrink-0 border-b border-border-base/70 bg-surface-base px-3 py-2 text-xs text-text-weak">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">
              {processingError
                ? `Processing failed: ${processingError}`
                : processing
                  ? "Processing for Buddy..."
                  : "Process this reader file for Buddy object context."}
            </span>
            {processingError ? (
              <Button size="sm" variant="outline" onClick={() => void processResourceForBuddy()}>
                Retry
              </Button>
            ) : canProcessResource ? (
              <Button size="sm" variant="outline" onClick={() => void processResourceForBuddy()}>
                Process for Buddy
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setProcessBannerDismissed(true)
                setProcessingError(undefined)
              }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <DirectoryChatReadingReaderPane
          directory={readyDirectory}
          resourceName={resourceName}
          resourcePath={normalizedPath}
          objectID={resourceRecord?.objectID}
          coverRelpath={resourceRecord?.coverRelpath}
          coverExtension={resourceFileExtensionFromFormat(resourceRecord?.format ?? "")}
          resourceStatus={resourceRecord?.status}
          onLocationChange={(location) => {
            updateActiveReadingResourceLocation(readyDirectory, location)
            if (location.tocLabel) {
              appendReadingTrailEntry(readyDirectory, {
                label: location.tocLabel,
                anchor: location.anchor,
                ...(location.fraction !== undefined ? { fraction: location.fraction } : {}),
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
    </div>
  ) : null
}
