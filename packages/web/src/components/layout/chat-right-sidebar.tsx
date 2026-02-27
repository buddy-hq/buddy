import type { CSSProperties } from "react"
import { useEffect, useState } from "react"
import { Button, Textarea } from "@buddy/ui"
import { Markdown } from "@/components/Markdown"
import { loadCurriculum, saveCurriculum } from "@/state/chat-actions"
import { XIcon } from "./sidebar-icons"

type ChatRightSidebarProps = {
  directory: string
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
  const [curriculumLoading, setCurriculumLoading] = useState(false)
  const [curriculumSaving, setCurriculumSaving] = useState(false)
  const [curriculumError, setCurriculumError] = useState<string | undefined>(undefined)
  const [curriculumMarkdown, setCurriculumMarkdown] = useState("")
  const [curriculumDraft, setCurriculumDraft] = useState("")
  const [curriculumEditing, setCurriculumEditing] = useState(false)

  useEffect(() => {
    let disposed = false
    setCurriculumLoading(true)
    setCurriculumError(undefined)

    loadCurriculum(props.directory)
      .then((markdown) => {
        if (disposed) return
        setCurriculumMarkdown(markdown)
        setCurriculumDraft(markdown)
      })
      .catch((error) => {
        if (disposed) return
        setCurriculumError(stringifyError(error))
      })
      .finally(() => {
        if (disposed) return
        setCurriculumLoading(false)
      })

    return () => {
      disposed = true
    }
  }, [props.directory])

  async function onReloadCurriculum() {
    setCurriculumLoading(true)
    setCurriculumError(undefined)
    try {
      const markdown = await loadCurriculum(props.directory)
      setCurriculumMarkdown(markdown)
      setCurriculumDraft(markdown)
    } catch (error) {
      setCurriculumError(stringifyError(error))
    } finally {
      setCurriculumLoading(false)
    }
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
      className={`shrink-0 border-l bg-card/50 flex flex-col min-h-0 ${props.className ?? ""}`}
      style={props.style}
    >
      <header className="border-b px-3 py-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Curriculum</h2>
        <Button variant="ghost" size="icon-xs" onClick={props.onClose} title="Close panel">
          <XIcon className="size-3.5" />
        </Button>
      </header>

      <div className="flex-1 min-h-0 p-3 flex flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">curriculum.md</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setCurriculumEditing((value) => !value)}>
              {curriculumEditing ? "Preview" : "Edit"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void onReloadCurriculum()}>
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
          <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border/70 bg-background/40 p-3">
            {curriculumMarkdown.trim().length > 0 ? (
              <Markdown text={curriculumMarkdown} />
            ) : (
              <p className="text-sm text-muted-foreground">No curriculum found for this notebook yet.</p>
            )}
          </div>
        )}

        {curriculumError ? (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {curriculumError}
          </p>
        ) : null}
      </div>
    </aside>
  )
}
