import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { BugIcon, GripVerticalIcon, PowerIcon, RotateCcwIcon, XIcon } from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CheckIcon,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  CopyIcon,
  SparklesIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@buddy/ui"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { language } from "@/context/language"
import { useChatStore } from "@/state/chat-store"
import { teachingSessionKey, useTeachingRuntime } from "@/state/teaching-runtime"
import { learnerSnapshotViewsQueryOptions } from "@/state/learner-query"
import { SystemPromptPanel } from "./system-prompt-panel"
import { PalettePanel } from "./palette-panel"
import { buildSessionTrace, copyToClipboard } from "@/lib/directory-chat/chat-debug-helpers"
import { OPENAI_PROVIDER_ID } from "@/lib/provider-ids"
import {
  formatProviderAuthError,
  removeProviderAuth,
  reloadProviderRuntime,
} from "@/lib/provider-auth"
import {
  CHAT_ENTRY_PATH,
  buildOnboardingTestSearch,
  isOnboardingTestSearch,
  readOnboardingTestReturnTo,
  buildOnboardingChatEntryReturnTo,
} from "@/lib/onboarding-test-mode"

type BuddyDevToolsTab = "palette" | "trace" | "system" | "snapshot" | "query" | "actions"

type Rect = {
  left: number
  top: number
  width: number
  height: number
}

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

const MIN_DEVTOOLS_WIDTH = 320
const MIN_DEVTOOLS_HEIGHT = 200

function getDefaultDevToolsRect(): Rect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(420, vw)
  return {
    left: vw - width,
    top: 0,
    width,
    height: vh,
  }
}

function clampRectToViewport(r: Rect): Rect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(Math.max(r.width, MIN_DEVTOOLS_WIDTH), vw)
  const height = Math.min(Math.max(r.height, MIN_DEVTOOLS_HEIGHT), vh)
  const left = Math.min(Math.max(r.left, 0), vw - width)
  const top = Math.min(Math.max(r.top, 0), vh - height)
  return { left, top, width, height }
}

function useDevToolsRect() {
  const [rect, setRect] = useState<Rect>(getDefaultDevToolsRect)
  const draggingRef = useRef(false)
  const resizingRef = useRef(false)
  const startRef = useRef({
    x: 0,
    y: 0,
    rect: { left: 0, top: 0, width: 0, height: 0 },
  })

  useEffect(() => {
    const handleResize = () => {
      setRect((prev) => clampRectToViewport(prev))
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

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

  const reset = useCallback(() => {
    setRect(getDefaultDevToolsRect())
  }, [])

  const snapLeft = useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    setRect(clampRectToViewport({ left: 0, top: 0, width: Math.min(420, vw), height: vh }))
  }, [])

  const snapRight = useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(420, vw)
    setRect(clampRectToViewport({ left: vw - width, top: 0, width, height: vh }))
  }, [])

  const snapBottom = useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    setRect(
      clampRectToViewport({
        left: 0,
        top: Math.floor(vh / 2),
        width: vw,
        height: Math.floor(vh / 2),
      }),
    )
  }, [])

  const snapFloating = useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(640, vw - 24)
    const height = Math.min(420, vh - 24)
    setRect(
      clampRectToViewport({
        left: Math.max(12, vw - width - 12),
        top: Math.max(12, vh - height - 12),
        width,
        height,
      }),
    )
  }, [])

  return {
    rect,
    setRect,
    onDragPointerDown,
    onResizePointerDown,
    reset,
    snapLeft,
    snapRight,
    snapBottom,
    snapFloating,
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
  const teachingRuntime = useTeachingRuntime()
  const sessionKey = useMemo(
    () => (sessionID ? teachingSessionKey(directory, sessionID) : ""),
    [directory, sessionID],
  )
  const persona = sessionKey ? teachingRuntime.selectedPersonaBySession[sessionKey] : undefined

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
          <p className="text-xs font-medium">{language.t("rightSidebar.snapshot.title")}</p>
          <p className="text-[11px] text-text-weak">
            {curriculumView?.workspace.label ??
              language.t("rightSidebar.snapshot.workspaceFallback")}{" "}
            {curriculumView?.coldStart ? language.t("rightSidebar.snapshot.coldStartBadge") : ""}
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
        <div className="text-sm text-text-weak">{language.t("rightSidebar.snapshot.loading")}</div>
      ) : curriculumView ? (
        <div className="flex-1 min-h-0 space-y-3 overflow-y-auto">
          <Card size="sm" className="gap-0 py-0">
            <CardContent className="space-y-3 px-3 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-text-base">
                  {language.t("rightSidebar.snapshot.workspaceState")}
                </p>
                <p className="text-sm text-text-weak">
                  {curriculumView.coldStart
                    ? language.t("rightSidebar.snapshot.noGoals")
                    : language.t("rightSidebar.snapshot.showingCurrentState")}
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
              title={language.t("rightSidebar.snapshot.constraints")}
              items={curriculumView.constraintsSummary}
              empty={language.t("rightSidebar.snapshot.noConstraints")}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border-base/70 bg-background-base p-3 text-sm text-text-weak">
          {language.t("rightSidebar.unavailable.snapshot")}
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
  const messages = useChatStore((s) => s.directories[directory]?.messages ?? [])
  const teachingRuntime = useTeachingRuntime()
  const sessionKey = useMemo(
    () => (sessionID ? teachingSessionKey(directory, sessionID) : ""),
    [directory, sessionID],
  )
  const persona = sessionKey ? teachingRuntime.selectedPersonaBySession[sessionKey] : undefined

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

  const capabilitiesView = query.data?.capabilities
  if (!capabilitiesView) return null

  const sections = [
    { label: "Persona", items: [capabilitiesView.persona] },
    { label: "State", items: [titleCaseLabel(capabilitiesView.workspaceState)] },
    { label: "Tools", items: capabilitiesView.tools.allow },
    { label: "Skills", items: capabilitiesView.skills.allow },
    {
      label: "Subagents",
      items: [...capabilitiesView.subagents.prefer, ...capabilitiesView.subagents.allow],
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

function buildRelativeSearchParams(search: string) {
  const params = new URLSearchParams(search)
  if (params.size === 0) {
    return undefined
  }
  const result: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    result[key] = value
  }
  return result
}

function parseRelativeHref(href: string) {
  const url = new URL(href, window.location.origin)
  return {
    pathname: url.pathname,
    search: buildRelativeSearchParams(url.search),
  }
}

export function BuddyDevTools() {
  const [buddyOpen, setBuddyOpen] = useState(false)
  const [routerOpen, setRouterOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<BuddyDevToolsTab>("palette")
  const [isCopied, setIsCopied] = useState(false)
  const [isDisconnectingOpenAi, setIsDisconnectingOpenAi] = useState(false)

  const {
    rect,
    onDragPointerDown,
    onResizePointerDown,
    reset,
    snapLeft,
    snapRight,
    snapBottom,
    snapFloating,
  } = useDevToolsRect()

  const activeDirectory = useChatStore((s) => s.activeDirectory)
  const streamStatus = useChatStore((s) => s.streamStatus)
  const sessionID = useChatStore((s) =>
    activeDirectory ? s.directories[activeDirectory]?.sessionID : undefined,
  )

  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname

  const onboardingToggleLabel =
    pathname === "/onboarding"
      ? language.t("desktopTitlebar.exitOnboarding")
      : language.t("desktopTitlebar.testOnboarding")

  const sessionTrace = useMemo(() => {
    if (!activeDirectory) {
      return ""
    }
    return buildSessionTrace({
      directory: activeDirectory,
      sessionID,
      streamStatus,
    })
  }, [activeDirectory, sessionID, streamStatus])

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

  const handleDisconnectOpenAi = useCallback(async () => {
    setIsDisconnectingOpenAi(true)
    try {
      await removeProviderAuth({ providerID: OPENAI_PROVIDER_ID })
      await reloadProviderRuntime()
      toast.success(language.t("desktopTitlebar.openAiDisconnected"))
    } catch (error) {
      toast.error(
        formatProviderAuthError(error, language.t("desktopTitlebar.disconnectOpenAiFailed")),
      )
    } finally {
      setIsDisconnectingOpenAi(false)
    }
  }, [])

  const handleToggleOnboarding = useCallback(() => {
    if (pathname === "/onboarding") {
      const returnTo = readOnboardingTestReturnTo(location.search)
      if (returnTo) {
        const target = parseRelativeHref(returnTo)
        void navigate({
          to: target.pathname,
          ...(target.search ? { search: target.search } : {}),
        })
        return
      }
      void navigate({
        to: CHAT_ENTRY_PATH,
        search: buildOnboardingTestSearch(),
      })
      return
    }

    const currentHref = `${location.pathname}${location.searchStr}`
    const returnTo =
      pathname === CHAT_ENTRY_PATH && !isOnboardingTestSearch(location.search)
        ? buildOnboardingChatEntryReturnTo()
        : currentHref
    void navigate({
      to: "/onboarding",
      search: buildOnboardingTestSearch(returnTo),
    })
  }, [location.pathname, location.search, location.searchStr, navigate, pathname])

  if (!import.meta.env.DEV) {
    return null
  }

  return (
    <>
      {/* Router devtools — native floating on lower left */}
      {routerOpen && <TanStackRouterDevtools position="bottom-left" />}

      {/* Unified trigger bar at bottom right */}
      <div className="fixed bottom-3 right-3 z-[9999] flex items-center gap-1 rounded-lg border border-border-base bg-background-base px-1.5 py-1 shadow-xl">
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
          <ContextMenuContent>
            <ContextMenuItem disabled={!sessionTrace} onClick={handleCopySessionTrace}>
              <CopyIcon className="mr-2 size-3.5" />
              Copy Session Trace
            </ContextMenuItem>
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
            setActiveTab("query")
          }}
          className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors ${
            buddyOpen && activeTab === "query"
              ? "bg-surface-raised-base text-text-strong"
              : "text-text-weak hover:bg-surface-base-hover hover:text-text-base"
          }`}
          title="Query DevTools"
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
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Z" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span>Query</span>
        </button>
      </div>

      {/* Buddy panel */}
      {buddyOpen && (
        <div
          className="fixed z-[9999] flex flex-col overflow-hidden rounded-lg border border-border-base bg-background-base shadow-xl"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            maxWidth: "100vw",
            maxHeight: "100vh",
          }}
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as BuddyDevToolsTab)}
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
                  <TabsTrigger value="system" className="text-xs">
                    System
                  </TabsTrigger>
                  <TabsTrigger value="snapshot" className="text-xs">
                    Snapshot
                  </TabsTrigger>
                  <TabsTrigger value="query" className="text-xs">
                    Query
                  </TabsTrigger>
                  <TabsTrigger value="actions" className="text-xs">
                    Actions
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
                      disabled={isDisconnectingOpenAi}
                      onClick={handleDisconnectOpenAi}
                    >
                      <PowerIcon className="size-3.5" />
                      {language.t("desktopTitlebar.disconnectOpenAi")}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-text-weak">Onboarding</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-[11px]"
                      onClick={handleToggleOnboarding}
                    >
                      <SparklesIcon className="size-3.5" />
                      {onboardingToggleLabel}
                    </Button>
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

            <TabsContent value="trace" className="min-h-0 flex-1 overflow-hidden mt-0">
              {sessionTrace ? (
                <div className="flex h-full flex-col">
                  {activeDirectory ? <CapabilitiesChips directory={activeDirectory} /> : null}
                  <div className="border-b border-border-weaker-base" />
                  <div className="flex items-center justify-between px-3 py-2">
                    <p className="text-xs font-medium text-text-weak">Trace</p>
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
