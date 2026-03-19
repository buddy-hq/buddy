import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { Badge, Button, Card, CardContent, ChevronDownIcon, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@buddy/ui"
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
  systemPromptPanel?: ReactNode
  editorPanel?: ReactNode
  figurePanel?: ReactNode
  onClose: () => void
  sessionID?: string
  persona?: string
  intent?: TeachingIntent
  onRunAction?: (action: LearnerCurriculumView["actions"][number]) => void
  className?: string
  style?: CSSProperties
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

function SidebarSection(props: {
  title: string
  items: string[]
  empty?: string
}) {
  const items = props.items.length > 0 ? props.items : props.empty ? [props.empty] : []

  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{props.title}</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm">
          {items.map((item, index) => (
            <li key={`${props.title}-${index}`} className="text-foreground/90">
              {item}
            </li>
          ))}
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

function RuntimeListSection(props: {
  title: string
  items: string[]
  empty: string
}) {
  return <SidebarSection title={props.title} items={props.items} empty={props.empty} />
}

export function ChatRightSidebar(props: ChatRightSidebarProps) {
  const [curriculumLoading, setCurriculumLoading] = useState(false)
  const [curriculumError, setCurriculumError] = useState<string | undefined>(undefined)
  const [curriculumView, setCurriculumView] = useState<LearnerCurriculumView | undefined>(undefined)
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false)
  const [capabilitiesError, setCapabilitiesError] = useState<string | undefined>(undefined)
  const [capabilitiesView, setCapabilitiesView] = useState<LearnerRuntimeCapabilitiesView | undefined>(undefined)
  const [rawPlanOpen, setRawPlanOpen] = useState(false)
  const capabilitiesTabEnabled = props.showCapabilitiesTab === true
  const systemPromptTabEnabled = props.showSystemPromptTab === true

  const activeTab =
    props.activeTab === "system-prompt" && systemPromptTabEnabled
      ? "system-prompt"
      : props.activeTab === "capabilities" && capabilitiesTabEnabled
      ? "capabilities"
      : props.activeTab === "resources"
        ? "resources"
        : props.surfaces.includes(props.activeTab as ChatRightSidebarSurface)
          ? (props.activeTab as ChatRightSidebarSurface)
          : props.surfaces[0] ?? "curriculum"

  async function loadSidebarData(
    isDisposed?: () => boolean,
    options?: {
      generateDecision?: boolean
    },
  ) {
    const disposed = isDisposed ?? (() => false)

    if (!disposed()) {
      setCurriculumLoading(true)
      setCurriculumError(undefined)
    }

    try {
      const view = await loadCurriculumView(props.directory, {
        persona: props.persona,
        intent: props.intent,
        sessionID: props.sessionID,
        generateDecision: options?.generateDecision,
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
  }

  async function loadCapabilitiesData(
    isDisposed?: () => boolean,
  ) {
    const disposed = isDisposed ?? (() => false)

    if (!disposed()) {
      setCapabilitiesLoading(true)
      setCapabilitiesError(undefined)
    }

    try {
      const view = await loadRuntimeCapabilities(props.directory, {
        persona: props.persona,
        intent: props.intent,
        sessionID: props.sessionID,
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
  }

  useEffect(() => {
    if (activeTab !== "curriculum") return

    let disposed = false
    void loadSidebarData(() => disposed)

    return () => {
      disposed = true
    }
  }, [activeTab, props.directory, props.intent, props.persona, props.sessionID])

  useEffect(() => {
    if (activeTab !== "capabilities") return

    let disposed = false
    void loadCapabilitiesData(() => disposed)

    return () => {
      disposed = true
    }
  }, [activeTab, props.directory, props.intent, props.persona, props.sessionID])

  return (
    <aside
      className={`shrink-0 overflow-hidden border-l bg-card flex flex-col min-h-0 ${props.className ?? ""}`}
      style={props.style}
    >
      <header className="border-b px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === "curriculum" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => props.onTabChange("curriculum")}
          >
            Plan
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
          {capabilitiesTabEnabled ? (
            <Button
              variant={activeTab === "capabilities" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => props.onTabChange("capabilities")}
            >
              Capabilities
            </Button>
          ) : null}
          {systemPromptTabEnabled ? (
            <Button
              variant={activeTab === "system-prompt" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => props.onTabChange("system-prompt")}
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
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
              Teaching editor is not available for this session.
            </div>
          )}
        </div>
      ) : activeTab === "figure" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.figurePanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
              Figure tools are not available for this session.
            </div>
          )}
        </div>
      ) : activeTab === "resources" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.resourcesPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
              Resource management is not available for this session.
            </div>
          )}
        </div>
      ) : activeTab === "capabilities" ? (
        <div className="flex-1 min-h-0 p-3 flex flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Runtime Capabilities</p>
              <p className="text-[11px] text-muted-foreground">Live capability state for the current teaching context.</p>
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
            <div className="text-sm text-muted-foreground">Loading runtime capabilities...</div>
          ) : capabilitiesView ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <Card size="sm" className="gap-0 py-0">
                <CardContent className="space-y-3 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{capabilitiesView.persona}</Badge>
                    <Badge variant="outline">{titleCaseLabel(capabilitiesView.intent)}</Badge>
                    <Badge variant="outline">{titleCaseLabel(capabilitiesView.workspaceState)}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Surface policy</p>
                    <p className="text-xs text-muted-foreground">
                      Visible: {capabilitiesView.visibleSurfaces.join(", ") || "none"} | Default:{" "}
                      {capabilitiesView.defaultSurface || "n/a"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border/60 px-2 py-1.5">
                      Tools: {capabilitiesView.tools.allow.length} allow / {capabilitiesView.tools.deny.length} deny
                    </div>
                    <div className="rounded-md border border-border/60 px-2 py-1.5">
                      Skills: {capabilitiesView.skills.allow.length} allow / {capabilitiesView.skills.deny.length} deny
                    </div>
                    <div className="rounded-md border border-border/60 px-2 py-1.5 col-span-2">
                      Subagents: {capabilitiesView.subagents.prefer.length} prefer / {capabilitiesView.subagents.allow.length} allow /{" "}
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
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border/70 bg-background p-3 text-sm text-muted-foreground">
              Runtime capabilities are not available for this session yet.
            </div>
          )}

          {capabilitiesError ? (
            <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {capabilitiesError}
            </p>
          ) : null}
        </div>
      ) : activeTab === "system-prompt" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.systemPromptPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
              System prompt inspection is not available for this session.
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-3 flex flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Learning Plan</p>
              <p className="text-[11px] text-muted-foreground">
                {curriculumView?.workspace.label ?? "Workspace"} {curriculumView?.coldStart ? "(cold start)" : ""}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void loadSidebarData(undefined, { generateDecision: true })
              }}
            >
              Refresh
            </Button>
          </div>

          {curriculumLoading ? (
            <div className="text-sm text-muted-foreground">Loading learning plan...</div>
          ) : curriculumView ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <Card size="sm" className="gap-0 py-0">
                <CardContent className="space-y-3 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{titleCaseLabel(curriculumView.recommendedNextAction)}</Badge>
                    <Badge variant="outline">
                      {titleCaseLabel(curriculumView.sessionPlan.suggestedScaffoldingLevel)}
                    </Badge>
                    {curriculumView.coldStart ? <Badge variant="outline">Cold start</Badge> : null}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Recommended next step</p>
                    <p className="text-sm text-muted-foreground">
                      {curriculumView.sessionPlan.motivationHook ??
                        "Buddy is using the current learner evidence to choose the next move."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {curriculumView.actions && curriculumView.actions.length > 0 ? (
                <Card size="sm" className="gap-0 py-0">
                  <CardContent className="space-y-3 px-3 py-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Run the next teaching move directly from the learning plan.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {curriculumView.actions.map((action) => (
                        <button
                          key={action.actionId}
                          type="button"
                          onClick={() => props.onRunAction?.(action)}
                          className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">{action.label}</span>
                            <div className="flex items-center gap-1">
                              <Badge variant="outline">{titleCaseLabel(action.intent)}</Badge>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{action.reason}</p>
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
                  empty="No workspace or learner constraints are shaping the plan right now."
                />
              </div>

              <Collapsible open={rawPlanOpen} onOpenChange={setRawPlanOpen}>
                <Card size="sm" className="gap-0 py-0">
                  <CardContent className="px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raw Plan</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Inspect the generated markdown Buddy is using behind this learning plan.
                        </p>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1.5">
                          {rawPlanOpen ? "Hide raw plan" : "Show raw plan"}
                          <ChevronDownIcon className={`size-3.5 transition-transform ${rawPlanOpen ? "rotate-180" : ""}`} />
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
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border/70 bg-background p-3 text-sm text-muted-foreground">
              No learning plan is available for this workspace yet.
            </div>
          )}

          {curriculumError ? (
            <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {curriculumError}
            </p>
          ) : null}
        </div>
      )}
    </aside>
  )
}
