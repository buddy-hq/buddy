import type { ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Badge,
  Button,
  Card,
  CardContent,
  ChevronDownIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@buddy/ui"
import { QuestionSetSidePanel } from "@/components/chat/tools/render/question-set/question-set-side-panel"
import { language } from "@/context/language"
import { Markdown } from "@/components/markdown/Markdown"
import { type LearnerCurriculumView } from "@/state/chat-actions"
import { learnerSnapshotViewsQueryOptions } from "@/state/learner-query"
import { useWorkspaceQuestionSetPanelStore } from "@/state/workspace-question-set-panel-store"
import { WorkspaceMermaidPanel } from "./workspace-mermaid-panel"
import { ChevronRightIcon, ChevronLeftIcon } from "./sidebar-icons"

export type ChatRightSidebarTab =
  | "curriculum"
  | "diagrams"
  | "files"
  | "editor"
  | "figure"
  | "question-set"
  | "resources"
  | "agents-md"
  | "capabilities"
  | "system-prompt"
  | "palette"
  | "settings"
export type ChatRightSidebarSurface = "curriculum" | "editor" | "figure" | "question-set"

const SHOW_PROMOTED_MAIN_PANE_TABS_IN_RIGHT_SIDEBAR = false

type ChatRightSidebarProps = {
  directory: string
  activeTab: ChatRightSidebarTab
  onTabChange: (tab: ChatRightSidebarTab) => void
  surfaces: ChatRightSidebarSurface[]
  resourcesPanel?: ReactNode
  agentsPanel?: ReactNode
  systemPromptPanel?: ReactNode
  filesPanel?: ReactNode
  editorPanel?: ReactNode
  figurePanel?: ReactNode
  onClose: () => void
  sessionID?: string
  persona?: string
  onRunAction?: (action: LearnerCurriculumView["actions"][number]) => void
  className?: string
  showCapabilitiesTab?: boolean
  showSystemPromptTab?: boolean
  showSnapshotTab?: boolean
  showPaletteTab?: boolean
  palettePanel?: ReactNode
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function SidebarSection(props: { title: string; items: string[]; empty?: string }) {
  const items = props.items.length > 0 ? props.items : props.empty ? [props.empty] : []
  const seen = new Map<string, number>()

  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-weak">
          {props.title}
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm">
          {items.map((item) => {
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

function titleCaseLabel(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function RuntimeListSection(props: { title: string; items: string[]; empty: string }) {
  return <SidebarSection title={props.title} items={props.items} empty={props.empty} />
}

export function ChatRightSidebar(props: ChatRightSidebarProps) {
  const { directory, persona, sessionID } = props
  const [rawSnapshotOpen, setRawSnapshotOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(false)
  const capabilitiesTabEnabled = props.showCapabilitiesTab === true
  const systemPromptTabEnabled = props.showSystemPromptTab === true
  const snapshotTabEnabled = props.showSnapshotTab === true
  const paletteTabEnabled = props.showPaletteTab === true
  const filesTabEnabled = props.filesPanel !== undefined
  const editorTabEnabled = props.editorPanel !== undefined
  const resourcesTabEnabled =
    SHOW_PROMOTED_MAIN_PANE_TABS_IN_RIGHT_SIDEBAR && props.resourcesPanel !== undefined
  const diagramsTabEnabled = SHOW_PROMOTED_MAIN_PANE_TABS_IN_RIGHT_SIDEBAR
  const agentsTabEnabled = SHOW_PROMOTED_MAIN_PANE_TABS_IN_RIGHT_SIDEBAR
  const selectedQuestionSetArtifactID = useWorkspaceQuestionSetPanelStore(
    (state) => state.selectedArtifactIDByDirectory[directory],
  )
  const questionSetPanelOpen =
    typeof selectedQuestionSetArtifactID === "string" && selectedQuestionSetArtifactID.length > 0
  const visibleSurfaceTabSet = new Set(
    props.surfaces.filter(
      (surface): surface is ChatRightSidebarSurface =>
        surface === "curriculum" || surface === "editor" || surface === "figure",
    ),
  )
  const fallbackTab: ChatRightSidebarTab = editorTabEnabled
    ? "editor"
    : visibleSurfaceTabSet.has("figure")
      ? "figure"
      : snapshotTabEnabled
        ? "curriculum"
        : capabilitiesTabEnabled
          ? "capabilities"
          : systemPromptTabEnabled
            ? "system-prompt"
            : paletteTabEnabled
              ? "palette"
              : filesTabEnabled
                ? "files"
                : "curriculum"
  const activeTab =
    props.activeTab === "system-prompt" && systemPromptTabEnabled
      ? "system-prompt"
      : props.activeTab === "capabilities" && capabilitiesTabEnabled
        ? "capabilities"
        : props.activeTab === "curriculum" && snapshotTabEnabled
          ? "curriculum"
          : props.activeTab === "palette" && paletteTabEnabled
            ? "palette"
            : props.activeTab === "diagrams" && diagramsTabEnabled
              ? "diagrams"
              : props.activeTab === "resources" && resourcesTabEnabled
                ? "resources"
                : props.activeTab === "agents-md" && agentsTabEnabled
                  ? "agents-md"
                  : props.activeTab === "files" && filesTabEnabled
                    ? "files"
                    : props.activeTab === "editor" && editorTabEnabled
                      ? "editor"
                      : props.activeTab === "question-set" && questionSetPanelOpen
                        ? "question-set"
                        : visibleSurfaceTabSet.has(props.activeTab as ChatRightSidebarSurface) &&
                            props.activeTab !== "curriculum"
                          ? (props.activeTab as ChatRightSidebarSurface)
                          : fallbackTab

  const showTabHeader = activeTab !== "question-set"
  const isSnapshotTabActive = activeTab === "curriculum" || activeTab === "capabilities"
  const learnerSnapshotQuery = useQuery({
    ...learnerSnapshotViewsQueryOptions(directory, {
      persona,
      sessionID,
    }),
    enabled: directory.length > 0 && isSnapshotTabActive,
  })
  const curriculumView = learnerSnapshotQuery.data?.curriculum
  const sessionRuntimeView = learnerSnapshotQuery.data?.sessionRuntime
  const snapshotError = learnerSnapshotQuery.error
    ? stringifyError(learnerSnapshotQuery.error)
    : undefined
  const curriculumLoading = activeTab === "curriculum" && learnerSnapshotQuery.isPending
  const capabilitiesLoading = activeTab === "capabilities" && learnerSnapshotQuery.isPending
  const checkScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setShowLeftArrow(scrollLeft > 0)
      setShowRightArrow(Math.ceil(scrollLeft + clientWidth) < scrollWidth - 1)
    }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    checkScroll()
    el.addEventListener("scroll", checkScroll)
    const observer = new ResizeObserver(checkScroll)
    observer.observe(el)
    const contentEl = el.firstElementChild
    if (contentEl) {
      observer.observe(contentEl)
    }
    return () => {
      el.removeEventListener("scroll", checkScroll)
      observer.disconnect()
    }
  }, [checkScroll])

  return (
    <aside
      data-component="chat-right-sidebar"
      data-active-tab={activeTab}
      className={`shrink-0 overflow-hidden border-l border-border-weaker-base bg-background-base flex flex-col min-h-0 ${props.className ?? ""}`}
    >
      {showTabHeader ? (
        <header className="relative flex items-center border-b px-1 py-1.5">
          {showLeftArrow && (
            <div className="absolute left-1 top-1.5 bottom-1.5 z-10 flex items-center bg-background-base pr-1">
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 bg-background-base"
                onClick={() => {
                  const el = scrollRef.current
                  if (el) el.scrollBy({ left: -el.clientWidth, behavior: "smooth" })
                }}
              >
                <ChevronLeftIcon className="size-4 text-text-weak" />
              </Button>
              <div className="pointer-events-none absolute -right-4 top-0 bottom-0 w-4 bg-gradient-to-r from-background-base to-transparent" />
            </div>
          )}
          <div
            ref={scrollRef}
            className="min-w-0 flex-1 overflow-x-auto scroll-smooth px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex w-max items-center gap-1">
              {editorTabEnabled ? (
                <Button
                  data-action="right-sidebar-tab-editor"
                  variant={activeTab === "editor" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => props.onTabChange("editor")}
                >
                  {language.t("rightSidebar.tabs.editor")}
                </Button>
              ) : null}
              {props.surfaces.includes("figure") ? (
                <Button
                  data-action="right-sidebar-tab-figure"
                  variant={activeTab === "figure" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => props.onTabChange("figure")}
                >
                  {language.t("rightSidebar.tabs.figure")}
                </Button>
              ) : null}
              {resourcesTabEnabled ? (
                <Button
                  data-action="right-sidebar-tab-resources"
                  variant={activeTab === "resources" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => props.onTabChange("resources")}
                >
                  {language.t("rightSidebar.tabs.resources")}
                </Button>
              ) : null}
              {agentsTabEnabled ? (
                <Button
                  data-action="right-sidebar-tab-agents-md"
                  variant={activeTab === "agents-md" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => props.onTabChange("agents-md")}
                >
                  {language.t("rightSidebar.tabs.agents")}
                </Button>
              ) : null}
              {diagramsTabEnabled ? (
                <Button
                  data-action="right-sidebar-tab-diagrams"
                  variant={activeTab === "diagrams" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => props.onTabChange("diagrams")}
                >
                  {language.t("rightSidebar.tabs.diagrams")}
                </Button>
              ) : null}
              {snapshotTabEnabled ? (
                <Button
                  data-action="right-sidebar-tab-curriculum"
                  variant={activeTab === "curriculum" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => props.onTabChange("curriculum")}
                  className="border border-dashed border-yellow-500/60"
                >
                  {language.t("rightSidebar.tabs.snapshot")}
                </Button>
              ) : null}
              {capabilitiesTabEnabled ? (
                <Button
                  data-action="right-sidebar-tab-capabilities"
                  variant={activeTab === "capabilities" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => props.onTabChange("capabilities")}
                  className="border border-dashed border-yellow-500/60"
                >
                  {language.t("rightSidebar.tabs.runtime")}
                </Button>
              ) : null}
              {systemPromptTabEnabled ? (
                <Button
                  data-action="right-sidebar-tab-system-prompt"
                  variant={activeTab === "system-prompt" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => props.onTabChange("system-prompt")}
                  className="border border-dashed border-yellow-500/60"
                >
                  {language.t("rightSidebar.tabs.system")}
                </Button>
              ) : null}
              {paletteTabEnabled ? (
                <Button
                  data-action="right-sidebar-tab-palette"
                  variant={activeTab === "palette" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => props.onTabChange("palette")}
                  className="border border-dashed border-yellow-500/60"
                >
                  Palette
                </Button>
              ) : null}
            </div>
          </div>
          {showRightArrow && (
            <div className="absolute right-1 top-1.5 bottom-1.5 z-10 flex items-center bg-background-base pl-1">
              <div className="pointer-events-none absolute -left-4 top-0 bottom-0 w-4 bg-gradient-to-l from-background-base to-transparent" />
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 bg-background-base"
                onClick={() => {
                  const el = scrollRef.current
                  if (el) el.scrollBy({ left: el.clientWidth, behavior: "smooth" })
                }}
              >
                <ChevronRightIcon className="size-4 text-text-weak" />
              </Button>
            </div>
          )}
        </header>
      ) : null}

      {activeTab === "files" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.filesPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              {language.t("rightSidebar.unavailable.files")}
            </div>
          )}
        </div>
      ) : activeTab === "editor" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.editorPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              {language.t("rightSidebar.unavailable.editor")}
            </div>
          )}
        </div>
      ) : activeTab === "figure" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.figurePanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              {language.t("rightSidebar.unavailable.figure")}
            </div>
          )}
        </div>
      ) : activeTab === "question-set" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {selectedQuestionSetArtifactID ? (
            <QuestionSetSidePanel
              directory={directory}
              artifactID={selectedQuestionSetArtifactID}
              onClose={props.onClose}
            />
          ) : null}
        </div>
      ) : activeTab === "diagrams" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <WorkspaceMermaidPanel directory={directory} />
        </div>
      ) : activeTab === "resources" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.resourcesPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              {language.t("rightSidebar.unavailable.resources")}
            </div>
          )}
        </div>
      ) : activeTab === "agents-md" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.agentsPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              {language.t("rightSidebar.unavailable.agentsMd")}
            </div>
          )}
        </div>
      ) : activeTab === "capabilities" ? (
        <div className="flex-1 min-h-0 p-3 flex flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">{language.t("rightSidebar.runtime.title")}</p>
              <p className="text-[11px] text-text-weak">
                {language.t("rightSidebar.runtime.description")}
              </p>
            </div>
            <Button
              data-action="right-sidebar-refresh-capabilities"
              variant="ghost"
              size="sm"
              onClick={() => {
                void learnerSnapshotQuery.refetch()
              }}
            >
              {language.t("common.refresh")}
            </Button>
          </div>

          {capabilitiesLoading ? (
            <div className="text-sm text-text-weak">
              {language.t("rightSidebar.runtime.loading")}
            </div>
          ) : sessionRuntimeView ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <Card size="sm" className="gap-0 py-0">
                <CardContent className="space-y-3 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{sessionRuntimeView.persona}</Badge>
                    <Badge variant="outline">
                      {titleCaseLabel(sessionRuntimeView.teachingWorkspaceState)}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-text-base">
                      {language.t("rightSidebar.runtime.surfacePolicy")}
                    </p>
                    <p className="text-xs text-text-weak">
                      {language.t("rightSidebar.runtime.visiblePrefix")}{" "}
                      {sessionRuntimeView.visibleSurfaces.join(", ") ||
                        language.t("rightSidebar.runtime.none")}{" "}
                      | {language.t("rightSidebar.runtime.defaultPrefix")}{" "}
                      {sessionRuntimeView.defaultSurface || language.t("rightSidebar.runtime.na")}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border-base/60 px-2 py-1.5">
                      {language.t("rightSidebar.runtime.tools")}:{" "}
                      {sessionRuntimeView.tools.allow.length}{" "}
                      {language.t("rightSidebar.runtime.allow")} /{" "}
                      {sessionRuntimeView.tools.deny.length}{" "}
                      {language.t("rightSidebar.runtime.deny")}
                    </div>
                    <div className="rounded-md border border-border-base/60 px-2 py-1.5">
                      {language.t("rightSidebar.runtime.skills")}:{" "}
                      {sessionRuntimeView.skills.allow.length}{" "}
                      {language.t("rightSidebar.runtime.allow")} /{" "}
                      {sessionRuntimeView.skills.deny.length}{" "}
                      {language.t("rightSidebar.runtime.deny")}
                    </div>
                    <div className="rounded-md border border-border-base/60 px-2 py-1.5 col-span-2">
                      {language.t("rightSidebar.runtime.subagents")}:{" "}
                      {sessionRuntimeView.subagents.allow.length}{" "}
                      {language.t("rightSidebar.runtime.allow")} /{" "}
                      {sessionRuntimeView.subagents.deny.length}{" "}
                      {language.t("rightSidebar.runtime.deny")}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <RuntimeListSection
                title={language.t("rightSidebar.runtime.enabledTools")}
                items={sessionRuntimeView.tools.allow}
                empty={language.t("rightSidebar.runtime.noToolsEnabled")}
              />
              <RuntimeListSection
                title={language.t("rightSidebar.runtime.enabledSkills")}
                items={sessionRuntimeView.skills.allow}
                empty={language.t("rightSidebar.runtime.noSkillsEnabled")}
              />
              <RuntimeListSection
                title={language.t("rightSidebar.runtime.allowedSubagents")}
                items={sessionRuntimeView.subagents.allow}
                empty={language.t("rightSidebar.runtime.noSubagentsAllowed")}
              />
              <RuntimeListSection
                title={language.t("rightSidebar.runtime.deniedTools")}
                items={sessionRuntimeView.tools.deny}
                empty={language.t("rightSidebar.runtime.noToolsDenied")}
              />
              <RuntimeListSection
                title={language.t("rightSidebar.runtime.deniedSkills")}
                items={sessionRuntimeView.skills.deny}
                empty={language.t("rightSidebar.runtime.noSkillsDenied")}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border-base/70 bg-background-base p-3 text-sm text-text-weak">
              {language.t("rightSidebar.unavailable.runtime")}
            </div>
          )}

          {snapshotError ? (
            <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
              {snapshotError}
            </p>
          ) : null}
        </div>
      ) : activeTab === "system-prompt" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.systemPromptPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              {language.t("rightSidebar.unavailable.systemPrompt")}
            </div>
          )}
        </div>
      ) : activeTab === "palette" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.palettePanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              Palette unavailable
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-3 flex flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">{language.t("rightSidebar.snapshot.title")}</p>
              <p className="text-[11px] text-text-weak">
                {curriculumView?.workspace.label ??
                  language.t("rightSidebar.snapshot.workspaceFallback")}{" "}
                {curriculumView?.coldStart
                  ? language.t("rightSidebar.snapshot.coldStartBadge")
                  : ""}
              </p>
            </div>
            <Button
              data-action="right-sidebar-refresh-curriculum"
              variant="ghost"
              size="sm"
              onClick={() => {
                void learnerSnapshotQuery.refetch()
              }}
            >
              {language.t("common.refresh")}
            </Button>
          </div>

          {curriculumLoading ? (
            <div className="text-sm text-text-weak">
              {language.t("rightSidebar.snapshot.loading")}
            </div>
          ) : curriculumView ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <Card size="sm" className="gap-0 py-0">
                <CardContent className="space-y-3 px-3 py-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-text-base">
                      {language.t("rightSidebar.snapshot.teachingWorkspaceState")}
                    </p>
                    <p className="text-sm text-text-weak">
                      {curriculumView.coldStart
                        ? language.t("rightSidebar.snapshot.noGoals")
                        : language.t("rightSidebar.snapshot.showingCurrentState")}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {curriculumView.actions && curriculumView.actions.length > 0 ? (
                <Card size="sm" className="gap-0 py-0">
                  <CardContent className="space-y-3 px-3 py-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-weak">
                        {language.t("rightSidebar.snapshot.actionsTitle")}
                      </p>
                      <p className="mt-1 text-xs text-text-weak">
                        {language.t("rightSidebar.snapshot.actionsDescription")}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {curriculumView.actions.map((action) => (
                        <button
                          key={action.actionId}
                          type="button"
                          onClick={() => props.onRunAction?.(action)}
                          className="rounded-lg border border-border-base/70 bg-background-base/50 px-3 py-2 text-left transition-colors hover:bg-surface-weak/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-text-base">
                              {action.label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-text-weak">{action.reason}</p>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <div className="grid gap-3">
                {curriculumView.sections.map((section) => (
                  <SidebarSection key={section.title} title={section.title} items={section.items} />
                ))}
                <SidebarSection
                  title={language.t("rightSidebar.snapshot.constraints")}
                  items={curriculumView.constraintsSummary}
                  empty={language.t("rightSidebar.snapshot.noConstraints")}
                />
              </div>

              <Collapsible open={rawSnapshotOpen} onOpenChange={setRawSnapshotOpen}>
                <Card size="sm" className="gap-0 py-0">
                  <CardContent className="px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-weak">
                          {language.t("rightSidebar.snapshot.rawSnapshotTitle")}
                        </p>
                        <p className="mt-1 text-xs text-text-weak">
                          {language.t("rightSidebar.snapshot.rawSnapshotDescription")}
                        </p>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1.5">
                          {rawSnapshotOpen
                            ? language.t("rightSidebar.snapshot.hideRawSnapshot")
                            : language.t("rightSidebar.snapshot.showRawSnapshot")}
                          <ChevronDownIcon
                            className={`size-3.5 transition-transform ${rawSnapshotOpen ? "rotate-180" : ""}`}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="pt-3">
                      <Markdown text={curriculumView.markdown} />
                    </CollapsibleContent>
                  </CardContent>
                </Card>
              </Collapsible>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border-base/70 bg-background-base p-3 text-sm text-text-weak">
              {language.t("rightSidebar.unavailable.snapshot")}
            </div>
          )}

          {snapshotError ? (
            <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
              {snapshotError}
            </p>
          ) : null}
        </div>
      )}
    </aside>
  )
}
