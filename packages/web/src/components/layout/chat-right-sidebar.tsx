import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { Badge, Button, Card, CardContent, ChevronDownIcon, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@buddy/ui"
import { Markdown } from "@/components/Markdown"
import {
  loadCurriculumView,
  loadRuntimeInspector,
  type LearnerCurriculumView,
  type RuntimeInspectorSnapshot,
} from "@/state/chat-actions"
import type { TeachingIntent } from "@/state/teaching-runtime"
import { XIcon } from "./sidebar-icons"

export type ChatRightSidebarTab = "curriculum" | "editor" | "figure" | "settings"
export type ChatRightSidebarSurface = Exclude<ChatRightSidebarTab, "settings">

type ChatRightSidebarProps = {
  directory: string
  activeTab: ChatRightSidebarTab
  onTabChange: (tab: ChatRightSidebarTab) => void
  surfaces: ChatRightSidebarSurface[]
  editorPanel?: ReactNode
  figurePanel?: ReactNode
  onClose: () => void
  sessionID?: string
  persona?: string
  intent?: TeachingIntent
  onRunAction?: (action: LearnerCurriculumView["actions"][number]) => void
  onUseActivityBundle?: (bundle: LearnerCurriculumView["activityBundles"][number]) => void
  className?: string
  style?: CSSProperties
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

function compactKeys(values: string[]) {
  return values.filter(Boolean).slice(0, 12)
}

function formatKindList(kinds: string[]) {
  if (kinds.length === 0) return "none"
  return kinds.map((kind) => titleCaseLabel(kind)).join(", ")
}

function formatActivityBundleSummary(bundle: RuntimeInspectorSnapshot["inspector"]["capabilityEnvelope"]["activityBundles"][number]) {
  const parts = [`${bundle.label} (${titleCaseLabel(bundle.intent)})`, bundle.description]

  if (bundle.skills.length > 0) {
    parts.push(`skills: ${bundle.skills.join(", ")}`)
  }

  if (bundle.tools.length > 0) {
    parts.push(`tools: ${bundle.tools.join(", ")}`)
  }

  if (bundle.subagents.length > 0) {
    parts.push(`helpers: ${bundle.subagents.join(", ")}`)
  }

  return parts.join(" - ")
}

export function ChatRightSidebar(props: ChatRightSidebarProps) {
  const [curriculumLoading, setCurriculumLoading] = useState(false)
  const [curriculumError, setCurriculumError] = useState<string | undefined>(undefined)
  const [curriculumView, setCurriculumView] = useState<LearnerCurriculumView | undefined>(undefined)
  const [inspectorLoading, setInspectorLoading] = useState(false)
  const [inspectorError, setInspectorError] = useState<string | undefined>(undefined)
  const [runtimeInspector, setRuntimeInspector] = useState<RuntimeInspectorSnapshot | undefined>(undefined)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [rawPlanOpen, setRawPlanOpen] = useState(false)

  const activeSurface = props.surfaces.includes(props.activeTab as ChatRightSidebarSurface)
    ? (props.activeTab as ChatRightSidebarSurface)
    : props.surfaces[0] ?? "curriculum"

  async function loadSidebarData(isDisposed?: () => boolean) {
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

  async function loadInspectorData(isDisposed?: () => boolean) {
    const disposed = isDisposed ?? (() => false)

    if (!props.sessionID) {
      if (!disposed()) {
        setRuntimeInspector(undefined)
        setInspectorError(undefined)
      }
      return
    }

    if (!disposed()) {
      setInspectorLoading(true)
      setInspectorError(undefined)
    }

    try {
      const inspector = await loadRuntimeInspector(props.directory, props.sessionID)
      if (disposed()) return
      setRuntimeInspector(inspector)
    } catch (error) {
      if (disposed()) return
      setInspectorError(stringifyError(error))
    } finally {
      if (!disposed()) {
        setInspectorLoading(false)
      }
    }
  }

  useEffect(() => {
    if (activeSurface !== "curriculum") return

    let disposed = false
    void loadSidebarData(() => disposed)

    return () => {
      disposed = true
    }
  }, [activeSurface, props.directory, props.intent, props.persona, props.sessionID])

  useEffect(() => {
    if (!inspectorOpen || activeSurface !== "curriculum") return

    let disposed = false
    void loadInspectorData(() => disposed)

    return () => {
      disposed = true
    }
  }, [activeSurface, inspectorOpen, props.directory, props.sessionID])

  return (
    <aside
      className={`shrink-0 overflow-hidden border-l bg-card flex flex-col min-h-0 ${props.className ?? ""}`}
      style={props.style}
    >
      <header className="border-b px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant={activeSurface === "curriculum" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => props.onTabChange("curriculum")}
          >
            Plan
          </Button>
          {props.surfaces.includes("editor") ? (
            <Button
              variant={activeSurface === "editor" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => props.onTabChange("editor")}
            >
              Editor
            </Button>
          ) : null}
          {props.surfaces.includes("figure") ? (
            <Button
              variant={activeSurface === "figure" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => props.onTabChange("figure")}
            >
              Figure
            </Button>
          ) : null}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={props.onClose} title="Close panel">
          <XIcon className="size-3.5" />
        </Button>
      </header>

      {activeSurface === "editor" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.editorPanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
              Teaching editor is not available for this session.
            </div>
          )}
        </div>
      ) : activeSurface === "figure" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {props.figurePanel ?? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
              Figure tools are not available for this session.
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
                void loadSidebarData()
                if (inspectorOpen) {
                  void loadInspectorData()
                }
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
                              {action.activityBundleLabel ? <Badge variant="secondary">{action.activityBundleLabel}</Badge> : null}
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

              {curriculumView.activityBundles.length > 0 ? (
                <Card size="sm" className="gap-0 py-0">
                  <CardContent className="space-y-3 px-3 py-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity Bundles</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Explicitly steer Buddy into a concrete activity bundle for the next turn.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {curriculumView.activityBundles.map((bundle) => (
                        <button
                          key={bundle.id}
                          type="button"
                          onClick={() => props.onUseActivityBundle?.(bundle)}
                          className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">{bundle.label}</span>
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary">{titleCaseLabel(bundle.intent)}</Badge>
                              <Badge variant="outline">{bundle.mode}</Badge>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{bundle.description}</p>
                          {bundle.skills.length > 0 ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">skills: {bundle.skills.join(", ")}</p>
                          ) : null}
                          {bundle.tools.length > 0 ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">tools: {bundle.tools.join(", ")}</p>
                          ) : null}
                          {bundle.subagents.length > 0 ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">helpers: {bundle.subagents.join(", ")}</p>
                          ) : null}
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

              <Collapsible open={inspectorOpen} onOpenChange={setInspectorOpen}>
                <Card size="sm" className="gap-0 py-0">
                  <CardContent className="px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Runtime Inspector</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Inspect learner evidence, capability gating, explicit overrides, and prompt sections.
                        </p>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1.5">
                          {inspectorOpen ? "Hide inspector" : "Show inspector"}
                          <ChevronDownIcon className={`size-3.5 transition-transform ${inspectorOpen ? "rotate-180" : ""}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="space-y-3 pt-3">
                      {inspectorLoading ? (
                        <p className="text-sm text-muted-foreground">Loading runtime inspector...</p>
                      ) : runtimeInspector?.inspector ? (
                        <>
                          {runtimeInspector.inspector.promptInjectionAudit ? (
                            <>
                              <SidebarSection
                                title="Prompt Injection Triggers"
                                items={runtimeInspector.inspector.promptInjectionAudit.matrix.map((entry) =>
                                  `${entry.id}: ${entry.description}`,
                                )}
                                empty="No prompt-injection triggers fired this turn."
                              />
                              <SidebarSection
                                title="Prompt Injection Policy"
                                items={[
                                  `Matrix version: ${runtimeInspector.inspector.promptInjectionAudit.matrixVersion}`,
                                  `Inject stable header now: ${runtimeInspector.inspector.promptInjectionAudit.decision.injectStableHeader ? "yes" : "no"}`,
                                  `Inject turn context now: ${runtimeInspector.inspector.promptInjectionAudit.decision.injectTurnContext ? "yes" : "no"}`,
                                  `Force stable header snapshot: ${runtimeInspector.inspector.promptInjectionAudit.appliedPolicy.forceInjectStableHeader ? "yes" : "no"}`,
                                  `Force turn context snapshot: ${runtimeInspector.inspector.promptInjectionAudit.appliedPolicy.forceInjectTurnContext ? "yes" : "no"}`,
                                  `Forced stable header sections: ${formatKindList(runtimeInspector.inspector.promptInjectionAudit.appliedPolicy.forceStableHeaderKinds)}`,
                                  `Forced turn context sections: ${formatKindList(runtimeInspector.inspector.promptInjectionAudit.appliedPolicy.forceTurnContextKinds)}`,
                                  `Always included turn sections: ${formatKindList(runtimeInspector.inspector.promptInjectionAudit.appliedPolicy.alwaysIncludeTurnContextKinds)}`,
                                  `Changed stable header keys: ${runtimeInspector.inspector.promptInjectionAudit.decision.changedStableHeaderSectionKeys.join(", ") || "none"}`,
                                  `Changed turn context keys: ${runtimeInspector.inspector.promptInjectionAudit.decision.changedTurnContextSectionKeys.join(", ") || "none"}`,
                                ]}
                              />
                            </>
                          ) : null}

                          <Card size="sm" className="gap-0 py-0">
                            <CardContent className="space-y-3 px-3 py-3">
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">{runtimeInspector.persona}</Badge>
                                <Badge variant="outline">{runtimeInspector.intentOverride ? titleCaseLabel(runtimeInspector.intentOverride) : "Auto"}</Badge>
                                <Badge variant="outline">{runtimeInspector.currentSurface}</Badge>
                                <Badge variant="outline">{runtimeInspector.workspaceState}</Badge>
                              </div>
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <p>
                                  Runtime agent:{" "}
                                  <span className="font-medium text-foreground">{runtimeInspector.inspector.runtimeAgent}</span>
                                </p>
                                <p>
                                  Intent override:{" "}
                                  <span className="font-medium text-foreground">
                                    {runtimeInspector.intentOverride ? titleCaseLabel(runtimeInspector.intentOverride) : "Auto"}
                                  </span>
                                </p>
                                <p>
                                  Focus goals:{" "}
                                  <span className="font-medium text-foreground">
                                    {runtimeInspector.focusGoalIds.join(", ") || "none"}
                                  </span>
                                </p>
                              </div>
                            </CardContent>
                          </Card>

                          <SidebarSection
                            title="Allowed Tools"
                            items={compactKeys(
                              Object.entries(runtimeInspector.inspector.capabilityEnvelope.tools)
                                .filter(([, access]) => access === "allow")
                                .map(([toolId]) => toolId),
                            )}
                            empty="No Buddy-owned tools are currently enabled."
                          />
                          <SidebarSection
                            title="Allowed Skills"
                            items={compactKeys(
                              Object.entries(runtimeInspector.inspector.capabilityEnvelope.skills)
                                .filter(([, access]) => access === "allow")
                                .map(([skillName]) => skillName),
                            )}
                            empty="No bundled activity skills are currently enabled."
                          />
                          <SidebarSection
                            title="Preferred Helpers"
                            items={compactKeys(
                              Object.entries(runtimeInspector.inspector.capabilityEnvelope.subagents)
                                .filter(([, access]) => access === "prefer")
                                .map(([subagentId]) => subagentId),
                            )}
                            empty="No helper preference is currently being forced."
                          />
                          <SidebarSection
                            title="Learner Digest"
                            items={[
                              `Workspace: ${runtimeInspector.inspector.learnerDigest.workspaceLabel}`,
                              `Relevant goals: ${runtimeInspector.inspector.learnerDigest.relevantGoalIds.join(", ") || "none"}`,
                              `Recommended next action: ${titleCaseLabel(runtimeInspector.inspector.learnerDigest.recommendedNextAction)}`,
                              ...runtimeInspector.inspector.learnerDigest.constraintsSummary,
                              ...runtimeInspector.inspector.learnerDigest.openFeedbackActions.map((item) => `Open feedback: ${item}`),
                            ]}
                          />
                          <SidebarSection
                            title="Advisory Suggestions"
                            items={runtimeInspector.inspector.advisorySuggestions}
                            empty="No advisory suggestions are available yet."
                          />
                          <SidebarSection
                            title="Activity Bundles"
                            items={runtimeInspector.inspector.capabilityEnvelope.activityBundles.map(formatActivityBundleSummary)}
                            empty="No first-class activity bundles are available for this runtime."
                          />
                          <div className="grid gap-3">
                            {runtimeInspector.inspector.stableHeaderSections.map((section, index) => (
                              <Card key={`${section.kind}-${index}`} size="sm" className="gap-0 py-0">
                                <CardContent className="px-3 py-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {section.label}
                                  </p>
                                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-foreground/85">
                                    {section.text}
                                  </pre>
                                </CardContent>
                              </Card>
                            ))}
                            {runtimeInspector.inspector.turnContextSections.map((section, index) => (
                              <Card key={`${section.kind}-turn-${index}`} size="sm" className="gap-0 py-0">
                                <CardContent className="px-3 py-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {section.label}
                                  </p>
                                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-foreground/85">
                                    {section.text}
                                  </pre>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Send a prompt in this session to capture the compiled teaching runtime.
                        </p>
                      )}

                      {inspectorError ? (
                        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                          {inspectorError}
                        </p>
                      ) : null}
                    </CollapsibleContent>
                  </CardContent>
                </Card>
              </Collapsible>

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
