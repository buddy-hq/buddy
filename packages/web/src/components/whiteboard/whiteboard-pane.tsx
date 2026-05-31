import { Button, Slider } from "@buddy/ui"
import type { WhiteboardsRevisionReadResponse, WhiteboardsReadResponse } from "@buddy/sdk"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpToLineIcon, ExternalLinkIcon, PlusIcon, PresentationIcon } from "lucide-react"
import { usePlatform } from "@/context/platform"
import { buddyResultMessage, getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { whiteboardQueryKeys, whiteboardSessionQueryOptions } from "./whiteboard-query"
import type { PersistedWhiteboardElement, WhiteboardViewport } from "./whiteboard-elements"
import {
  buildProgressiveWhiteboardPreviewFromMessages,
  countCompletedWhiteboardCreate,
  hasActiveWhiteboardCreate,
  hasUnfetchedCompletedWhiteboardCreate,
  readLatestStreamingWhiteboardRestoreSceneID,
  resolveStickyProgressiveWhiteboardPreview,
  type ProgressiveWhiteboardPreview,
} from "./whiteboard-progressive"
import { createWhiteboardShareJson } from "./whiteboard-share"
import {
  isLearnerEditContentAlreadyDurable,
  type WhiteboardLearnerSaveHandler,
} from "./whiteboard-learner-save"
import type { MessageWithParts } from "@/state/chat-types"

const WhiteboardCanvas = lazy(async () => {
  const module = await import("./whiteboard-canvas")
  return { default: module.WhiteboardCanvas }
})

const HTTP_CONFLICT_STATUS = 409

type WhiteboardPaneProps = {
  directory: string
  sessionID?: string
  isBusy: boolean
  messages: MessageWithParts[]
}

type LiveWhiteboardRevision = {
  elements: PersistedWhiteboardElement[]
  viewport: WhiteboardViewport
}

type ShareableWhiteboardRevision = Pick<WhiteboardsRevisionReadResponse, "elements">

function readRevisionLabel(revision: WhiteboardsRevisionReadResponse) {
  return revision.origin === "learner" ? "Learner edit" : "Whiteboard revision"
}

function resolveWhiteboardShareRevision(input: {
  previewRevisionID?: string
  displayedRevision?: ShareableWhiteboardRevision
  liveDraftRevision?: LiveWhiteboardRevision
  latestRevision?: ShareableWhiteboardRevision
}): ShareableWhiteboardRevision | undefined {
  if (input.previewRevisionID) return input.displayedRevision
  return input.liveDraftRevision ?? input.latestRevision ?? input.displayedRevision
}

export function WhiteboardPane(props: WhiteboardPaneProps) {
  const { directory, sessionID, isBusy, messages } = props
  const platform = usePlatform()
  const queryClient = useQueryClient()
  const [previewRevisionID, setPreviewRevisionID] = useState<string>()
  const [creatingScene, setCreatingScene] = useState(false)
  const [sharingBoard, setSharingBoard] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [shareStatus, setShareStatus] = useState<string>()
  const [liveDraftRevision, setLiveDraftRevision] = useState<LiveWhiteboardRevision>()
  const previousSceneKeyRef = useRef<string>()
  const settleLearnerSaveRef = useRef<() => Promise<boolean>>()
  const sessionQuery = useQuery({
    ...whiteboardSessionQueryOptions(directory, sessionID ?? ""),
    enabled: Boolean(sessionID),
  })
  const refetchSession = sessionQuery.refetch
  const activeScene = sessionQuery.data?.activeScene
  const revisions = activeScene?.revisions ?? []
  const streamingRestoreSceneID = useMemo(
    () => readLatestStreamingWhiteboardRestoreSceneID(messages),
    [messages],
  )
  const needsStreamingRestoreScene =
    streamingRestoreSceneID !== undefined && streamingRestoreSceneID !== activeScene?.sceneID
  const streamingRestoreSceneQuery = useQuery({
    queryKey: ["whiteboard", directory, sessionID, "scene", streamingRestoreSceneID, "latest"],
    enabled: Boolean(sessionID && needsStreamingRestoreScene),
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(directory).whiteboards.scene.latest.read({
          sessionID: sessionID ?? "",
          sceneID: streamingRestoreSceneID ?? "",
        }),
      ),
  })
  const progressiveBaseRevision = needsStreamingRestoreScene
    ? streamingRestoreSceneQuery.data
    : activeScene?.latestRevision
  const progressiveBaseSceneID = needsStreamingRestoreScene
    ? streamingRestoreSceneID
    : activeScene?.sceneID
  const progressiveBaseRevisionID = needsStreamingRestoreScene
    ? streamingRestoreSceneQuery.data?.revisionID
    : activeScene?.headRevisionID
  const latestIndex = Math.max(0, revisions.length - 1)
  const selectedIndex = previewRevisionID
    ? Math.max(
        0,
        revisions.findIndex((revision) => revision.revisionID === previewRevisionID),
      )
    : latestIndex
  const previewQuery = useQuery({
    queryKey: ["whiteboard", directory, sessionID, "revision", previewRevisionID],
    enabled: Boolean(sessionID && previewRevisionID),
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(directory).whiteboards.revision.read({
          sessionID: sessionID ?? "",
          revisionID: previewRevisionID ?? "",
        }),
      ),
  })
  const revision = previewRevisionID ? previewQuery.data : activeScene?.latestRevision
  const computedProgressivePreview = useMemo(
    () =>
      buildProgressiveWhiteboardPreviewFromMessages({
        messages,
        activeSceneID: progressiveBaseSceneID,
        baseRevisionID: progressiveBaseRevisionID,
        baseElements: progressiveBaseRevision?.elements ?? [],
        ...(progressiveBaseRevision?.viewport
          ? { baseViewport: progressiveBaseRevision.viewport }
          : {}),
      }),
    [messages, progressiveBaseRevision, progressiveBaseRevisionID, progressiveBaseSceneID],
  )
  const completedWhiteboardCreateCount = useMemo(
    () => countCompletedWhiteboardCreate(messages),
    [messages],
  )
  const hasActiveWhiteboardCreateTool = useMemo(
    () => hasActiveWhiteboardCreate(messages),
    [messages],
  )
  const hasUnfetchedCompletedWhiteboardCreateTool = useMemo(
    () =>
      hasUnfetchedCompletedWhiteboardCreate({
        messages,
        baseRevisionID: progressiveBaseRevisionID,
      }),
    [messages, progressiveBaseRevisionID],
  )
  const [progressivePreview, setProgressivePreview] = useState<ProgressiveWhiteboardPreview>()
  const displayedRevision = useMemo(() => {
    if (revision && !previewRevisionID && progressivePreview) {
      return {
        ...revision,
        elements: progressivePreview.elements,
        ...(progressivePreview.viewport ? { viewport: progressivePreview.viewport } : {}),
      }
    }
    if (revision) return revision
    if (!progressivePreview) return undefined
    return {
      elements: progressivePreview.elements,
      ...(progressivePreview.viewport ? { viewport: progressivePreview.viewport } : {}),
    }
  }, [previewRevisionID, progressivePreview, revision])

  useEffect(() => {
    setProgressivePreview((current) =>
      resolveStickyProgressiveWhiteboardPreview({
        current,
        computed: computedProgressivePreview,
        retainWithoutComputed:
          hasActiveWhiteboardCreateTool || hasUnfetchedCompletedWhiteboardCreateTool,
      }),
    )
  }, [
    computedProgressivePreview,
    hasActiveWhiteboardCreateTool,
    hasUnfetchedCompletedWhiteboardCreateTool,
  ])

  useEffect(() => {
    if (!sessionID) return
    void refetchSession()
  }, [isBusy, refetchSession, sessionID])

  useEffect(() => {
    if (!sessionID || completedWhiteboardCreateCount === 0) return
    void refetchSession()
  }, [completedWhiteboardCreateCount, refetchSession, sessionID])

  useEffect(() => {
    const sceneKey = `${sessionID ?? ""}:${activeScene?.headRevisionID ?? ""}`
    if (previousSceneKeyRef.current === undefined) {
      previousSceneKeyRef.current = sceneKey
      return
    }
    if (previousSceneKeyRef.current === sceneKey) return
    previousSceneKeyRef.current = sceneKey
    setPreviewRevisionID(undefined)
    setProgressivePreview(undefined)
    setLiveDraftRevision(undefined)
  }, [activeScene?.headRevisionID, sessionID])

  const updateSessionData = useCallback(
    (data: WhiteboardsReadResponse) => {
      if (!sessionID) return
      queryClient.setQueryData(whiteboardQueryKeys.session(directory, sessionID), data)
      setPreviewRevisionID(undefined)
    },
    [directory, queryClient, sessionID],
  )

  const createScene = useCallback(async () => {
    if (!sessionID || creatingScene) return
    setCreatingScene(true)
    setSaveError(undefined)
    setShareStatus(undefined)
    try {
      const saveSettled = await settleLearnerSaveRef.current?.()
      if (saveSettled === false) {
        setSaveError(
          "The pending whiteboard edit did not save. Resolve it before creating a new scene.",
        )
        return
      }
      setLiveDraftRevision(undefined)
      updateSessionData(
        requireBuddyData(
          await getBuddyClient(directory).whiteboards.scene.create({
            sessionID,
          }),
        ),
      )
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setCreatingScene(false)
    }
  }, [creatingScene, directory, sessionID, updateSessionData])

  const shareBoard = useCallback(async () => {
    if (!sessionID || !displayedRevision || sharingBoard) return
    setSharingBoard(true)
    setSaveError(undefined)
    setShareStatus(undefined)
    try {
      const saveSettled = await settleLearnerSaveRef.current?.()
      if (saveSettled === false && !liveDraftRevision) {
        setSaveError("The pending whiteboard edit did not save. Try sharing again after it saves.")
        return
      }
      const refetched = await refetchSession()
      const revisionToShare = resolveWhiteboardShareRevision({
        previewRevisionID,
        displayedRevision,
        liveDraftRevision,
        latestRevision: refetched.data?.activeScene?.latestRevision,
      })
      if (!revisionToShare) return
      const json = await createWhiteboardShareJson(revisionToShare)
      const result = requireBuddyData(
        await getBuddyClient(directory).whiteboards.share.create({
          sessionID,
          json,
        }),
      )
      setShareStatus("Opening shared board…")
      platform.openLink(result.url)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSharingBoard(false)
    }
  }, [
    directory,
    displayedRevision,
    liveDraftRevision,
    platform,
    previewRevisionID,
    refetchSession,
    sessionID,
    sharingBoard,
  ])

  const registerLearnerSaveSettler = useCallback((settle: (() => Promise<boolean>) | undefined) => {
    settleLearnerSaveRef.current = settle
  }, [])

  const saveLearnerEdit = useCallback<WhiteboardLearnerSaveHandler>(
    async (input: {
      elements: PersistedWhiteboardElement[]
      viewport: WhiteboardViewport
      baseRevisionID?: string
    }) => {
      if (!sessionID || !activeScene || previewRevisionID || !input.baseRevisionID) {
        return { status: "skipped" }
      }
      setSaveError(undefined)
      setShareStatus(undefined)
      try {
        const result = await getBuddyClient(directory).whiteboards.scene.saveLearnerEdit({
          sessionID,
          sceneID: activeScene.sceneID,
          baseRevisionID: input.baseRevisionID,
          elements: input.elements,
          viewport: input.viewport,
        })
        if (result.response?.status === HTTP_CONFLICT_STATUS) {
          const refetched = await refetchSession()
          if (
            refetched.data?.activeScene &&
            isLearnerEditContentAlreadyDurable({
              latestElements: refetched.data.activeScene.latestRevision.elements,
              elements: input.elements,
            })
          ) {
            setSaveError(undefined)
            return {
              status: "saved",
              baseRevisionID: refetched.data.activeScene.headRevisionID,
            }
          }
          setSaveError(buddyResultMessage(result))
          return {
            status: "failed",
            ...(refetched.data?.activeScene
              ? { baseRevisionID: refetched.data.activeScene.headRevisionID }
              : {}),
          }
        }
        const data = requireBuddyData(result)
        updateSessionData(data)
        return data.activeScene
          ? { status: "saved", baseRevisionID: data.activeScene.headRevisionID }
          : { status: "failed" }
      } catch (error) {
        const refetched = await refetchSession()
        setSaveError(error instanceof Error ? error.message : String(error))
        return {
          status: "failed",
          ...(refetched.data?.activeScene
            ? { baseRevisionID: refetched.data.activeScene.headRevisionID }
            : {}),
        }
      }
    },
    [activeScene, directory, previewRevisionID, refetchSession, sessionID, updateSessionData],
  )

  const revisionStatus = useMemo(() => {
    if (!revision) return undefined
    if (!previewRevisionID) return `Latest · ${revisions.length} revisions`
    return `${readRevisionLabel(revision)} · ${selectedIndex + 1} of ${revisions.length}`
  }, [previewRevisionID, revision, revisions.length, selectedIndex])

  return (
    <section
      data-component="whiteboard-pane"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base"
    >
      <header className="flex min-h-10 items-center gap-2 border-b border-border-base/60 bg-background-stronger/95 px-2.5">
        <PresentationIcon className="size-4 text-text-interactive-base" />
        <span className="text-xs font-medium text-text-base">Whiteboard</span>
        <span
          className={`min-w-0 flex-1 truncate text-[11px] ${
            saveError ? "text-icon-critical-base" : "text-text-weaker"
          }`}
        >
          {saveError ?? shareStatus ?? revisionStatus}
        </span>
        {previewRevisionID ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setPreviewRevisionID(undefined)}
          >
            <ArrowUpToLineIcon />
            Back to latest
          </Button>
        ) : null}
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={!sessionID || creatingScene}
          onClick={() => void createScene()}
        >
          <PlusIcon />
          New scene
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={!sessionID || !displayedRevision || sharingBoard}
          title="Upload the encrypted board to excalidraw.com and open the share link"
          onClick={() => void shareBoard()}
        >
          <ExternalLinkIcon />
          {sharingBoard ? "Sharing…" : "Share board"}
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        {displayedRevision ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-xs text-text-weaker">
                Loading whiteboard…
              </div>
            }
          >
            <WhiteboardCanvas
              revision={displayedRevision}
              readOnly={Boolean(previewRevisionID || progressivePreview)}
              onSave={saveLearnerEdit}
              onLiveRevisionChange={setLiveDraftRevision}
              onSaveSettlerChange={registerLearnerSaveSettler}
            />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-weaker">
            {isBusy ? "Opening whiteboard…" : "Create a scene to start using the whiteboard."}
          </div>
        )}
      </div>
      {activeScene ? (
        <footer className="flex min-h-9 items-center gap-3 border-t border-border-base/60 bg-background-stronger/95 px-3">
          <span className="text-[11px] text-text-weaker">History</span>
          <Slider
            min={0}
            max={latestIndex}
            step={1}
            value={[selectedIndex]}
            disabled={revisions.length <= 1}
            onValueChange={(value) => {
              const index = value[0] ?? latestIndex
              setPreviewRevisionID(index === latestIndex ? undefined : revisions[index]?.revisionID)
            }}
            className="flex-1"
          />
          {saveError ? (
            <span className="max-w-64 truncate text-[11px] text-icon-critical-base">
              {saveError}
            </span>
          ) : (
            <span className="text-[11px] tabular-nums text-text-weaker">
              {selectedIndex + 1}/{revisions.length}
            </span>
          )}
        </footer>
      ) : null}
    </section>
  )
}

export { resolveWhiteboardShareRevision }
