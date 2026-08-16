import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  LearnerMemoryArtifactsResponses,
  LearnerMemoryEvaluationRunResponses,
  LearnerMemoryLabRunResponses,
  LearnerMemoryLabStartResponses,
  LearnerMemoryLabStatusResponses,
  LearnerMemoryListResponses,
  LearnerMemoryPipelineDiagnosticsResponses,
  LearnerMemorySearchResponses,
  LearnerMemorySettingsResponses,
} from "@buddy/sdk"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import {
  BugIcon,
  GripVerticalIcon,
  Maximize2Icon,
  PaintbrushIcon,
  PowerIcon,
  RotateCcwIcon,
  XIcon,
} from "@/icons/app-icons"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CheckIcon,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  CopyIcon,
  Field,
  FieldGroup,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SparklesIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Z_INDEX,
  toast,
} from "@buddy/ui"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { language } from "@/context/language"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { useChatStore } from "@/state/chat-store"
import { useTranscriptSessionMessages } from "@/state/transcript-repository"
import { useGlobalLearnerMemorySettings } from "@/state/learner-memory-settings"
import { teachingSessionKey, useTeachingRuntime } from "@/state/teaching-runtime"
import { learnerSnapshotViewsQueryOptions } from "@/state/learner-query"
import { useOnboardingStore } from "@/state/onboarding-store"
import { useGetStartedFlowDevtools } from "@/state/get-started-flow-devtools"
import { useGetStartedFlow } from "@/state/use-get-started-flow"
import { invalidateAllProviderCatalogSnapshotQueries } from "@/state/bootstrap-query"
import {
  EXPERIMENTAL_FEATURE_ID,
  experimentalFeatureIsEnabled,
  experimentalFeaturesQueryOptions,
} from "@/state/experimental-features-query"
import { SystemPromptPanel } from "./system-prompt-panel"
import { PalettePanel } from "./palette-panel"
import { DevToolsContextTab } from "./devtools-context-tab"
import { DevToolsEaselTab } from "./devtools-easel-tab"
import { DevToolsTranscriptTab } from "./devtools-transcript-tab"
import { buildSessionTrace, copyToClipboard } from "@/lib/directory-chat/chat-debug-helpers"
import { OPENAI_PROVIDER_ID } from "@/lib/provider-ids"
import {
  formatProviderAuthError,
  removeProviderAuth,
  reloadProviderRuntime,
} from "@/lib/provider-auth"
import { buildOnboardingTestSearch, runOnboardingTestReset } from "@/lib/onboarding-test-mode"
import { patchGlobalConfig } from "@/state/chat-actions"
import {
  EMPTY_PERSONALIZATION_SETTINGS,
  buildPersonalizationPatch,
} from "@/state/project-config-readers"
import { setPersonalizationSettingsQueryData } from "@/state/personalization-settings-query"
import {
  GET_STARTED_FLOW_DEVTOOLS_MODE,
  isGetStartedFlowDevtoolsMode,
} from "@/lib/get-started-chats"
import { GET_STARTED_FLOW_STATUS, type GetStartedFlowStatus } from "@/lib/get-started-flow"
type BuddyDevToolsTab =
  | "palette"
  | "trace"
  | "context"
  | "system"
  | "snapshot"
  | "memory"
  | "query"
  | "actions"
  | "easel"
  | "transcript"

const DEVTOOLS_AFFORDANCE_POSITIONS = [
  "bottom-right",
  "top-right",
  "bottom-left",
  "top-left",
] as const

type DevToolsAffordancePosition = (typeof DEVTOOLS_AFFORDANCE_POSITIONS)[number]

type Rect = {
  left: number
  top: number
  width: number
  height: number
}

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

const MIN_DEVTOOLS_WIDTH = 320
const MIN_DEVTOOLS_HEIGHT = 200
const DEFAULT_DEVTOOLS_WIDTH = 420
const DEVTOOLS_FLOATING_PADDING_PX = 12
const DEVTOOLS_RECT_STORAGE_KEY = "buddy-devtools-rect-v3"
const DEVTOOLS_AFFORDANCE_POSITION_STORAGE_KEY = "buddy-devtools-affordance-position-v1"
const GET_STARTED_FLOW_DEVTOOLS_MODE_SELECT_ID = "get-started-flow-devtools-mode"
const DEFAULT_DEVTOOLS_AFFORDANCE_POSITION: DevToolsAffordancePosition = "bottom-right"
const DESKTOP_TITLEBAR_SELECTOR = '[data-component="desktop-titlebar"]'
const MEMORY_DEVTOOLS_LIMIT = 30
const MEMORY_TEST_AUTO_MODEL_VALUE = "__auto__"
const MEMORY_TEST_DEFAULT_QUERY = "bridge validation boundary structured errors"
const MEMORY_TEST_MILLISECONDS_PER_MINUTE = 60_000
const MEMORY_TEST_MILLISECONDS_PER_HOUR = 60 * MEMORY_TEST_MILLISECONDS_PER_MINUTE
const MEMORY_TEST_MILLISECONDS_PER_DAY = 24 * MEMORY_TEST_MILLISECONDS_PER_HOUR
const DEVTOOLS_AFFORDANCE_POSITION_LABELS = {
  "bottom-right": "Bottom right",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "top-left": "Top left",
} satisfies Record<DevToolsAffordancePosition, string>
const GET_STARTED_FLOW_STATUS_LABELS = {
  [GET_STARTED_FLOW_STATUS.loading]: "Loading saved state",
  [GET_STARTED_FLOW_STATUS.dismissed]: "Hidden by app preference",
  [GET_STARTED_FLOW_STATUS.overriddenHidden]: "Forced hidden by DevTools",
  [GET_STARTED_FLOW_STATUS.outOfScope]: "Only shown in Inbox",
  [GET_STARTED_FLOW_STATUS.active]: "Visible",
} as const satisfies Record<GetStartedFlowStatus, string>
const DEVTOOLS_AFFORDANCE_POSITION_CLASS_NAMES = {
  "bottom-right": "bottom-3 right-3 items-end",
  "top-right": "right-3 items-end",
  "bottom-left": "bottom-3 left-3 items-start",
  "top-left": "left-3 items-start",
} satisfies Record<DevToolsAffordancePosition, string>

type LearnerMemoryRecord = LearnerMemoryListResponses[200]["memories"][number]
type LearnerMemoryEvaluationReport = LearnerMemoryEvaluationRunResponses[200]
type LearnerMemorySearchResult = LearnerMemorySearchResponses[200]["results"][number]
type LearnerMemoryPipelineDiagnostics = LearnerMemoryPipelineDiagnosticsResponses[200]
type LearnerMemoryArtifacts = LearnerMemoryArtifactsResponses[200]
type LearnerMemorySettings = LearnerMemorySettingsResponses[200]
type MemoryTestRunState = LearnerMemoryLabStatusResponses[200]
type MemoryTestRunHandle = LearnerMemoryLabStartResponses[200]
const MEMORY_TEST_PIPELINE_MODE = {
  off: "off",
  production: "production",
  force: "force",
} as const
type MemoryTestPipelineMode =
  (typeof MEMORY_TEST_PIPELINE_MODE)[keyof typeof MEMORY_TEST_PIPELINE_MODE]
type MemoryTestSelection = {
  pipelineMode: MemoryTestPipelineMode
  deterministicHarness: boolean
  modelHarness: boolean
  startupSweep: boolean
  searchProbe: boolean
}
type MemoryTestRunResult = LearnerMemoryLabRunResponses[200]
type MemoryTestSettingsDraft = Omit<
  LearnerMemorySettings,
  "extractModel" | "consolidationModel"
> & {
  extractModel: string
  consolidationModel: string
}
type MemoryTestNumberSettingKey = keyof Pick<
  MemoryTestSettingsDraft,
  | "minUserMessages"
  | "minSessionSpanMs"
  | "activeBurstGapMs"
  | "minActiveBurstMessages"
  | "minAssistantOutputTokens"
  | "attentionThreshold"
  | "maxExtractionCallsPerSession"
  | "maxExtractionCallsPerDay"
  | "defaultContextMemoryLimit"
  | "minStartupIdleMs"
  | "maxStartupSessionAgeMs"
  | "maxSessionsPerStartup"
  | "startupConcurrency"
  | "maxRawMemoriesForConsolidation"
  | "maxUnusedStageOneDays"
>
type MemoryTestModelSettingKey = keyof Pick<
  MemoryTestSettingsDraft,
  "extractModel" | "consolidationModel"
>
type MemoryTestBooleanSettingKey = keyof Pick<MemoryTestSettingsDraft, "enabled" | "autoExtract">

function isBuddyDevToolsTab(value: string): value is BuddyDevToolsTab {
  return (
    value === "palette" ||
    value === "trace" ||
    value === "context" ||
    value === "system" ||
    value === "snapshot" ||
    value === "memory" ||
    value === "query" ||
    value === "actions" ||
    value === "easel" ||
    value === "transcript"
  )
}

function isDevToolsAffordancePosition(value: string): value is DevToolsAffordancePosition {
  return (
    value === "bottom-right" ||
    value === "top-right" ||
    value === "bottom-left" ||
    value === "top-left"
  )
}

function isRightDevToolsAffordancePosition(position: DevToolsAffordancePosition): boolean {
  return position === "bottom-right" || position === "top-right"
}

function isTopDevToolsAffordancePosition(position: DevToolsAffordancePosition): boolean {
  return position === "top-right" || position === "top-left"
}

function readDefaultDevToolsWidth(maxWidth: number) {
  return Math.min(DEFAULT_DEVTOOLS_WIDTH, maxWidth)
}

function getDefaultDevToolsRect(position: DevToolsAffordancePosition): Rect {
  const { vw, topInset, maxHeight } = readViewportBounds()
  const width = readDefaultDevToolsWidth(vw)
  return {
    left: isRightDevToolsAffordancePosition(position) ? vw - width : 0,
    top: topInset,
    width,
    height: maxHeight,
  }
}

function isStoredRect(value: unknown): value is Rect {
  if (!value || typeof value !== "object") {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.left === "number" &&
    Number.isFinite(record.left) &&
    typeof record.top === "number" &&
    Number.isFinite(record.top) &&
    typeof record.width === "number" &&
    Number.isFinite(record.width) &&
    typeof record.height === "number" &&
    Number.isFinite(record.height)
  )
}

function readStoredDevToolsRect(): Rect | undefined {
  try {
    const raw = sessionStorage.getItem(DEVTOOLS_RECT_STORAGE_KEY)
    if (!raw) {
      return undefined
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredRect(parsed)) {
      return undefined
    }
    return clampRectToViewport(parsed)
  } catch {
    return undefined
  }
}

function writeStoredDevToolsRect(rect: Rect) {
  try {
    sessionStorage.setItem(DEVTOOLS_RECT_STORAGE_KEY, JSON.stringify(rect))
  } catch {
    // Ignore quota or private-mode storage failures in devtools.
  }
}

function readStoredDevToolsAffordancePosition(): DevToolsAffordancePosition {
  try {
    const raw = localStorage.getItem(DEVTOOLS_AFFORDANCE_POSITION_STORAGE_KEY)
    if (raw && isDevToolsAffordancePosition(raw)) {
      return raw
    }
  } catch {
    // Ignore storage failures in devtools.
  }
  return DEFAULT_DEVTOOLS_AFFORDANCE_POSITION
}

function writeStoredDevToolsAffordancePosition(position: DevToolsAffordancePosition) {
  try {
    localStorage.setItem(DEVTOOLS_AFFORDANCE_POSITION_STORAGE_KEY, position)
  } catch {
    // Ignore quota or private-mode storage failures in devtools.
  }
}

function readInitialDevToolsRect(position: DevToolsAffordancePosition): Rect {
  return readStoredDevToolsRect() ?? getDefaultDevToolsRect(position)
}

function clampRectToViewport(r: Rect): Rect {
  const { vw, vh, topInset, maxHeight } = readViewportBounds()
  const width = Math.min(Math.max(r.width, MIN_DEVTOOLS_WIDTH), vw)
  const minHeight = Math.min(MIN_DEVTOOLS_HEIGHT, maxHeight)
  const height = Math.min(Math.max(r.height, minHeight), maxHeight)
  const left = Math.min(Math.max(r.left, 0), vw - width)
  const top = Math.min(Math.max(r.top, topInset), vh - height)
  return { left, top, width, height }
}

function readDesktopTitlebarBottomOffset(): number {
  const titlebars = document.querySelectorAll(DESKTOP_TITLEBAR_SELECTOR)
  let maxBottom = 0

  for (const titlebar of titlebars) {
    if (!(titlebar instanceof HTMLElement)) {
      continue
    }

    const { bottom } = titlebar.getBoundingClientRect()
    if (!Number.isFinite(bottom) || bottom <= 0) {
      continue
    }

    maxBottom = Math.max(maxBottom, bottom)
  }

  return Math.ceil(maxBottom)
}

function readViewportBounds() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const topInset = Math.max(0, Math.min(readDesktopTitlebarBottomOffset(), vh))
  const maxHeight = Math.max(0, vh - topInset)
  return { vw, vh, topInset, maxHeight }
}

function useDevToolsRect(affordancePosition: DevToolsAffordancePosition) {
  const [rect, setRect] = useState<Rect>(() => readInitialDevToolsRect(affordancePosition))
  const draggingRef = useRef(false)
  const resizingRef = useRef(false)
  const startRef = useRef({
    x: 0,
    y: 0,
    rect: { left: 0, top: 0, width: 0, height: 0 },
  })

  const syncRectToViewport = useCallback(() => {
    setRect((prev) => clampRectToViewport(prev))
  }, [])

  useLayoutEffect(() => {
    syncRectToViewport()
  }, [syncRectToViewport])

  useEffect(() => {
    writeStoredDevToolsRect(rect)
  }, [rect])

  useEffect(() => {
    const handleResize = () => {
      syncRectToViewport()
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [syncRectToViewport])

  useEffect(() => {
    const titlebars = document.querySelectorAll(DESKTOP_TITLEBAR_SELECTOR)
    if (titlebars.length === 0) {
      return
    }

    const observer = new ResizeObserver(() => {
      syncRectToViewport()
    })

    for (const titlebar of titlebars) {
      if (titlebar instanceof HTMLElement) {
        observer.observe(titlebar)
      }
    }

    return () => observer.disconnect()
  }, [syncRectToViewport])

  const onDragPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      draggingRef.current = true
      startRef.current = {
        x: event.clientX,
        y: event.clientY,
        rect: { ...rect },
      }
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)

      const previousCursor = document.body.style.cursor
      document.body.style.cursor = "grabbing"

      const onPointerMove = (moveEvent: Event) => {
        if (!(moveEvent instanceof PointerEvent) || !draggingRef.current) return
        const dx = moveEvent.clientX - startRef.current.x
        const dy = moveEvent.clientY - startRef.current.y
        setRect(
          clampRectToViewport({
            ...startRef.current.rect,
            left: startRef.current.rect.left + dx,
            top: startRef.current.rect.top + dy,
          }),
        )
      }

      const onPointerUp = (upEvent: Event) => {
        if (!(upEvent instanceof PointerEvent) || !draggingRef.current) return
        draggingRef.current = false
        document.body.style.cursor = previousCursor
        target.releasePointerCapture(upEvent.pointerId)
        target.removeEventListener("pointermove", onPointerMove)
        target.removeEventListener("pointerup", onPointerUp)
        target.removeEventListener("pointercancel", onPointerUp)
      }

      target.addEventListener("pointermove", onPointerMove)
      target.addEventListener("pointerup", onPointerUp)
      target.addEventListener("pointercancel", onPointerUp)
    },
    [rect],
  )

  const onResizePointerDown = useCallback(
    (direction: ResizeDirection) => (event: React.PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      resizingRef.current = true
      startRef.current = {
        x: event.clientX,
        y: event.clientY,
        rect: { ...rect },
      }
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)

      const previousUserSelect = document.body.style.userSelect
      const previousOverflow = document.body.style.overflow
      document.body.style.userSelect = "none"
      document.body.style.overflow = "hidden"

      const onPointerMove = (moveEvent: Event) => {
        if (!(moveEvent instanceof PointerEvent) || !resizingRef.current) return
        const dx = moveEvent.clientX - startRef.current.x
        const dy = moveEvent.clientY - startRef.current.y
        const s = startRef.current.rect

        let nextLeft = s.left
        let nextTop = s.top
        let nextWidth = s.width
        let nextHeight = s.height

        if (direction.includes("e")) {
          nextWidth = Math.max(MIN_DEVTOOLS_WIDTH, s.width + dx)
        }
        if (direction.includes("w")) {
          const proposedWidth = Math.max(MIN_DEVTOOLS_WIDTH, s.width - dx)
          nextLeft = s.left + (s.width - proposedWidth)
          nextWidth = proposedWidth
        }
        if (direction.includes("s")) {
          nextHeight = Math.max(MIN_DEVTOOLS_HEIGHT, s.height + dy)
        }
        if (direction.includes("n")) {
          const proposedHeight = Math.max(MIN_DEVTOOLS_HEIGHT, s.height - dy)
          nextTop = s.top + (s.height - proposedHeight)
          nextHeight = proposedHeight
        }

        setRect(
          clampRectToViewport({
            left: nextLeft,
            top: nextTop,
            width: nextWidth,
            height: nextHeight,
          }),
        )
      }

      const onPointerUp = (upEvent: Event) => {
        if (!(upEvent instanceof PointerEvent) || !resizingRef.current) return
        resizingRef.current = false
        document.body.style.userSelect = previousUserSelect
        document.body.style.overflow = previousOverflow
        target.releasePointerCapture(upEvent.pointerId)
        target.removeEventListener("pointermove", onPointerMove)
        target.removeEventListener("pointerup", onPointerUp)
        target.removeEventListener("pointercancel", onPointerUp)
      }

      target.addEventListener("pointermove", onPointerMove)
      target.addEventListener("pointerup", onPointerUp)
      target.addEventListener("pointercancel", onPointerUp)
    },
    [rect],
  )

  const snapToAffordance = useCallback((position: DevToolsAffordancePosition) => {
    setRect(getDefaultDevToolsRect(position))
  }, [])

  const reset = useCallback(() => {
    snapToAffordance(affordancePosition)
  }, [affordancePosition, snapToAffordance])

  const snapLeft = useCallback(() => {
    const { vw, topInset, maxHeight } = readViewportBounds()
    setRect(
      clampRectToViewport({
        left: 0,
        top: topInset,
        width: readDefaultDevToolsWidth(vw),
        height: maxHeight,
      }),
    )
  }, [])

  const snapRight = useCallback(() => {
    const { vw, topInset, maxHeight } = readViewportBounds()
    const width = readDefaultDevToolsWidth(vw)
    setRect(
      clampRectToViewport({
        left: vw - width,
        top: topInset,
        width,
        height: maxHeight,
      }),
    )
  }, [])

  const snapBottom = useCallback(() => {
    const { vw, topInset, maxHeight } = readViewportBounds()
    const height = Math.floor(maxHeight / 2)
    setRect(
      clampRectToViewport({
        left: 0,
        top: topInset + height,
        width: vw,
        height,
      }),
    )
  }, [])

  const snapFloating = useCallback(() => {
    const { vw, vh, topInset, maxHeight } = readViewportBounds()
    const width = Math.min(640, Math.max(0, vw - DEVTOOLS_FLOATING_PADDING_PX * 2))
    const height = Math.min(420, Math.max(0, maxHeight - DEVTOOLS_FLOATING_PADDING_PX * 2))
    setRect(
      clampRectToViewport({
        left: Math.max(DEVTOOLS_FLOATING_PADDING_PX, vw - width - DEVTOOLS_FLOATING_PADDING_PX),
        top: Math.max(
          topInset + DEVTOOLS_FLOATING_PADDING_PX,
          vh - height - DEVTOOLS_FLOATING_PADDING_PX,
        ),
        width,
        height,
      }),
    )
  }, [])

  const snapMaximized = useCallback(() => {
    const { vw, topInset, maxHeight } = readViewportBounds()
    setRect(
      clampRectToViewport({
        left: 0,
        top: topInset,
        width: vw,
        height: maxHeight,
      }),
    )
  }, [])

  return {
    rect,
    setRect,
    onDragPointerDown,
    onResizePointerDown,
    snapToAffordance,
    reset,
    snapLeft,
    snapRight,
    snapBottom,
    snapFloating,
    snapMaximized,
  }
}

function useDesktopTitlebarTopInset() {
  const [topInset, setTopInset] = useState(readDesktopTitlebarBottomOffset)

  const syncTopInset = useCallback(() => {
    setTopInset(readDesktopTitlebarBottomOffset())
  }, [])

  useLayoutEffect(() => {
    syncTopInset()
  }, [syncTopInset])

  useEffect(() => {
    window.addEventListener("resize", syncTopInset)
    return () => window.removeEventListener("resize", syncTopInset)
  }, [syncTopInset])

  useEffect(() => {
    const titlebars = document.querySelectorAll(DESKTOP_TITLEBAR_SELECTOR)
    if (titlebars.length === 0) {
      return
    }

    const observer = new ResizeObserver(syncTopInset)

    for (const titlebar of titlebars) {
      if (titlebar instanceof HTMLElement) {
        observer.observe(titlebar)
      }
    }

    return () => observer.disconnect()
  }, [syncTopInset])

  return topInset
}

function getDevToolsAffordanceClassName(position: DevToolsAffordancePosition) {
  return `fixed flex flex-col gap-1.5 [-webkit-app-region:no-drag] ${DEVTOOLS_AFFORDANCE_POSITION_CLASS_NAMES[position]}`
}

function getDevToolsAffordanceStyle(position: DevToolsAffordancePosition, topInset: number) {
  if (!isTopDevToolsAffordancePosition(position)) {
    return { zIndex: Z_INDEX.devtools }
  }

  return {
    top: topInset + DEVTOOLS_FLOATING_PADDING_PX,
    zIndex: Z_INDEX.devtools,
  }
}

function RuntimeListSection(props: { title: string; items: string[]; empty: string }) {
  const displayItems = props.items.length > 0 ? props.items : [props.empty]
  const seen = new Map<string, number>()

  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-weak">
          {props.title}
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm">
          {displayItems.map((item) => {
            const occurrence = seen.get(item) ?? 0
            seen.set(item, occurrence + 1)
            return (
              <li key={`${props.title}:${item}:${occurrence}`} className="text-text-base">
                {item}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function DevToolsSnapshotTab(props: { directory: string }) {
  const { directory } = props
  const sessionID = useChatStore((s) => s.directories[directory]?.sessionID)
  const sessionKey = useMemo(
    () => (sessionID ? teachingSessionKey(directory, sessionID) : ""),
    [directory, sessionID],
  )
  const persona = useTeachingRuntime((state) =>
    sessionKey ? state.selectedPersonaBySession[sessionKey] : undefined,
  )

  const query = useQuery({
    ...learnerSnapshotViewsQueryOptions(directory, {
      persona,
      sessionID,
    }),
    enabled: directory.length > 0,
  })

  const curriculumView = query.data?.curriculum
  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : String(query.error)
    : undefined

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">{language.t("devtools.learnerSnapshot.title")}</p>
          <p className="text-[11px] text-text-weak">
            {curriculumView?.workspace.label ??
              language.t("devtools.learnerSnapshot.workspaceFallback")}{" "}
            {curriculumView?.coldStart ? language.t("devtools.learnerSnapshot.coldStartBadge") : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void query.refetch()
          }}
        >
          {language.t("common.refresh")}
        </Button>
      </div>

      {query.isPending ? (
        <div className="text-sm text-text-weak">
          {language.t("devtools.learnerSnapshot.loading")}
        </div>
      ) : curriculumView ? (
        <div className="flex-1 min-h-0 space-y-3 overflow-y-auto">
          <Card size="sm" className="gap-0 py-0">
            <CardContent className="space-y-3 px-3 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-text-base">
                  {language.t("devtools.learnerSnapshot.teachingWorkspaceState")}
                </p>
                <p className="text-sm text-text-weak">
                  {curriculumView.coldStart
                    ? language.t("devtools.learnerSnapshot.noGoals")
                    : language.t("devtools.learnerSnapshot.showingCurrentState")}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {curriculumView.sections.map((section) => (
              <RuntimeListSection
                key={section.title}
                title={section.title}
                items={section.items}
                empty=""
              />
            ))}
            <RuntimeListSection
              title={language.t("devtools.learnerSnapshot.constraints")}
              items={curriculumView.constraintsSummary}
              empty={language.t("devtools.learnerSnapshot.noConstraints")}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border-base/70 bg-background-base p-3 text-sm text-text-weak">
          {language.t("devtools.learnerSnapshot.unavailable")}
        </div>
      )}

      {error ? (
        <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function MemoryMetaRow(props: { label: string; value: string | number | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px]">
      <span className="text-text-weaker">{props.label}</span>
      <span className="truncate font-mono text-text-weak">{props.value ?? "none"}</span>
    </div>
  )
}

function MemoryRecordCard(props: { memory: LearnerMemoryRecord }) {
  const memory = props.memory
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="space-y-2 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-base">
              {memory.pinned ? "Pinned: " : ""}
              {memory.title}
            </p>
            <p className="mt-0.5 text-[11px] text-text-weak">
              {memory.status} · {memory.type} · {memory.memoryType ?? "semantic"}
            </p>
          </div>
          <span className="rounded border border-border-base/60 px-1.5 py-0.5 text-[10px] text-text-weak">
            {memory.confidence.toFixed(2)}
          </span>
        </div>
        <p className="line-clamp-3 text-xs text-text-weak">{memory.body}</p>
        <div className="space-y-1 border-t border-border-weaker-base pt-2">
          <MemoryMetaRow label="id" value={memory.id} />
          <MemoryMetaRow label="project" value={memory.projectPath} />
          <MemoryMetaRow label="strength" value={(memory.strength ?? 0.5).toFixed(2)} />
          <MemoryMetaRow label="last used" value={memory.lastUsedAt} />
          <MemoryMetaRow label="sources" value={memory.sourceEventIds.join(", ") || "none"} />
        </div>
      </CardContent>
    </Card>
  )
}

function MemorySearchCard(props: { result: LearnerMemorySearchResult }) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="space-y-2 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-text-base">{props.result.memory.title}</p>
          <span className="font-mono text-[11px] text-text-weak">
            {props.result.score.toFixed(2)}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-text-weak">{props.result.memory.body}</p>
        <p className="break-words font-mono text-[10px] leading-relaxed text-text-weaker">
          {props.result.reasons.join(" · ")}
        </p>
      </CardContent>
    </Card>
  )
}

function formatDiagnosticTime(value: number | null | undefined) {
  if (value === undefined || value === null || value <= 0) return "none"
  return new Date(value).toLocaleTimeString()
}

function PipelineJobCard(props: {
  title: string
  job?: LearnerMemoryPipelineDiagnostics["stageOneJobs"][number]
}) {
  if (!props.job) {
    return (
      <p className="rounded-md border border-border-base/60 p-3 text-xs text-text-weak">
        No {props.title.toLowerCase()} job recorded.
      </p>
    )
  }

  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="space-y-1 px-3 py-3">
        <p className="truncate text-sm font-medium text-text-base">{props.title}</p>
        <MemoryMetaRow label="job" value={props.job.jobKey} />
        <MemoryMetaRow label="worker" value={props.job.workerId ?? "none"} />
        <MemoryMetaRow label="attempts" value={props.job.attemptCount} />
        <MemoryMetaRow
          label="lease until"
          value={formatDiagnosticTime(props.job.leaseExpiresAtMs)}
        />
        <MemoryMetaRow label="retry after" value={formatDiagnosticTime(props.job.retryAfterMs)} />
        <MemoryMetaRow label="watermark" value={props.job.lastSuccessWatermarkMs ?? "none"} />
        <MemoryMetaRow label="failure" value={props.job.lastFailure ?? "none"} />
      </CardContent>
    </Card>
  )
}

function PipelineOutputCard(props: {
  output: LearnerMemoryPipelineDiagnostics["stageOneOutputs"][number]
}) {
  const output = props.output
  const usage = output.extractionUsage
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="space-y-1 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-text-base">{output.sessionId}</p>
          <span className="rounded border border-border-base/60 px-1.5 py-0.5 text-[10px] text-text-weak">
            {output.selectedForConsolidation ? "selected" : "not selected"}
          </span>
        </div>
        <MemoryMetaRow label="candidates" value={output.candidateCount} />
        <MemoryMetaRow label="usage count" value={output.usageCount} />
        <MemoryMetaRow
          label="model"
          value={
            output.extractionModel
              ? `${output.extractionModel.providerID}/${output.extractionModel.modelID}`
              : "none"
          }
        />
        <MemoryMetaRow label="cost" value={usage ? usage.cost.toFixed(5) : "none"} />
        <MemoryMetaRow
          label="tokens"
          value={
            usage
              ? `${usage.tokens.input}+${usage.tokens.output}+r${usage.tokens.reasoning}`
              : "none"
          }
        />
        <MemoryMetaRow label="path" value={output.outputPath} />
      </CardContent>
    </Card>
  )
}

function MemoryArtifactCard(props: { artifact: LearnerMemoryArtifacts["artifacts"][number] }) {
  const content = props.artifact.content ?? ""
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="space-y-2 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-text-base">{props.artifact.label}</p>
          <span className="rounded border border-border-base/60 px-1.5 py-0.5 text-[10px] text-text-weak">
            {props.artifact.exists ? `${content.length} chars` : "missing"}
          </span>
        </div>
        <MemoryMetaRow label="path" value={props.artifact.path} />
        {props.artifact.exists ? (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border-base/60 bg-background-base p-2 font-mono text-[10px] leading-relaxed text-text-weak">
            {content.slice(0, 4_000)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  )
}

function MemoryTestNumberControl(props: {
  label: string
  value: number
  min: number
  max?: number
  step?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] font-medium text-text-weaker">{props.label}</span>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        disabled={props.disabled}
        onChange={(event) => {
          const value = Number(event.currentTarget.value)
          if (Number.isFinite(value)) props.onChange(value)
        }}
        className="h-8 w-full rounded-md border border-border-base/60 bg-background-base px-2 text-xs text-text-base disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  )
}

function MemoryTestToggle(props: {
  checked: boolean
  label: string
  description: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border-base/60 bg-background-base px-2.5 py-2">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-text-base">{props.label}</span>
        <span className="block text-[11px] leading-relaxed text-text-weak">
          {props.description}
        </span>
      </span>
    </label>
  )
}

function MemoryTestPipelineOption(props: {
  selected: boolean
  label: string
  description: string
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onSelect}
      className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
        props.selected
          ? "border-border-interactive-base bg-surface-interactive-base/10"
          : "border-border-base/60 bg-background-base"
      }`}
    >
      <span
        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
          props.selected
            ? "border-border-interactive-base bg-surface-interactive-base text-text-on-interactive-base"
            : "border-border-base/60 bg-background-base"
        }`}
      >
        {props.selected ? <CheckIcon className="size-3" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-text-base">{props.label}</span>
        <span className="block text-[11px] leading-relaxed text-text-weak">
          {props.description}
        </span>
      </span>
    </button>
  )
}

function describeMemoryTestSkipReason(reason: string | undefined): string {
  switch (reason) {
    case "learner_memory_startup_disabled":
      return "Startup backfill is disabled because memory or auto-extract is off in effective config."
    case "learner_memory_disabled":
      return "Memory is disabled in the effective project config."
    case "internal_learner_memory_session":
      return "The selected session is an internal memory session."
    case "attention_gate_skip":
      return "The attention gate decided to skip extraction for this session."
    case "session_not_found":
      return "The selected session could not be found."
    case "already_claimed":
      return "This stage-one job was already claimed."
    case "already_processed":
      return "This session source was already processed."
    case "session_budget_exhausted":
      return "The per-session extraction budget is exhausted."
    case "daily_budget_exhausted":
      return "The daily extraction budget is exhausted."
    case "source_unchanged":
      return "The session source has not changed since the last extraction."
    default:
      return reason ?? "No skip reason reported."
  }
}

function memoryTestRunToastMessage(run: MemoryTestRunResult) {
  if (run.sessionExtraction?.skippedReason) {
    return {
      title: `Memory lab skipped: ${describeMemoryTestSkipReason(run.sessionExtraction.skippedReason)}`,
      tone: "error",
    }
  }
  if (run.startupPipeline?.skippedReason) {
    return {
      title: `Memory lab skipped: ${describeMemoryTestSkipReason(run.startupPipeline.skippedReason)}`,
      tone: "error",
    }
  }
  if (
    !run.sessionExtraction &&
    !run.deterministicReport &&
    !run.modelReport &&
    !run.searchResults
  ) {
    return {
      title: "Memory lab finished without running any pipeline step.",
      tone: "error",
    }
  }
  return {
    title: "Memory lab run complete",
    tone: "success",
  }
}

function describeMemoryTestStartupSessionOutcome(
  extraction: MemoryTestRunResult["sessionExtraction"] | undefined,
): string {
  if (!extraction) {
    return "Session was selected for startup sweep but did not report an extraction result."
  }
  if (extraction.skippedReason) {
    return describeMemoryTestSkipReason(extraction.skippedReason)
  }
  if (extraction.approvedCount > 0) {
    return "Extraction and consolidation produced approved memories in isolated lab storage."
  }
  if (extraction.candidateCount > 0) {
    return "Extraction produced candidates but none were approved into lab memory."
  }
  return "Run completed without generating candidate memories."
}

function memoryTestTraceToneClass(level: MemoryTestRunState["trace"][number]["level"]): string {
  switch (level) {
    case "error":
      return "text-icon-critical-base"
    case "warn":
      return "text-text-warning-base"
    default:
      return "text-text-weak"
  }
}

function memoryTestStatusClass(
  status: MemoryTestRunState["status"] | MemoryTestRunState["steps"][number]["status"],
): string {
  switch (status) {
    case "completed":
      return "bg-surface-success-base text-text-success-base"
    case "failed":
      return "bg-surface-critical-base/20 text-icon-critical-base"
    case "skipped":
      return "bg-surface-warning-base/20 text-text-warning-base"
    case "running":
      return "bg-surface-interactive-base/20 text-text-interactive-base"
    default:
      return "bg-surface-base text-text-weak"
  }
}

function describeMemoryTestSessionTrace(session: MemoryTestRunState["sessions"][number]): string {
  if (session.error) {
    return session.error
  }
  if (session.skippedReason) {
    return describeMemoryTestSkipReason(session.skippedReason)
  }
  if ((session.approvedCount ?? 0) > 0) {
    return "Extraction and consolidation produced approved memories in isolated lab storage."
  }
  if ((session.candidateCount ?? 0) > 0) {
    return "Extraction produced candidates but none were approved into lab memory."
  }
  if (session.status === "running") {
    return "This session is currently running."
  }
  if (session.status === "pending") {
    return "This session is queued."
  }
  return "Run completed without generating candidate memories."
}

function MemoryTestModelSelect(props: {
  label: string
  value: string
  autoDescription: string
  options: Array<{ value: string; label: string; description: string }>
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const options = props.value
    ? [
        ...(props.options.some((option) => option.value === props.value)
          ? []
          : [{ value: props.value, label: `Current · ${props.value}`, description: props.value }]),
        ...props.options,
      ]
    : props.options

  return (
    <label className="space-y-1">
      <span className="block text-[11px] font-medium text-text-weaker">{props.label}</span>
      <Select
        value={props.value || MEMORY_TEST_AUTO_MODEL_VALUE}
        disabled={props.disabled}
        onValueChange={(value) =>
          props.onChange(value === MEMORY_TEST_AUTO_MODEL_VALUE ? "" : value)
        }
      >
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent style={{ zIndex: Z_INDEX.devtoolsFloating }} position="popper">
          <SelectItem value={MEMORY_TEST_AUTO_MODEL_VALUE}>
            Auto · {props.autoDescription}
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

function MemoryTestReportCard(props: { title: string; report: LearnerMemoryEvaluationReport }) {
  const report = props.report
  const passed = report.failures.length === 0
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="space-y-2 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-text-base">{props.title}</p>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              passed
                ? "bg-surface-success-base text-text-success-base"
                : "bg-surface-critical-base/20 text-icon-critical-base"
            }`}
          >
            {passed ? "PASS" : "FAIL"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MemoryMetaRow label="mode" value={report.extractionMode} />
          <MemoryMetaRow label="fixtures" value={report.fixtureCount} />
          <MemoryMetaRow label="calls" value={report.extractionCalls} />
          <MemoryMetaRow label="candidates" value={report.candidateCount} />
          <MemoryMetaRow label="approved" value={report.approvedCount} />
          <MemoryMetaRow
            label="model"
            value={
              report.extractionModel
                ? `${report.extractionModel.providerID}/${report.extractionModel.modelID}`
                : "none"
            }
          />
        </div>
        <div className="space-y-1 border-t border-border-weaker-base pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
            Attention
          </p>
          {report.attentionDecisions.map((decision) => (
            <div key={decision.fixtureId} className="rounded bg-surface-base px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-medium text-text-base">{decision.fixtureId}</span>
                <span className="font-mono text-text-weak">
                  {decision.decision} · {decision.score.toFixed(1)}
                </span>
              </div>
              <p className="mt-1 break-words text-[10px] leading-relaxed text-text-weaker">
                {decision.reasons.join(" · ") || "no reasons"}
              </p>
            </div>
          ))}
        </div>
        {report.failures.length > 0 ? (
          <div className="space-y-1 border-t border-border-weaker-base pt-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-icon-critical-base">
              Failures
            </p>
            {report.failures.map((failure) => (
              <p key={failure} className="break-words text-[11px] text-icon-critical-base">
                {failure}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function createMemoryTestSettingsDraft(input?: LearnerMemorySettings): MemoryTestSettingsDraft {
  return {
    enabled: input?.enabled ?? false,
    autoExtract: input?.autoExtract ?? false,
    minUserMessages: input?.minUserMessages ?? 4,
    minSessionSpanMs: input?.minSessionSpanMs ?? 5 * MEMORY_TEST_MILLISECONDS_PER_MINUTE,
    activeBurstGapMs: input?.activeBurstGapMs ?? 10 * MEMORY_TEST_MILLISECONDS_PER_MINUTE,
    minActiveBurstMessages: input?.minActiveBurstMessages ?? 3,
    minAssistantOutputTokens: input?.minAssistantOutputTokens ?? 800,
    attentionThreshold: input?.attentionThreshold ?? 6,
    maxExtractionCallsPerSession: input?.maxExtractionCallsPerSession ?? 2,
    maxExtractionCallsPerDay: input?.maxExtractionCallsPerDay ?? 20,
    defaultContextMemoryLimit: input?.defaultContextMemoryLimit ?? 8,
    extractModel: input?.extractModel ?? "",
    consolidationModel: input?.consolidationModel ?? "",
    minStartupIdleMs: input?.minStartupIdleMs ?? 6 * MEMORY_TEST_MILLISECONDS_PER_HOUR,
    maxStartupSessionAgeMs: input?.maxStartupSessionAgeMs ?? 30 * MEMORY_TEST_MILLISECONDS_PER_DAY,
    maxSessionsPerStartup: input?.maxSessionsPerStartup ?? 16,
    startupConcurrency: input?.startupConcurrency ?? 8,
    maxRawMemoriesForConsolidation: input?.maxRawMemoriesForConsolidation ?? 256,
    maxUnusedStageOneDays: input?.maxUnusedStageOneDays ?? 30,
  }
}

function MemoryTestLab(props: { directory: string; sessionID?: string; onAfterRun: () => void }) {
  const settings = useGlobalLearnerMemorySettings()
  const onAfterRun = props.onAfterRun
  const settingsQuery = useQuery({
    queryKey: ["devtools", "learner-memory-settings", props.directory],
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).learner.memory.settings({
          directory: props.directory,
        }),
      ),
  })
  const refetchMemoryTestSettings = settingsQuery.refetch
  const [selection, setSelection] = useState<MemoryTestSelection>({
    pipelineMode:
      props.sessionID !== undefined
        ? MEMORY_TEST_PIPELINE_MODE.production
        : MEMORY_TEST_PIPELINE_MODE.off,
    deterministicHarness: false,
    modelHarness: false,
    startupSweep: false,
    searchProbe: false,
  })
  const [probeQuery, setProbeQuery] = useState(MEMORY_TEST_DEFAULT_QUERY)
  const [activeRunID, setActiveRunID] = useState<string>()
  const [runState, setRunState] = useState<MemoryTestRunState | MemoryTestRunHandle>()
  const [runError, setRunError] = useState<string>()
  const [running, setRunning] = useState(false)
  const [useLabTuning, setUseLabTuning] = useState(false)
  const [showHarnesses, setShowHarnesses] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<MemoryTestSettingsDraft>(
    createMemoryTestSettingsDraft,
  )
  const [draftDirty, setDraftDirty] = useState(false)
  const initializedDirectoryRef = useRef<string>()
  const previousSettingsSavingRef = useRef(settings.status.saving)
  const notifiedRunIDRef = useRef<string>()
  const statusQuery = useQuery({
    queryKey: ["devtools", "learner-memory-lab-status", props.directory, activeRunID],
    enabled: activeRunID !== undefined,
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).learner.memory.lab.status({
          directory: props.directory,
          runID: activeRunID ?? "",
        }),
      ),
    refetchInterval: (query) => (query.state.data?.status === "running" ? 1_000 : false),
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    if (initializedDirectoryRef.current !== props.directory) {
      initializedDirectoryRef.current = props.directory
      setActiveRunID(undefined)
      setRunState(undefined)
      setRunning(false)
      setRunError(undefined)
      setSettingsDraft(createMemoryTestSettingsDraft(settingsQuery.data))
      setDraftDirty(false)
      return
    }
    if (draftDirty) return
    setSettingsDraft(createMemoryTestSettingsDraft(settingsQuery.data))
  }, [draftDirty, props.directory, settingsQuery.data])
  useEffect(() => {
    if (props.sessionID) return
    setSelection((current) =>
      current.pipelineMode !== MEMORY_TEST_PIPELINE_MODE.off
        ? { ...current, pipelineMode: MEMORY_TEST_PIPELINE_MODE.off }
        : current,
    )
  }, [props.sessionID])
  useEffect(() => {
    if (selection.deterministicHarness || selection.modelHarness) {
      setShowHarnesses(true)
    }
  }, [selection.deterministicHarness, selection.modelHarness])
  useEffect(() => {
    const previousSaving = previousSettingsSavingRef.current
    previousSettingsSavingRef.current = settings.status.saving
    if (!previousSaving || settings.status.saving) {
      return
    }
    void refetchMemoryTestSettings()
  }, [refetchMemoryTestSettings, settings.status.saving])
  useEffect(() => {
    if (!statusQuery.data) return
    setRunState(statusQuery.data)
  }, [statusQuery.data])
  useEffect(() => {
    if (!runState || notifiedRunIDRef.current === runState.runID) return
    if (runState.status === "running") return
    notifiedRunIDRef.current = runState.runID
    setRunning(false)
    if (runState.status === "failed") {
      const message = runState.error ?? "Memory lab run failed."
      setRunError(message)
      toast.error(message)
      return
    }
    setRunError(undefined)
    if (runState.result) {
      onAfterRun()
      const toastMessage = memoryTestRunToastMessage(runState.result)
      if (toastMessage.tone === "success") {
        toast.success(toastMessage.title)
      } else {
        toast.error(toastMessage.title)
      }
    }
  }, [onAfterRun, runState])

  const modelOptions = settings.options.providers.flatMap((provider) =>
    provider.models.map((model) => ({
      value: `${provider.id}/${model.id}`,
      label: `${provider.name} · ${model.name}`,
      description: model.id,
    })),
  )
  const effectiveSettings = settingsQuery.data
  const runResult = runState?.result
  const disabled = settings.status.loading || settingsQuery.isPending || running
  const pipelineSelected =
    props.sessionID !== undefined && selection.pipelineMode !== MEMORY_TEST_PIPELINE_MODE.off
  const runEnabled = useLabTuning ? settingsDraft.enabled : (effectiveSettings?.enabled ?? false)
  const runAutoExtract = useLabTuning
    ? settingsDraft.autoExtract
    : (effectiveSettings?.autoExtract ?? false)
  const primaryRunSelected =
    pipelineSelected ||
    selection.startupSweep ||
    selection.deterministicHarness ||
    selection.modelHarness
  const selectedCount = [
    pipelineSelected,
    selection.startupSweep,
    selection.deterministicHarness,
    selection.modelHarness,
    primaryRunSelected && selection.searchProbe,
  ].filter(Boolean).length
  const showEnabledTuning =
    (pipelineSelected && selection.pipelineMode === MEMORY_TEST_PIPELINE_MODE.production) ||
    selection.startupSweep
  const showAutoExtractTuning = selection.startupSweep
  const showAttentionTuning =
    (pipelineSelected && selection.pipelineMode === MEMORY_TEST_PIPELINE_MODE.production) ||
    selection.startupSweep ||
    selection.deterministicHarness ||
    selection.modelHarness
  const showBudgetTuning =
    (pipelineSelected && selection.pipelineMode === MEMORY_TEST_PIPELINE_MODE.production) ||
    selection.startupSweep
  const showStartupTuning = selection.startupSweep
  const showConsolidationTuning = pipelineSelected || selection.startupSweep
  const hasVisibleTuningControls =
    showEnabledTuning ||
    showAutoExtractTuning ||
    showAttentionTuning ||
    showBudgetTuning ||
    showStartupTuning ||
    showConsolidationTuning
  useEffect(() => {
    if (primaryRunSelected || !selection.searchProbe) return
    setSelection((current) => ({ ...current, searchProbe: false }))
  }, [primaryRunSelected, selection.searchProbe])

  const setSelected = useCallback((key: keyof MemoryTestSelection, checked: boolean) => {
    setSelection((current) => ({ ...current, [key]: checked }))
  }, [])
  const setPipelineMode = useCallback((pipelineMode: MemoryTestPipelineMode) => {
    setSelection((current) => ({ ...current, pipelineMode }))
  }, [])

  const setNumberSetting = useCallback((key: MemoryTestNumberSettingKey, value: number) => {
    setDraftDirty(true)
    setSettingsDraft((current) => ({ ...current, [key]: value }))
  }, [])

  const setModelSetting = useCallback((key: MemoryTestModelSettingKey, value: string) => {
    setDraftDirty(true)
    setSettingsDraft((current) => ({ ...current, [key]: value }))
  }, [])

  const setBooleanSetting = useCallback((key: MemoryTestBooleanSettingKey, value: boolean) => {
    setDraftDirty(true)
    setSettingsDraft((current) => ({ ...current, [key]: value }))
  }, [])

  const runSelected = useCallback(async () => {
    if (selectedCount === 0) {
      setRunError("Select at least one test.")
      return
    }

    setRunning(true)
    setRunError(undefined)
    try {
      const selectionPayload = {
        deterministicHarness: selection.deterministicHarness,
        modelHarness: selection.modelHarness,
        startupSweep: selection.startupSweep,
        currentSessionExtraction: pipelineSelected,
        currentSessionExtractionForce: selection.pipelineMode === MEMORY_TEST_PIPELINE_MODE.force,
        searchProbe: selection.searchProbe,
      }
      const settingsPayload = useLabTuning
        ? settingsDraft
        : {
            extractModel: settingsDraft.extractModel,
            consolidationModel: settingsDraft.consolidationModel,
          }
      const started = requireBuddyData(
        await getBuddyClient(props.directory).learner.memory.lab.start({
          directory: props.directory,
          sessionID: props.sessionID,
          probeQuery,
          selection: selectionPayload,
          settings: settingsPayload,
        }),
      )
      notifiedRunIDRef.current = undefined
      setActiveRunID(started.runID)
      setRunState(started)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRunning(false)
      setRunError(message)
      toast.error(message)
    }
  }, [
    pipelineSelected,
    probeQuery,
    props.directory,
    props.sessionID,
    selectedCount,
    selection,
    settingsDraft,
    useLabTuning,
  ])

  const runButtonLabel =
    pipelineSelected &&
    !selection.startupSweep &&
    !selection.searchProbe &&
    !selection.deterministicHarness &&
    !selection.modelHarness
      ? "Run Default Pipeline"
      : selection.startupSweep &&
          !pipelineSelected &&
          !selection.searchProbe &&
          !selection.deterministicHarness &&
          !selection.modelHarness
        ? "Run Startup Sweep"
        : "Run Lab"

  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="space-y-3 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-base">Memory Test Lab</p>
            <p className="text-[11px] leading-relaxed text-text-weak">
              Default run follows production pipeline behavior using current config. Lab tuning is
              optional and isolated to this run.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={disabled || selectedCount === 0}
            onClick={() => void runSelected()}
          >
            {running ? "Running..." : runButtonLabel}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
            1. Pipeline mode
          </p>
          {selection.pipelineMode === MEMORY_TEST_PIPELINE_MODE.production && !runEnabled ? (
            <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2.5 py-2 text-[11px] leading-relaxed text-icon-critical-base">
              Default production pipeline will skip immediately because memory is currently disabled
              for this lab run. Use `Forced pipeline` or turn on `Enabled gate` under other lab-only
              tuning if you want to exercise extraction without changing real settings.
            </p>
          ) : null}
          <div className="grid gap-2 md:grid-cols-1">
            <MemoryTestPipelineOption
              selected={selection.pipelineMode === MEMORY_TEST_PIPELINE_MODE.production}
              disabled={disabled || !props.sessionID}
              label="Production pipeline (default)"
              description="Runs the real session path in order: enabled gate, internal-session guard, stage-one claim, attention gate, budget checks, extraction, and consolidation in isolated lab storage."
              onSelect={() => setPipelineMode(MEMORY_TEST_PIPELINE_MODE.production)}
            />
            <MemoryTestPipelineOption
              selected={selection.pipelineMode === MEMORY_TEST_PIPELINE_MODE.force}
              disabled={disabled || !props.sessionID}
              label="Forced pipeline"
              description="Runs the same extraction and consolidation path but bypasses enabled, attention, and budget gates."
              onSelect={() => setPipelineMode(MEMORY_TEST_PIPELINE_MODE.force)}
            />
            <MemoryTestPipelineOption
              selected={selection.pipelineMode === MEMORY_TEST_PIPELINE_MODE.off}
              disabled={disabled}
              label="No pipeline"
              description="Skip the real session pipeline and run only optional harnesses or search probe."
              onSelect={() => setPipelineMode(MEMORY_TEST_PIPELINE_MODE.off)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
            2. Startup backfill (optional)
          </p>
          {selection.startupSweep && (!runEnabled || !runAutoExtract) ? (
            <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2.5 py-2 text-[11px] leading-relaxed text-icon-critical-base">
              Startup sweep will skip immediately because this lab run currently has
              {runEnabled ? "" : " memory disabled"}
              {!runEnabled && !runAutoExtract ? " and" : ""}
              {runAutoExtract ? "" : " auto-extract disabled"}. Turn those on under other lab-only
              tuning if you want to exercise the production backfill path without changing real
              settings.
            </p>
          ) : null}
          <MemoryTestToggle
            checked={selection.startupSweep}
            disabled={disabled}
            label="Run startup sweep"
            description="Runs the production backfill path over older eligible sessions in this notebook: idle window, age window, per-startup cap, then per-session extraction and consolidation in isolated lab storage."
            onChange={(checked) => setSelected("startupSweep", checked)}
          />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
            3. Search probe (optional)
          </p>
          <MemoryTestToggle
            checked={selection.searchProbe}
            disabled={disabled || !primaryRunSelected}
            label="Run search probe"
            description="Run retrieval scoring probe after the selected pipeline, startup sweep, or harness execution."
            onChange={(checked) => setSelected("searchProbe", checked)}
          />
          {selection.searchProbe ? (
            <input
              type="search"
              value={probeQuery}
              disabled={disabled}
              onChange={(event) => setProbeQuery(event.currentTarget.value)}
              placeholder="Search probe query..."
              className="h-8 w-full rounded-md border border-border-base/60 bg-background-base px-3 text-xs text-text-base disabled:cursor-not-allowed disabled:opacity-50"
            />
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
            4. Model overrides
          </p>
          <div className="space-y-2 rounded-md border border-border-base/60 bg-background-base/40 px-2.5 py-2">
            <p className="text-[11px] leading-relaxed text-text-weak">
              Lab-only model overrides. These apply to every run mode, including the default
              production pipeline, so you can control extraction and consolidation cost directly.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <MemoryTestModelSelect
                label="Extraction model"
                value={settingsDraft.extractModel}
                options={modelOptions}
                autoDescription="OpenAI mini if connected, otherwise connected small model"
                disabled={disabled}
                onChange={(value) => setModelSetting("extractModel", value)}
              />
              <MemoryTestModelSelect
                label="Consolidation model"
                value={settingsDraft.consolidationModel}
                options={modelOptions}
                autoDescription="OpenAI full model if connected, otherwise notebook default"
                disabled={disabled}
                onChange={(value) => setModelSetting("consolidationModel", value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
              5. Extra harnesses
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              disabled={disabled}
              onClick={() => setShowHarnesses((current) => !current)}
            >
              {showHarnesses ? "Hide" : "Show"}
            </Button>
          </div>
          {showHarnesses ? (
            <div className="grid gap-2 md:grid-cols-2">
              <MemoryTestToggle
                checked={selection.deterministicHarness}
                disabled={disabled}
                label="Deterministic harness"
                description="Fixture harness for attention and extraction behavior. Not part of the production pipeline."
                onChange={(checked) => setSelected("deterministicHarness", checked)}
              />
              <MemoryTestToggle
                checked={selection.modelHarness}
                disabled={disabled}
                label="Model harness"
                description="Fixture model harness. Uses lab storage but does not run the production consolidation path."
                onChange={(checked) => setSelected("modelHarness", checked)}
              />
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border-base/60 px-2.5 py-2 text-[11px] text-text-weak">
              Hidden by default because harnesses are extra fixture runs, not pipeline steps.
            </p>
          )}
        </div>

        <MemoryTestToggle
          checked={useLabTuning}
          disabled={disabled}
          label="6. Other lab-only tuning overrides"
          description="Off by default. When on, only non-model settings that affect the selected run path are editable below. Real settings are unchanged."
          onChange={setUseLabTuning}
        />

        {useLabTuning ? (
          <>
            {!hasVisibleTuningControls ? (
              <p className="rounded-md border border-border-base/60 bg-background-base px-2.5 py-2 text-[11px] text-text-weak">
                No tuning settings affect the current selection. Search probe only reads whatever
                the run produced.
              </p>
            ) : null}

            {showEnabledTuning ? (
              <div className="grid gap-2 md:grid-cols-1">
                <MemoryTestToggle
                  checked={settingsDraft.enabled}
                  disabled={disabled}
                  label="Enabled gate"
                  description="Production pipeline only. When off, the default pipeline skips before extraction."
                  onChange={(checked) => setBooleanSetting("enabled", checked)}
                />
              </div>
            ) : null}

            {showAutoExtractTuning ? (
              <div className="grid gap-2 md:grid-cols-1">
                <MemoryTestToggle
                  checked={settingsDraft.autoExtract}
                  disabled={disabled}
                  label="Auto-extract gate"
                  description="Startup sweep only. When off, the production backfill path skips before scanning old sessions."
                  onChange={(checked) => setBooleanSetting("autoExtract", checked)}
                />
              </div>
            ) : null}

            {showAttentionTuning ? (
              <div className="space-y-2 rounded-md border border-border-base/60 bg-background-base/40 px-2.5 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  Attention gate
                </p>
                <div className="grid gap-2 md:grid-cols-3">
                  <MemoryTestNumberControl
                    label="Min messages"
                    min={1}
                    value={settingsDraft.minUserMessages}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("minUserMessages", value)}
                  />
                  <MemoryTestNumberControl
                    label="Min span ms"
                    min={1}
                    value={settingsDraft.minSessionSpanMs}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("minSessionSpanMs", value)}
                  />
                  <MemoryTestNumberControl
                    label="Burst gap ms"
                    min={1}
                    value={settingsDraft.activeBurstGapMs}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("activeBurstGapMs", value)}
                  />
                  <MemoryTestNumberControl
                    label="Min burst msgs"
                    min={1}
                    value={settingsDraft.minActiveBurstMessages}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("minActiveBurstMessages", value)}
                  />
                  <MemoryTestNumberControl
                    label="Min assistant tokens"
                    min={1}
                    value={settingsDraft.minAssistantOutputTokens}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("minAssistantOutputTokens", value)}
                  />
                  <MemoryTestNumberControl
                    label="Attention threshold"
                    min={1}
                    value={settingsDraft.attentionThreshold}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("attentionThreshold", value)}
                  />
                </div>
              </div>
            ) : null}

            {showBudgetTuning ? (
              <div className="space-y-2 rounded-md border border-border-base/60 bg-background-base/40 px-2.5 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  Extraction budget
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  <MemoryTestNumberControl
                    label="Per-session cap"
                    min={1}
                    value={settingsDraft.maxExtractionCallsPerSession}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("maxExtractionCallsPerSession", value)}
                  />
                  <MemoryTestNumberControl
                    label="Daily cap"
                    min={1}
                    value={settingsDraft.maxExtractionCallsPerDay}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("maxExtractionCallsPerDay", value)}
                  />
                </div>
              </div>
            ) : null}

            {showStartupTuning ? (
              <div className="space-y-2 rounded-md border border-border-base/60 bg-background-base/40 px-2.5 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  Startup backfill
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  <MemoryTestNumberControl
                    label="Min idle ms"
                    min={1}
                    value={settingsDraft.minStartupIdleMs}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("minStartupIdleMs", value)}
                  />
                  <MemoryTestNumberControl
                    label="Max age ms"
                    min={1}
                    value={settingsDraft.maxStartupSessionAgeMs}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("maxStartupSessionAgeMs", value)}
                  />
                  <MemoryTestNumberControl
                    label="Sessions per startup"
                    min={1}
                    value={settingsDraft.maxSessionsPerStartup}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("maxSessionsPerStartup", value)}
                  />
                  <MemoryTestNumberControl
                    label="Sweep concurrency"
                    min={1}
                    value={settingsDraft.startupConcurrency}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("startupConcurrency", value)}
                  />
                </div>
              </div>
            ) : null}

            {showConsolidationTuning ? (
              <div className="space-y-2 rounded-md border border-border-base/60 bg-background-base/40 px-2.5 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  Consolidation
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  <MemoryTestNumberControl
                    label="Consolidation input cap"
                    min={1}
                    value={settingsDraft.maxRawMemoriesForConsolidation}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("maxRawMemoriesForConsolidation", value)}
                  />
                  <MemoryTestNumberControl
                    label="Stage-one retention days"
                    min={1}
                    value={settingsDraft.maxUnusedStageOneDays}
                    disabled={disabled}
                    onChange={(value) => setNumberSetting("maxUnusedStageOneDays", value)}
                  />
                </div>
              </div>
            ) : null}

            <p className="text-[11px] leading-relaxed text-text-weak">
              Not used by this lab run: `defaultContextMemoryLimit`.
            </p>
          </>
        ) : null}

        {settingsQuery.error ? (
          <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
            {settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : String(settingsQuery.error)}
          </p>
        ) : null}
        {runError ? (
          <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
            {runError}
          </p>
        ) : null}
        {statusQuery.error ? (
          <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
            {statusQuery.error instanceof Error
              ? statusQuery.error.message
              : String(statusQuery.error)}
          </p>
        ) : null}

        {runState ? (
          <div className="space-y-2 border-t border-border-weaker-base pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                Run Status
              </p>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${memoryTestStatusClass(runState.status)}`}
              >
                {runState.status}
              </span>
            </div>
            <MemoryMetaRow label="run id" value={runState.runID} />
            <MemoryMetaRow label="started" value={new Date(runState.startedAt).toLocaleString()} />
            <MemoryMetaRow
              label="completed"
              value={
                runState.completedAt ? new Date(runState.completedAt).toLocaleString() : "running"
              }
            />
            <MemoryMetaRow label="lab root" value={runState.memoryRoot} />
            <MemoryMetaRow label="status file" value={runState.statusPath} />
            <MemoryMetaRow label="trace log" value={runState.tracePath} />
            <div className="grid grid-cols-2 gap-2">
              <MemoryMetaRow
                label="steps"
                value={`${runState.progress.completedSteps}/${runState.progress.totalSteps}`}
              />
              <MemoryMetaRow
                label="sessions"
                value={`${runState.progress.completedSessions}/${runState.progress.totalSessions}`}
              />
              <MemoryMetaRow label="running sessions" value={runState.progress.runningSessions} />
              <MemoryMetaRow label="skipped sessions" value={runState.progress.skippedSessions} />
              <MemoryMetaRow label="failed sessions" value={runState.progress.failedSessions} />
              <MemoryMetaRow label="candidates" value={runState.progress.candidateCount} />
              <MemoryMetaRow label="approved" value={runState.progress.approvedCount} />
            </div>

            {runState.steps.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  Step Trace
                </p>
                {runState.steps.map((step) => (
                  <Card key={step.key} size="sm" className="gap-0 py-0">
                    <CardContent className="space-y-1 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-text-base">{step.label}</p>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${memoryTestStatusClass(step.status)}`}
                        >
                          {step.status}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-text-weak">
                        {step.summary ?? "No step summary yet."}
                      </p>
                      <MemoryMetaRow
                        label="started"
                        value={
                          step.startedAt ? new Date(step.startedAt).toLocaleString() : "pending"
                        }
                      />
                      <MemoryMetaRow
                        label="completed"
                        value={
                          step.completedAt ? new Date(step.completedAt).toLocaleString() : "running"
                        }
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            {runState.sessions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  Session Trace
                </p>
                {runState.sessions.map((session) => (
                  <Card
                    key={`${session.scope}:${session.sessionID}`}
                    size="sm"
                    className="gap-0 py-0"
                  >
                    <CardContent className="space-y-1 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-base">
                            {session.title ?? session.sessionID}
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-text-weaker">
                            {session.scope === "current_session"
                              ? "current session"
                              : "startup sweep"}
                          </p>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${memoryTestStatusClass(session.status)}`}
                        >
                          {session.status}
                        </span>
                      </div>
                      <MemoryMetaRow label="session" value={session.sessionID} />
                      <MemoryMetaRow
                        label="updated"
                        value={
                          session.updatedAtMs
                            ? new Date(session.updatedAtMs).toLocaleString()
                            : "current session"
                        }
                      />
                      <p className="text-[11px] leading-relaxed text-text-weak">
                        {describeMemoryTestSessionTrace(session)}
                      </p>
                      <MemoryMetaRow label="candidates" value={session.candidateCount ?? "none"} />
                      <MemoryMetaRow label="approved" value={session.approvedCount ?? "none"} />
                      <MemoryMetaRow label="skip" value={session.skippedReason ?? "none"} />
                      {session.decision ? (
                        <p className="break-words text-[10px] leading-relaxed text-text-weaker">
                          Attention {session.decision.decision} · score {session.decision.score} ·{" "}
                          {session.decision.reasons.join(" · ") || "no reasons"}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            {runState.trace.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  Trace Log
                </p>
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-border-base/60 bg-background-base/40 p-2">
                  {runState.trace.map((event) => (
                    <div
                      key={event.id}
                      className="rounded border border-border-base/40 px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-3 text-[10px]">
                        <span className={memoryTestTraceToneClass(event.level)}>{event.level}</span>
                        <span className="font-mono text-text-weaker">
                          {new Date(event.at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-text-base">{event.message}</p>
                      {event.step || event.sessionID ? (
                        <p className="mt-1 break-words font-mono text-[10px] text-text-weaker">
                          {[event.step, event.sessionID].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                      {event.details ? (
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-text-weaker">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {runResult ? (
          <div className="space-y-2 border-t border-border-weaker-base pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
              Last Run · {new Date(runResult.ranAt).toLocaleTimeString()}
            </p>
            <MemoryMetaRow label="run id" value={runResult.runID} />
            <MemoryMetaRow label="lab root" value={runResult.memoryRoot} />
            {runResult.deterministicReport ? (
              <MemoryTestReportCard
                title="Deterministic Harness"
                report={runResult.deterministicReport}
              />
            ) : null}
            {runResult.modelReport ? (
              <MemoryTestReportCard title="Model Harness" report={runResult.modelReport} />
            ) : null}
            {runResult.sessionExtraction ? (
              <Card size="sm" className="gap-0 py-0">
                <CardContent className="space-y-1 px-3 py-3">
                  <p className="text-sm font-medium text-text-base">Current Session Extraction</p>
                  <p className="text-[11px] leading-relaxed text-text-weak">
                    {runResult.sessionExtraction.skippedReason
                      ? describeMemoryTestSkipReason(runResult.sessionExtraction.skippedReason)
                      : runResult.sessionExtraction.approvedCount > 0
                        ? "Extraction and consolidation produced approved memories in isolated lab storage."
                        : runResult.sessionExtraction.candidateCount > 0
                          ? "Extraction produced candidates but none were approved into lab memory."
                          : "Run completed without generating candidate memories."}
                  </p>
                  <MemoryMetaRow
                    label="decision"
                    value={runResult.sessionExtraction.decision?.decision}
                  />
                  <MemoryMetaRow
                    label="score"
                    value={runResult.sessionExtraction.decision?.score}
                  />
                  <MemoryMetaRow
                    label="candidates"
                    value={runResult.sessionExtraction.candidateCount}
                  />
                  <MemoryMetaRow
                    label="approved"
                    value={runResult.sessionExtraction.approvedCount}
                  />
                  <MemoryMetaRow
                    label="skip"
                    value={runResult.sessionExtraction.skippedReason ?? "none"}
                  />
                  <MemoryMetaRow
                    label="consolidation"
                    value={runResult.sessionExtraction.consolidationError ?? "none"}
                  />
                </CardContent>
              </Card>
            ) : null}
            {runResult.startupPipeline ? (
              <div className="space-y-2">
                <Card size="sm" className="gap-0 py-0">
                  <CardContent className="space-y-1 px-3 py-3">
                    <p className="text-sm font-medium text-text-base">Startup Sweep</p>
                    <p className="text-[11px] leading-relaxed text-text-weak">
                      {runResult.startupPipeline.skippedReason
                        ? describeMemoryTestSkipReason(runResult.startupPipeline.skippedReason)
                        : "Ran the production backfill path over older eligible sessions in isolated lab storage."}
                    </p>
                    <MemoryMetaRow label="scanned" value={runResult.startupPipeline.scanned} />
                    <MemoryMetaRow label="eligible" value={runResult.startupPipeline.eligible} />
                    <MemoryMetaRow label="attempted" value={runResult.startupPipeline.attempted} />
                    <MemoryMetaRow
                      label="skip"
                      value={runResult.startupPipeline.skippedReason ?? "none"}
                    />
                  </CardContent>
                </Card>
                {runResult.startupPipeline.sessions.length > 0
                  ? runResult.startupPipeline.sessions.map((session) => (
                      <Card key={session.sessionID} size="sm" className="gap-0 py-0">
                        <CardContent className="space-y-1 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-medium text-text-base">
                              {session.title ?? session.sessionID}
                            </p>
                            <span className="font-mono text-[10px] text-text-weaker">
                              {new Date(session.updatedAtMs).toLocaleString()}
                            </span>
                          </div>
                          <MemoryMetaRow label="session" value={session.sessionID} />
                          <p className="text-[11px] leading-relaxed text-text-weak">
                            {session.error ??
                              session.extraction?.consolidationError ??
                              describeMemoryTestStartupSessionOutcome(session.extraction)}
                          </p>
                          <MemoryMetaRow
                            label="candidates"
                            value={session.extraction?.candidateCount ?? "none"}
                          />
                          <MemoryMetaRow
                            label="approved"
                            value={session.extraction?.approvedCount ?? "none"}
                          />
                          <MemoryMetaRow
                            label="skip"
                            value={session.extraction?.skippedReason ?? "none"}
                          />
                          <MemoryMetaRow
                            label="consolidation"
                            value={session.extraction?.consolidationError ?? "none"}
                          />
                        </CardContent>
                      </Card>
                    ))
                  : null}
              </div>
            ) : null}
            {runResult.searchResults ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  Search Probe Results
                </p>
                {runResult.searchResults.length > 0 ? (
                  runResult.searchResults.map((result) => (
                    <MemorySearchCard key={result.memory.id} result={result} />
                  ))
                ) : (
                  <p className="rounded-md border border-border-base/60 p-3 text-xs text-text-weak">
                    No matching memory.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function DevToolsMemoryTab(props: { directory: string; sessionID?: string }) {
  const [queryText, setQueryText] = useState("")
  const memoryQuery = useQuery({
    queryKey: ["devtools", "learner-memory", props.directory],
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).learner.memory.list({
          directory: props.directory,
        }),
      ),
  })
  const pipelineQuery = useQuery({
    queryKey: ["devtools", "learner-memory-pipeline", props.directory],
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).learner.memory.pipeline.diagnostics({
          directory: props.directory,
        }),
      ),
  })
  const artifactsQuery = useQuery({
    queryKey: ["devtools", "learner-memory-artifacts", props.directory],
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).learner.memory.artifacts({
          directory: props.directory,
        }),
      ),
  })
  const searchQuery = useQuery({
    queryKey: ["devtools", "learner-memory-search", props.directory, queryText],
    enabled: queryText.trim().length > 0,
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).learner.memory.search({
          directory: props.directory,
          query: queryText,
          limit: 8,
          projectPath: props.directory,
        }),
      ),
  })

  const memories = memoryQuery.data?.memories.slice(0, MEMORY_DEVTOOLS_LIMIT) ?? []
  const sessionMemories = memories.filter((memory) =>
    memory.sourceEventIds.some((eventId) => eventId.includes(props.sessionID ?? "")),
  )

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium">Memory</p>
          <p className="text-[11px] text-text-weak">
            Session {props.sessionID ?? "none"} · {memories.length} loaded records
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => {
              void memoryQuery.refetch()
              void pipelineQuery.refetch()
              void artifactsQuery.refetch()
            }}
          >
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={!props.sessionID}
            onClick={() => {
              if (!props.sessionID) return
              void getBuddyClient(props.directory)
                .learner.memory.session.extract({
                  directory: props.directory,
                  sessionID: props.sessionID,
                  force: true,
                })
                .then(() => {
                  void memoryQuery.refetch()
                  void pipelineQuery.refetch()
                  void artifactsQuery.refetch()
                })
            }}
          >
            Extract Session
          </Button>
        </div>
      </div>

      <input
        type="search"
        value={queryText}
        onChange={(event) => setQueryText(event.currentTarget.value)}
        placeholder="Search memory for this turn..."
        className="mb-3 h-8 rounded-md border border-border-base/60 bg-background-base px-3 text-xs text-text-base"
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <section className="space-y-2">
          <MemoryTestLab
            directory={props.directory}
            sessionID={props.sessionID}
            onAfterRun={() => {
              void memoryQuery.refetch()
              void pipelineQuery.refetch()
              void artifactsQuery.refetch()
              if (queryText.trim().length > 0) {
                void searchQuery.refetch()
              }
            }}
          />
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
            Pipeline State
          </p>
          {pipelineQuery.data ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <PipelineJobCard title="Phase two" job={pipelineQuery.data.phaseTwoJob} />
                <Card size="sm" className="gap-0 py-0">
                  <CardContent className="space-y-1 px-3 py-3">
                    <p className="truncate text-sm font-medium text-text-base">Budget</p>
                    <MemoryMetaRow
                      label="today calls"
                      value={pipelineQuery.data.budget.todayCount}
                    />
                    <MemoryMetaRow
                      label="total calls"
                      value={pipelineQuery.data.budget.totalCount}
                    />
                    <MemoryMetaRow label="watermark" value={pipelineQuery.data.inputWatermarkMs} />
                    <MemoryMetaRow
                      label="stage outputs"
                      value={pipelineQuery.data.stageOneOutputs.length}
                    />
                  </CardContent>
                </Card>
              </div>
              {pipelineQuery.data.stageOneJobs.slice(0, 3).map((job) => (
                <PipelineJobCard key={job.jobKey} title="Stage one" job={job} />
              ))}
              {pipelineQuery.data.stageOneOutputs.slice(0, 4).map((output) => (
                <PipelineOutputCard key={output.sessionId} output={output} />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-border-base/60 p-3 text-xs text-text-weak">
              Loading pipeline diagnostics...
            </p>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
            Memory Artifacts
          </p>
          {artifactsQuery.data ? (
            <div className="space-y-2">
              {artifactsQuery.data.artifacts.map((artifact) => (
                <MemoryArtifactCard key={artifact.key} artifact={artifact} />
              ))}
              {artifactsQuery.data.rolloutSummaries.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                    Rollout Summaries
                  </p>
                  {artifactsQuery.data.rolloutSummaries.map((artifact) => (
                    <MemoryArtifactCard key={artifact.key} artifact={artifact} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="rounded-md border border-border-base/60 p-3 text-xs text-text-weak">
              Loading memory artifacts...
            </p>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
            Search Results
          </p>
          {queryText.trim().length === 0 ? (
            <p className="rounded-md border border-border-base/60 p-3 text-xs text-text-weak">
              Enter a query to see selected memories, scores, and ranking reasons.
            </p>
          ) : searchQuery.data?.results.length ? (
            searchQuery.data.results.map((result) => (
              <MemorySearchCard key={result.memory.id} result={result} />
            ))
          ) : (
            <p className="rounded-md border border-border-base/60 p-3 text-xs text-text-weak">
              No matching memory.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
            Current Session Links
          </p>
          {props.sessionID && sessionMemories.length > 0 ? (
            sessionMemories.map((memory) => <MemoryRecordCard key={memory.id} memory={memory} />)
          ) : (
            <p className="rounded-md border border-border-base/60 p-3 text-xs text-text-weak">
              No memory source is directly linked to this session yet.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
            Recent Records
          </p>
          {memoryQuery.isPending ? (
            <p className="rounded-md border border-border-base/60 p-3 text-xs text-text-weak">
              Loading memory records...
            </p>
          ) : memories.length > 0 ? (
            memories.map((memory) => <MemoryRecordCard key={memory.id} memory={memory} />)
          ) : (
            <p className="rounded-md border border-border-base/60 p-3 text-xs text-text-weak">
              No memory records.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function titleCaseLabel(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function CapabilitiesChips(props: { directory: string }) {
  const { directory } = props
  const sessionID = useChatStore((s) => s.directories[directory]?.sessionID)
  const messages = useTranscriptSessionMessages(directory, sessionID)
  const sessionKey = useMemo(
    () => (sessionID ? teachingSessionKey(directory, sessionID) : ""),
    [directory, sessionID],
  )
  const persona = useTeachingRuntime((state) =>
    sessionKey ? state.selectedPersonaBySession[sessionKey] : undefined,
  )

  const calledTools = useMemo(() => {
    const names = new Set<string>()
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "tool" && typeof part.tool === "string") {
          names.add(part.tool)
        }
      }
    }
    return names
  }, [messages])

  const query = useQuery({
    ...learnerSnapshotViewsQueryOptions(directory, {
      persona,
      sessionID,
    }),
    enabled: directory.length > 0,
  })

  const sessionRuntimeView = query.data?.sessionRuntime
  if (!sessionRuntimeView) return null

  const sections = [
    { label: "Persona", items: [sessionRuntimeView.persona] },
    { label: "State", items: [titleCaseLabel(sessionRuntimeView.teachingWorkspaceState)] },
    { label: "Tools", items: sessionRuntimeView.tools.allow },
    { label: "Skills", items: sessionRuntimeView.skills.allow },
    {
      label: "Subagents",
      items: sessionRuntimeView.subagents.allow,
    },
  ]

  return (
    <div className="space-y-1 px-3 py-2">
      {sections
        .filter((s) => s.items.length > 0)
        .map((section) => (
          <div key={section.label} className="flex items-baseline gap-2 text-[11px]">
            <span className="shrink-0 text-text-weaker w-20 text-right">{section.label}</span>
            <span className="font-mono leading-relaxed">
              {section.items.map((item, i) => (
                <span key={item}>
                  {i > 0 && <span className="text-text-weaker">{" · "}</span>}
                  <span
                    className={
                      calledTools.has(item)
                        ? "rounded bg-surface-success-base px-0.5 text-text-strong"
                        : "text-text-weak"
                    }
                  >
                    {item}
                  </span>
                </span>
              ))}
            </span>
          </div>
        ))}
    </div>
  )
}

function readDevInstanceName(): string | undefined {
  const buddyGlobals = Reflect.get(window, "__BUDDY__")
  if (!buddyGlobals || typeof buddyGlobals !== "object") return undefined

  const value = Reflect.get(buddyGlobals, "devInstanceName")
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

async function disconnectOpenAiAndReloadProviderRuntime(): Promise<void> {
  await removeProviderAuth({ providerID: OPENAI_PROVIDER_ID })
  await reloadProviderRuntime()
}

export function BuddyDevTools() {
  const [buddyOpen, setBuddyOpen] = useState(false)
  const [routerOpen, setRouterOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<BuddyDevToolsTab>("palette")
  const [isCopied, setIsCopied] = useState(false)
  const [isDisconnectingOpenAi, setIsDisconnectingOpenAi] = useState(false)
  const [isResettingOnboarding, setIsResettingOnboarding] = useState(false)
  const [affordancePosition, setAffordancePosition] = useState<DevToolsAffordancePosition>(
    readStoredDevToolsAffordancePosition,
  )
  const experimentalFeaturesQuery = useQuery(experimentalFeaturesQueryOptions())
  const learnerMemoryExperimentEnabled = experimentalFeatureIsEnabled(
    experimentalFeaturesQuery.data,
    EXPERIMENTAL_FEATURE_ID.learnerMemory,
  )
  const affordanceTopInset = useDesktopTitlebarTopInset()

  useEffect(() => {
    if (!learnerMemoryExperimentEnabled && activeTab === "memory") {
      setActiveTab("palette")
    }
  }, [activeTab, learnerMemoryExperimentEnabled])

  const {
    rect,
    onDragPointerDown,
    onResizePointerDown,
    snapToAffordance,
    reset,
    snapLeft,
    snapRight,
    snapBottom,
    snapFloating,
    snapMaximized,
  } = useDevToolsRect(affordancePosition)

  const traceSnapshot = useChatStore((s) => {
    const nextActiveDirectory = s.activeDirectory
    const nextDirectoryState = nextActiveDirectory ? s.directories[nextActiveDirectory] : undefined
    return {
      activeDirectory: nextActiveDirectory,
      directoryState: nextDirectoryState,
      sessionID: nextDirectoryState?.sessionID,
      streamStatus: s.streamStatus,
    }
  })
  const activeDirectory = traceSnapshot.activeDirectory
  const sessionID = traceSnapshot.sessionID
  const activeSessionTitle = useChatStore((state) => {
    if (!activeDirectory) {
      return undefined
    }

    const directoryState = state.directories[activeDirectory]
    if (!directoryState) {
      return undefined
    }

    const activeSessionID = directoryState.sessionID
    if (!activeSessionID) {
      return directoryState.sessionTitle || undefined
    }

    const resolvedTitle = directoryState.sessions.find(
      (session) => session.id === activeSessionID,
    )?.title
    return resolvedTitle || directoryState.sessionTitle || undefined
  })

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname
  const devInstanceName = readDevInstanceName()
  const getStartedFlowDevtoolsMode = useGetStartedFlowDevtools((state) => state.mode)
  const setGetStartedFlowDevtoolsMode = useGetStartedFlowDevtools((state) => state.setMode)
  const getStartedFlow = useGetStartedFlow(activeDirectory ?? "")

  const onboardingToggleLabel = isResettingOnboarding
    ? language.t("desktopTitlebar.resettingOnboarding")
    : pathname === "/onboarding"
      ? language.t("desktopTitlebar.completeOnboardingToExit")
      : language.t("desktopTitlebar.testOnboarding")

  const sessionTrace = useMemo(() => {
    const directory = traceSnapshot.activeDirectory
    if (!directory) {
      return ""
    }
    return buildSessionTrace({
      directory,
      directoryState: traceSnapshot.directoryState,
      sessionID: traceSnapshot.sessionID,
      streamStatus: traceSnapshot.streamStatus,
    })
  }, [traceSnapshot])

  const handleCopySessionTrace = useCallback(() => {
    if (!sessionTrace) {
      return
    }
    void copyToClipboard(sessionTrace)
    setIsCopied(true)
    const estTokens = Math.ceil(sessionTrace.length / 4)
    toast.success(
      `${language.t("desktopTitlebar.sessionTraceCopied")} (${estTokens.toLocaleString()} tokens)`,
    )
    setTimeout(() => setIsCopied(false), 2000)
  }, [sessionTrace])

  const handleAffordancePositionChange = useCallback(
    (value: string) => {
      if (!isDevToolsAffordancePosition(value)) {
        return
      }

      setAffordancePosition(value)
      writeStoredDevToolsAffordancePosition(value)
      snapToAffordance(value)
    },
    [snapToAffordance],
  )

  const handleDisconnectOpenAi = useCallback(async () => {
    setIsDisconnectingOpenAi(true)
    try {
      await disconnectOpenAiAndReloadProviderRuntime()
      toast.success(language.t("desktopTitlebar.openAiDisconnected"))
    } catch (error) {
      toast.error(
        formatProviderAuthError(error, language.t("desktopTitlebar.disconnectOpenAiFailed")),
      )
    } finally {
      setIsDisconnectingOpenAi(false)
    }
  }, [])

  const handleGetStartedFlowDevtoolsModeChange = useCallback(
    (value: string) => {
      if (isGetStartedFlowDevtoolsMode(value)) {
        setGetStartedFlowDevtoolsMode(value)
      }
    },
    [setGetStartedFlowDevtoolsMode],
  )

  const handleToggleOnboarding = useCallback(async () => {
    if (pathname === "/onboarding") {
      toast(language.t("desktopTitlebar.completeOnboardingToExit"))
      return
    }

    setIsResettingOnboarding(true)
    try {
      await runOnboardingTestReset({
        clearPersonalization: async () => {
          const updatedGlobal = await patchGlobalConfig(
            buildPersonalizationPatch(EMPTY_PERSONALIZATION_SETTINGS),
          )
          setPersonalizationSettingsQueryData(queryClient, updatedGlobal)
        },
        disconnectOpenAiAndReloadProviderRuntime,
        refreshProviderCatalog: () => invalidateAllProviderCatalogSnapshotQueries(queryClient),
        resetOnboardingState: () => useOnboardingStore.getState().reset(),
      })
      await navigate({
        to: "/onboarding",
        search: buildOnboardingTestSearch(),
      })
    } catch (error) {
      toast.error(
        formatProviderAuthError(error, language.t("desktopTitlebar.resetOnboardingFailed")),
      )
    } finally {
      setIsResettingOnboarding(false)
    }
  }, [navigate, pathname, queryClient])

  if (!import.meta.env.DEV) {
    return null
  }

  return (
    <>
      {/* Router devtools — native floating on lower left */}
      {routerOpen && <TanStackRouterDevtools position="bottom-left" />}

      {/* Unified trigger bar follows the selected affordance corner. */}
      <div
        className={getDevToolsAffordanceClassName(affordancePosition)}
        style={getDevToolsAffordanceStyle(affordancePosition, affordanceTopInset)}
      >
        {devInstanceName ? (
          <div className="max-w-72 truncate rounded-md border border-border-base bg-background-base/95 px-2 py-1 text-[11px] font-medium text-text-weak shadow-xl">
            {devInstanceName}
          </div>
        ) : null}
        <div className="flex items-center gap-1 rounded-lg border border-border-base bg-background-base px-1.5 py-1 shadow-xl">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                onClick={() => setBuddyOpen((v) => !v)}
                className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors ${
                  buddyOpen
                    ? "bg-surface-raised-base text-text-strong"
                    : "text-text-weak hover:bg-surface-base-hover hover:text-text-base"
                }`}
                title="Buddy DevTools"
              >
                <BugIcon className="size-3.5" />
                <span>Buddy</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent style={{ zIndex: Z_INDEX.devtoolsFloating }}>
              <ContextMenuItem disabled={!sessionTrace} onClick={handleCopySessionTrace}>
                <CopyIcon className="mr-2 size-3.5" />
                Copy Session Trace
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuLabel>Affordance position</ContextMenuLabel>
              <ContextMenuRadioGroup
                value={affordancePosition}
                onValueChange={handleAffordancePositionChange}
              >
                {DEVTOOLS_AFFORDANCE_POSITIONS.map((position) => (
                  <ContextMenuRadioItem key={position} value={position}>
                    {DEVTOOLS_AFFORDANCE_POSITION_LABELS[position]}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuContent>
          </ContextMenu>
          <div className="h-4 w-px bg-border-weaker-base" />
          <button
            type="button"
            onClick={() => setRouterOpen((v) => !v)}
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors ${
              routerOpen
                ? "bg-surface-raised-base text-text-strong"
                : "text-text-weak hover:bg-surface-base-hover hover:text-text-base"
            }`}
            title="Router DevTools"
          >
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span>Router</span>
          </button>
          <div className="h-4 w-px bg-border-weaker-base" />
          <button
            type="button"
            onClick={() => {
              setBuddyOpen(true)
              setActiveTab("easel")
              snapMaximized()
            }}
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors ${
              buddyOpen && activeTab === "easel"
                ? "bg-surface-raised-base text-text-strong"
                : "text-text-weak hover:bg-surface-base-hover hover:text-text-base"
            }`}
            title="Open Easel"
          >
            <PaintbrushIcon className="size-3.5" />
            <span>Easel</span>
          </button>
        </div>
      </div>
      {/* Buddy panel */}
      {buddyOpen && (
        <div
          className="fixed flex flex-col overflow-hidden rounded-lg border border-border-base bg-background-base shadow-xl [-webkit-app-region:no-drag]"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            maxWidth: "100vw",
            maxHeight: "100vh",
            zIndex: Z_INDEX.devtools,
          }}
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (isBuddyDevToolsTab(value)) {
                setActiveTab(value)
              }
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="shrink-0 border-b border-border-weaker-base">
              <div className="flex items-center">
                <div
                  className="flex shrink-0 cursor-grab items-center px-2 text-text-weaker hover:text-text-base"
                  onPointerDown={onDragPointerDown}
                  title="Drag to move"
                >
                  <GripVerticalIcon className="size-4" />
                </div>

                <div className="flex shrink-0 items-center gap-1 px-2">
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6"
                      title="Dock left"
                      onClick={snapLeft}
                    >
                      <div className="flex h-3 w-3 items-center justify-center rounded-sm border border-text-weaker">
                        <div className="h-full w-[2px] bg-text-weaker" />
                      </div>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6"
                      title="Dock right"
                      onClick={snapRight}
                    >
                      <div className="flex h-3 w-3 items-center justify-center rounded-sm border border-text-weaker">
                        <div className="ml-auto h-full w-[2px] bg-text-weaker" />
                      </div>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6"
                      title="Dock bottom"
                      onClick={snapBottom}
                    >
                      <div className="flex h-3 w-3 items-end justify-center rounded-sm border border-text-weaker">
                        <div className="h-[2px] w-full bg-text-weaker" />
                      </div>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6"
                      title="Floating"
                      onClick={snapFloating}
                    >
                      <div className="flex h-3 w-3 items-center justify-center rounded-sm border border-text-weaker">
                        <div className="h-2 w-2 rounded-[1px] border border-text-weaker" />
                      </div>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6"
                      title="Full screen"
                      aria-label="Open DevTools in full screen"
                      onClick={snapMaximized}
                    >
                      <Maximize2Icon className="size-3.5" />
                    </Button>
                  </div>

                  <div className="mx-1 h-4 w-px bg-border-weaker-base" />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="h-6 w-6"
                    title="Reset position"
                    onClick={reset}
                  >
                    <RotateCcwIcon className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="h-6 w-6"
                    onClick={() => setBuddyOpen(false)}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="min-w-0 overflow-x-auto border-b border-border-weaker-base">
                <TabsList variant="line" className="h-9 w-max justify-start px-2">
                  <TabsTrigger value="palette" className="text-xs">
                    Palette
                  </TabsTrigger>
                  <TabsTrigger value="trace" className="text-xs">
                    Trace
                  </TabsTrigger>
                  <TabsTrigger value="context" className="text-xs">
                    Context
                  </TabsTrigger>
                  <TabsTrigger value="system" className="text-xs">
                    System
                  </TabsTrigger>
                  <TabsTrigger value="snapshot" className="text-xs">
                    Snapshot
                  </TabsTrigger>
                  {learnerMemoryExperimentEnabled ? (
                    <TabsTrigger value="memory" className="text-xs">
                      Memory
                    </TabsTrigger>
                  ) : null}
                  <TabsTrigger value="query" className="text-xs">
                    Query
                  </TabsTrigger>
                  <TabsTrigger value="actions" className="text-xs">
                    Actions
                  </TabsTrigger>
                  <TabsTrigger value="easel" className="text-xs">
                    Easel
                  </TabsTrigger>
                  <TabsTrigger value="transcript" className="text-xs">
                    Transcript
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="actions" className="min-h-0 flex-1 overflow-y-auto p-3 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-text-weak">Session</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-[11px]"
                      disabled={!sessionTrace}
                      onClick={handleCopySessionTrace}
                    >
                      {isCopied ? (
                        <CheckIcon className="size-3.5 text-text-success-base" />
                      ) : (
                        <CopyIcon className="size-3.5" />
                      )}
                      {language.t("desktopTitlebar.copySessionTrace")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-[11px]"
                      disabled={isDisconnectingOpenAi || isResettingOnboarding}
                      onClick={handleDisconnectOpenAi}
                    >
                      <PowerIcon className="size-3.5" />
                      {language.t("desktopTitlebar.disconnectOpenAi")}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-text-weak">Onboarding</p>
                  <div className="flex flex-col items-start gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-[11px]"
                      disabled={isDisconnectingOpenAi || isResettingOnboarding}
                      onClick={() => {
                        void handleToggleOnboarding()
                      }}
                    >
                      <SparklesIcon className="size-3.5" />
                      {onboardingToggleLabel}
                    </Button>
                    <FieldGroup className="max-w-xs gap-2">
                      <Field orientation="horizontal">
                        <FieldLabel
                          htmlFor={GET_STARTED_FLOW_DEVTOOLS_MODE_SELECT_ID}
                          className="text-xs text-text-weak"
                        >
                          Get Started override
                        </FieldLabel>
                        <Select
                          value={getStartedFlowDevtoolsMode}
                          onValueChange={handleGetStartedFlowDevtoolsModeChange}
                        >
                          <SelectTrigger
                            id={GET_STARTED_FLOW_DEVTOOLS_MODE_SELECT_ID}
                            size="sm"
                            className="min-w-36 text-xs"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent
                            style={{ zIndex: Z_INDEX.devtoolsFloating }}
                            position="popper"
                          >
                            <SelectGroup>
                              <SelectItem value={GET_STARTED_FLOW_DEVTOOLS_MODE.appState}>
                                Use app state
                              </SelectItem>
                              <SelectItem value={GET_STARTED_FLOW_DEVTOOLS_MODE.hidden}>
                                Force hidden
                              </SelectItem>
                              <SelectItem value={GET_STARTED_FLOW_DEVTOOLS_MODE.student}>
                                Force student prompts
                              </SelectItem>
                              <SelectItem value={GET_STARTED_FLOW_DEVTOOLS_MODE.teacher}>
                                Force teacher prompts
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </FieldGroup>
                    <Badge variant="outline">
                      App setting: {getStartedFlow.enabled ? "On" : "Off"}
                    </Badge>
                    <Badge variant="secondary">
                      Effective: {GET_STARTED_FLOW_STATUS_LABELS[getStartedFlow.status]}
                    </Badge>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="system" className="min-h-0 flex-1 overflow-hidden mt-0">
              {activeDirectory ? (
                <SystemPromptPanel directory={activeDirectory} sessionID={sessionID} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-text-weak">
                  No active directory
                </div>
              )}
            </TabsContent>

            <TabsContent value="context" className="min-h-0 flex-1 overflow-hidden mt-0">
              {activeDirectory ? (
                <DevToolsContextTab directory={activeDirectory} sessionID={sessionID} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-text-weak">
                  No active directory
                </div>
              )}
            </TabsContent>

            <TabsContent value="palette" className="min-h-0 flex-1 overflow-hidden mt-0">
              <PalettePanel />
            </TabsContent>

            <TabsContent value="snapshot" className="min-h-0 flex-1 overflow-hidden mt-0">
              {activeDirectory ? (
                <DevToolsSnapshotTab directory={activeDirectory} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-text-weak">
                  No active directory
                </div>
              )}
            </TabsContent>

            {learnerMemoryExperimentEnabled ? (
              <TabsContent value="memory" className="min-h-0 flex-1 overflow-hidden mt-0">
                {activeDirectory ? (
                  <DevToolsMemoryTab directory={activeDirectory} sessionID={sessionID} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-text-weak">
                    No active directory
                  </div>
                )}
              </TabsContent>
            ) : null}

            <TabsContent value="trace" className="min-h-0 flex-1 overflow-hidden mt-0">
              {sessionTrace ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-border-weaker-base px-3 py-2">
                    <div className="min-w-0">
                      <p
                        className="truncate text-[11px] font-medium text-text-base"
                        title={activeSessionTitle ?? undefined}
                      >
                        {activeSessionTitle || "Untitled chat"}
                      </p>
                      <p className="text-xs font-medium text-text-weak">Trace</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 text-[11px]"
                      onClick={handleCopySessionTrace}
                    >
                      {isCopied ? (
                        <CheckIcon className="size-3 text-text-success-base" />
                      ) : (
                        <CopyIcon className="size-3" />
                      )}
                      {language.t("desktopTitlebar.copySessionTrace")}
                    </Button>
                  </div>
                  {activeDirectory ? (
                    <>
                      <CapabilitiesChips directory={activeDirectory} />
                      <div className="border-b border-border-weaker-base" />
                    </>
                  ) : null}
                  <pre className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed text-text-weak">
                    {sessionTrace}
                  </pre>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-text-weak">
                  No active session
                </div>
              )}
            </TabsContent>

            <TabsContent value="query" className="min-h-0 flex-1 overflow-hidden mt-0">
              <ReactQueryDevtoolsPanel style={{ height: "100%" }} />
            </TabsContent>

            <TabsContent value="easel" className="min-h-0 flex-1 overflow-hidden mt-0">
              <DevToolsEaselTab directory={activeDirectory} />
            </TabsContent>

            <TabsContent value="transcript" className="min-h-0 flex-1 overflow-hidden mt-0">
              <DevToolsTranscriptTab />
            </TabsContent>
          </Tabs>

          {/* Resize handles */}
          <div
            className="absolute inset-x-0 top-0 z-20 h-2 cursor-ns-resize"
            onPointerDown={onResizePointerDown("n")}
          />
          <div
            className="absolute inset-x-0 bottom-0 z-20 h-2 cursor-ns-resize"
            onPointerDown={onResizePointerDown("s")}
          />
          <div
            className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize"
            onPointerDown={onResizePointerDown("w")}
          />
          <div
            className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize"
            onPointerDown={onResizePointerDown("e")}
          />
          <div
            className="absolute left-0 top-0 z-20 h-3 w-3 cursor-nwse-resize"
            onPointerDown={onResizePointerDown("nw")}
          />
          <div
            className="absolute right-0 top-0 z-20 h-3 w-3 cursor-nesw-resize"
            onPointerDown={onResizePointerDown("ne")}
          />
          <div
            className="absolute bottom-0 left-0 z-20 h-3 w-3 cursor-nesw-resize"
            onPointerDown={onResizePointerDown("sw")}
          />
          <div
            className="absolute bottom-0 right-0 z-20 h-3 w-3 cursor-nwse-resize"
            onPointerDown={onResizePointerDown("se")}
          />
        </div>
      )}
    </>
  )
}
