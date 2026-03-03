import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { Button, Textarea } from "@buddy/ui"
import { Markdown } from "@/components/Markdown"
import { loadCurriculum, loadGoalsInspector, saveCurriculum } from "@/state/chat-actions"
import { XIcon } from "./sidebar-icons"

type ChatRightSidebarProps = {
  directory: string
  activeTab: "curriculum" | "editor" | "settings"
  onTabChange: (tab: "curriculum" | "editor" | "settings") => void
  showEditorTab?: boolean
  editorPanel?: ReactNode
  onClose: () => void
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

export function ChatRightSidebar(props: ChatRightSidebarProps) {
  const [goalsLoading, setGoalsLoading] = useState(false)
  const [goalsError, setGoalsError] = useState<string | undefined>(undefined)
  const [goalsPath, setGoalsPath] = useState(".buddy/goals.v1.json")
  const [goalsRaw, setGoalsRaw] = useState<string | null>(null)
  const [curriculumLoading, setCurriculumLoading] = useState(false)
  const [curriculumSaving, setCurriculumSaving] = useState(false)
  const [curriculumError, setCurriculumError] = useState<string | undefined>(undefined)
  const [curriculumMarkdown, setCurriculumMarkdown] = useState("")
  const [curriculumDraft, setCurriculumDraft] = useState("")
  const [curriculumEditing, setCurriculumEditing] = useState(false)

  const activeTab = props.activeTab === "editor" && props.showEditorTab ? "editor" : "curriculum"

  async function loadSidebarData(isDisposed?: () => boolean) {
    const disposed = isDisposed ?? (() => false)

    if (!disposed()) {
      setGoalsLoading(true)
      setGoalsError(undefined)
      setCurriculumLoading(true)
      setCurriculumError(undefined)
    }

    const [goalsResult, curriculumResult] = await Promise.allSettled([
      loadGoalsInspector(props.directory),
      loadCurriculum(props.directory),
    ])

    if (disposed()) return

    if (goalsResult.status === "fulfilled") {
      setGoalsPath(goalsResult.value.path)
      setGoalsRaw(goalsResult.value.raw)
    } else {
      setGoalsError(stringifyError(goalsResult.reason))
    }
    setGoalsLoading(false)

    if (curriculumResult.status === "fulfilled") {
      setCurriculumMarkdown(curriculumResult.value)
      setCurriculumDraft(curriculumResult.value)
    } else {
      setCurriculumError(stringifyError(curriculumResult.reason))
    }
    setCurriculumLoading(false)
  }

  useEffect(() => {
    if (activeTab !== "curriculum") return

    let disposed = false
    void loadSidebarData(() => disposed)

    return () => {
      disposed = true
    }
  }, [activeTab, props.directory])

  async function onReloadSidebar() {
    await loadSidebarData()
  }

  async function onSaveCurriculum() {
    setCurriculumSaving(true)
    setCurriculumError(undefined)
    try {
      const markdown = await saveCurriculum(props.directory, curriculumDraft)
      setCurriculumMarkdown(markdown)
      setCurriculumDraft(markdown)
      setCurriculumEditing(false)
    } catch (error) {
      setCurriculumError(stringifyError(error))
    } finally {
      setCurriculumSaving(false)
    }
  }

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
            Curriculum
          </Button>
          {props.showEditorTab ? (
            <Button
              variant={activeTab === "editor" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => props.onTabChange("editor")}
            >
              Editor
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
      ) : (
        <div className="flex-1 min-h-0 p-3 flex flex-col">
          <div className="mb-3 rounded-lg border border-border/70 bg-background">
            <div className="border-b border-border/70 px-3 py-2">
              <p className="text-xs font-medium">Goals Inspector</p>
              <p className="text-[11px] text-muted-foreground" title={goalsPath}>
                .buddy/goals.v1.json
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto p-3">
              {goalsLoading ? (
                <div className="text-sm text-muted-foreground">Loading goals...</div>
              ) : goalsRaw ? (
                <pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground">{goalsRaw}</pre>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">No goals yet for this notebook.</p>
                  <p className="text-xs text-muted-foreground">
                    Goals help Buddy track what you want to learn. Ask Buddy to create a study plan to get started.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">curriculum.md</p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setCurriculumEditing((value) => !value)}>
                {curriculumEditing ? "Preview" : "Edit"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void onReloadSidebar()}>
                Refresh
              </Button>
              {curriculumEditing ? (
                <Button size="sm" onClick={() => void onSaveCurriculum()} disabled={curriculumSaving}>
                  {curriculumSaving ? "Saving..." : "Save"}
                </Button>
              ) : null}
            </div>
          </div>

          {curriculumLoading ? (
            <div className="text-sm text-muted-foreground">Loading curriculum...</div>
          ) : curriculumEditing ? (
            <Textarea
              value={curriculumDraft}
              onChange={(event) => setCurriculumDraft(event.target.value)}
              className="flex-1 min-h-[280px] font-mono text-xs"
            />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border/70 bg-background p-3">
              {curriculumMarkdown.trim().length > 0 ? (
                <Markdown text={curriculumMarkdown} />
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">No curriculum yet for this notebook.</p>
                  <p className="text-xs text-muted-foreground">
                    A curriculum gives Buddy a structured learning path. Ask Buddy to create one for this notebook.
                  </p>
                </div>
              )}
            </div>
          )}

          {curriculumError ? (
            <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {curriculumError}
            </p>
          ) : null}
          {goalsError ? (
            <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {goalsError}
            </p>
          ) : null}
        </div>
      )}
    </aside>
  )
}
