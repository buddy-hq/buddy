import type { ReactNode } from "react"
import { useCallback, useEffect, useState } from "react"
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
import { Markdown } from "@/components/Markdown"
import {
  loadCurriculumView,
  loadRuntimeCapabilities,
  type LearnerCurriculumView,
  type LearnerRuntimeCapabilitiesView,
} from "@/state/chat-actions"
import type { TeachingIntent } from "@/state/teaching-runtime"
import { XIcon } from "./sidebar-icons"

export type ChatRightSidebarTab =
  | "curriculum"
  | "editor"
  | "figure"
  | "resources"
  | "agents-md"
  | "capabilities"
  | "system-prompt"
  | "settings"
export type ChatRightSidebarSurface = "curriculum" | "editor" | "figure"

type ChatRightSidebarProps = {
  directory: string
  activeTab: ChatRightSidebarTab
  onTabChange: (tab: ChatRightSidebarTab) => void
  surfaces: ChatRightSidebarSurface[]
  resourcesPanel?: ReactNode
  agentsPanel?: ReactNode
  systemPromptPanel?: ReactNode
  editorPanel?: ReactNode
  figurePanel?: ReactNode
  onClose: () => void
  sessionID?: string
  persona?: string
  intent?: TeachingIntent
  onRunAction?: (action: LearnerCurriculumView["actions"][number]) => void
  className?: string
  showCapabilitiesTab?: boolean
  showSystemPromptTab?: boolean
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
  const { directory, intent, persona, sessionID } = props
  const [curriculumLoading, setCurriculumLoading] = useState(false)
  const [curriculumError, setCurriculumError] = useState<string | undefined>(undefined)
  const [curriculumView, setCurriculumView] = useState<LearnerCurriculumView | undefined>(undefined)
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false)
  const [capabilitiesError, setCapabilitiesError] = useState<string | undefined>(undefined)
  const [capabilitiesView, setCapabilitiesView] = useState<
    LearnerRuntimeCapabilitiesView | undefined
  >(undefined)
  const [rawSnapshotOpen, setRawSnapshotOpen] = useState(false)
  const capabilitiesTabEnabled = props.showCapabilitiesTab === true
  const systemPromptTabEnabled = props.showSystemPromptTab === true

  const activeTab =
    props.activeTab === "system-prompt" && systemPromptTabEnabled
      ? "system-prompt"
      : props.activeTab === "capabilities" && capabilitiesTabEnabled
        ? "capabilities"
        : props.activeTab === "resources"
          ? "resources"
          : props.activeTab === "agents-md"
            ? "agents-md"
            : props.surfaces.includes(props.activeTab as ChatRightSidebarSurface)
              ? (props.activeTab as ChatRightSidebarSurface)
              : (props.surfaces[0] ?? "curriculum")

  const loadSidebarData = useCallback(
    async (isDisposed?: () => boolean) => {
      const disposed = isDisposed ?? (() => false)

      if (!disposed()) {
        setCurriculumLoading(true)
        setCurriculumError(undefined)
      }

      try {
        const view = await loadCurriculumView(directory, {
          persona,
          intent,
          sessionID,
        })
        if (disposed()) return
        setCurriculumView(view)
      } catch (error) {
        if (disposed()) return
        setCurriculumError(stringifyError(error))
      } finally {
        if (!disposed()) {
          setCurriculumLoading(false)
        }
      }
    },
    [directory, intent, persona, sessionID],
  )

  const loadCapabilitiesData = useCallback(
    async (isDisposed?: () => boolean) => {
      const disposed = isDisposed ?? (() => false)

      if (!disposed()) {
        setCapabilitiesLoading(true)
        setCapabilitiesError(undefined)
      }

      try {
        const view = await loadRuntimeCapabilities(directory, {
          persona,
          intent,
          sessionID,
        })
        if (disposed()) return
        setCapabilitiesView(view)
      } catch (error) {
        if (disposed()) return
        setCapabilitiesError(stringifyError(error))
      } finally {
        if (!disposed()) {
          setCapabilitiesLoading(false)
        }
      }
    },
    [directory, intent, persona, sessionID],
  )

  useEffect(() => {
    if (activeTab !== "curriculum") return

    let disposed = false
    void loadSidebarData(() => disposed)

    return () => {
      disposed = true
    }
  }, [activeTab, loadSidebarData])

  useEffect(() => {
    if (activeTab !== "capabilities") return

    let disposed = false
    void loadCapabilitiesData(() => disposed)

    return () => {
      disposed = true
    }
  }, [activeTab, loadCapabilitiesData])

  return (
    <aside
      className={`shrink-0 overflow-hidden border-l bg-surface-raised-base flex flex-col min-h-0 ${props.className ?? ""}`}
    >
      <header className="border-b px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === "curriculum" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => props.onTabChange("curriculum")}
          >
            Snapshot
          </Button>
          {props.surfaces.includes("editor") ? (
            <Button
              variant={activeTab === "editor" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => props.onTabChange("editor")}
            >
              Editor
            </Button>
          ) : null}
          {props.surfaces.includes("figure") ? (
            <Button
              variant={activeTab === "figure" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => props.onTabChange("figure")}
            >
              Figure
            </Button>
          ) : null}
          <Button
            variant={activeTab === "resources" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => props.onTabChange("resources")}
          >
            Resources
          </Button>
          <Button
            variant={activeTab === "agents-md" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => props.onTabChange("agents-md")}
          >
            Agents
          </Button>
          {capabilitiesTabEnabled ? (
            <Button
              variant={activeTab === "capabilities" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => props.onTabChange("capabilities")}
              className="border border-dashed border-yellow-500/60"
            >
              Capabilities
            </Button>
          ) : null}
          {systemPromptTabEnabled ? (
            <Button
              variant={activeTab === "system-prompt" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => props.onTabChange("system-prompt")}
              className="border border-dashed border-yellow-500/60"
            >
              System
            </Button>
          ) : null}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={props.onClose} title="Close panel">
          <XIcon className="size-3.5" />
        </Button>
      </header>

      {activeTab === "editor" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.editorPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              Teaching editor is not available for this session.
            </div>
          )}
        </div>
      ) : activeTab === "figure" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.figurePanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              Figure tools are not available for this session.
            </div>
          )}
        </div>
      ) : activeTab === "resources" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.resourcesPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              Resource management is not available for this session.
            </div>
          )}
        </div>
      ) : activeTab === "agents-md" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.agentsPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              AGENTS.md editing is not available for this notebook.
            </div>
          )}
        </div>
      ) : activeTab === "capabilities" ? (
        <div className="flex-1 min-h-0 p-3 flex flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Runtime Capabilities</p>
              <p className="text-[11px] text-text-weak">
                Live capability state for the current teaching context.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void loadCapabilitiesData()
              }}
            >
              Refresh
            </Button>
          </div>

          {capabilitiesLoading ? (
            <div className="text-sm text-text-weak">Loading runtime capabilities...</div>
          ) : capabilitiesView ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <Card size="sm" className="gap-0 py-0">
                <CardContent className="space-y-3 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{capabilitiesView.persona}</Badge>
                    <Badge variant="outline">{titleCaseLabel(capabilitiesView.intent)}</Badge>
                    <Badge variant="outline">
                      {titleCaseLabel(capabilitiesView.workspaceState)}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-text-base">Surface policy</p>
                    <p className="text-xs text-text-weak">
                      Visible: {capabilitiesView.visibleSurfaces.join(", ") || "none"} | Default:{" "}
                      {capabilitiesView.defaultSurface || "n/a"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border-base/60 px-2 py-1.5">
                      Tools: {capabilitiesView.tools.allow.length} allow /{" "}
                      {capabilitiesView.tools.deny.length} deny
                    </div>
                    <div className="rounded-md border border-border-base/60 px-2 py-1.5">
                      Skills: {capabilitiesView.skills.allow.length} allow /{" "}
                      {capabilitiesView.skills.deny.length} deny
                    </div>
                    <div className="rounded-md border border-border-base/60 px-2 py-1.5 col-span-2">
                      Subagents: {capabilitiesView.subagents.prefer.length} prefer /{" "}
                      {capabilitiesView.subagents.allow.length} allow /{" "}
                      {capabilitiesView.subagents.deny.length} deny
                    </div>
                  </div>
                </CardContent>
              </Card>

              <RuntimeListSection
                title="Enabled Tools"
                items={capabilitiesView.tools.allow}
                empty="No tools are currently enabled."
              />
              <RuntimeListSection
                title="Enabled Skills"
                items={capabilitiesView.skills.allow}
                empty="No skills are currently enabled."
              />
              <RuntimeListSection
                title="Preferred Subagents"
                items={capabilitiesView.subagents.prefer}
                empty="No subagents are marked preferred."
              />
              <RuntimeListSection
                title="Allowed Subagents"
                items={capabilitiesView.subagents.allow}
                empty="No subagents are explicitly allowed."
              />
              <RuntimeListSection
                title="Denied Tools"
                items={capabilitiesView.tools.deny}
                empty="No tools are denied."
              />
              <RuntimeListSection
                title="Denied Skills"
                items={capabilitiesView.skills.deny}
                empty="No skills are denied."
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border-base/70 bg-background-base p-3 text-sm text-text-weak">
              Runtime capabilities are not available for this session yet.
            </div>
          )}

          {capabilitiesError ? (
            <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
              {capabilitiesError}
            </p>
          ) : null}
        </div>
      ) : activeTab === "system-prompt" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.systemPromptPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-weak">
              System prompt inspection is not available for this session.
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-3 flex flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Learning Snapshot</p>
              <p className="text-[11px] text-text-weak">
                {curriculumView?.workspace.label ?? "Workspace"}{" "}
                {curriculumView?.coldStart ? "(cold start)" : ""}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void loadSidebarData()
              }}
            >
              Refresh
            </Button>
          </div>

          {curriculumLoading ? (
            <div className="text-sm text-text-weak">Loading learning snapshot...</div>
          ) : curriculumView ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <Card size="sm" className="gap-0 py-0">
                <CardContent className="space-y-3 px-3 py-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-text-base">Workspace state</p>
                    <p className="text-sm text-text-weak">
                      {curriculumView.coldStart
                        ? "No active goals have been defined for this workspace yet."
                        : "Buddy is showing the current learner state without generating a next-step suggestion."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {curriculumView.actions && curriculumView.actions.length > 0 ? (
                <Card size="sm" className="gap-0 py-0">
                  <CardContent className="space-y-3 px-3 py-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-weak">
                        Actions
                      </p>
                      <p className="mt-1 text-xs text-text-weak">
                        Run a teaching move directly from the current learner state.
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
                            <span className="text-xs text-text-weak">{action.intent}</span>
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
                  title="Constraints"
                  items={curriculumView.constraintsSummary}
                  empty="No workspace or learner constraints are shaping the snapshot right now."
                />
              </div>

              <Collapsible open={rawSnapshotOpen} onOpenChange={setRawSnapshotOpen}>
                <Card size="sm" className="gap-0 py-0">
                  <CardContent className="px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-weak">
                          Raw Snapshot
                        </p>
                        <p className="mt-1 text-xs text-text-weak">
                          Inspect the learner snapshot markdown Buddy is using for this workspace.
                        </p>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1.5">
                          {rawSnapshotOpen ? "Hide raw snapshot" : "Show raw snapshot"}
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
              No learner snapshot is available for this workspace yet.
            </div>
          )}

          {curriculumError ? (
            <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
              {curriculumError}
            </p>
          ) : null}
        </div>
      )}
    </aside>
  )
}
