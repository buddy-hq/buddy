import { useState, useEffect, type ReactNode } from "react"
import { Collapsible, CollapsibleTrigger, CollapsibleContent, ChevronRightIcon, cn } from "@buddy/ui"
import { ToolHeader } from "./tool-header"
import { CopyAction } from "./copy-action"
import type { ToolInfo, ToolState } from "../tools/registry"

interface ToolCardWithDetailsProps {
  info: ToolInfo
  status: ToolState["status"]
  running: boolean
  defaultOpen?: boolean
  children: ReactNode
}

export function ToolCardWithDetails({
  info,
  status,
  running,
  defaultOpen = false,
  children,
}: ToolCardWithDetailsProps) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (status === "error") setOpen(true)
  }, [status])

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full rounded-lg border border-border bg-card p-3">
      <CollapsibleTrigger asChild>
        <button type="button" className="w-full text-left">
          <ToolHeader info={info} status={status} running={running} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

interface ToolOutputPanelProps {
  output: string
  status: ToolState["status"]
  copyLabel: string
}

export function ToolOutputPanel({ output, status, copyLabel }: ToolOutputPanelProps) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <pre
        className={cn(
          "max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground",
          status === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        {output}
      </pre>
      <div className="flex justify-start">
        <CopyAction value={output} label={copyLabel} />
      </div>
    </div>
  )
}

interface DiagnosticListProps {
  diagnostics: Array<{
    range: { start: { line: number; character: number } }
    message: string
    severity?: number
  }>
}

export function DiagnosticList({ diagnostics }: DiagnosticListProps) {
  if (diagnostics.length === 0) return null

  return (
    <div className="mt-2 flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
      {diagnostics.map((diagnostic, index) => (
        <div key={index} className="flex items-baseline gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-destructive">error</span>
          <span className="shrink-0 text-destructive/80">
            [{diagnostic.range.start.line + 1}:{diagnostic.range.start.character + 1}]
          </span>
          <span className="text-destructive/90">{diagnostic.message}</span>
        </div>
      ))}
    </div>
  )
}

interface ApplyPatchFileItemProps {
  file: {
    relativePath: string
    type: "add" | "update" | "delete" | "move"
    before: string
    after: string
    additions: number
    deletions: number
  }
}

export function ApplyPatchFileItem({ file }: ApplyPatchFileItemProps) {
  const [open, setOpen] = useState(file.type !== "delete")

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border bg-background">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{file.relativePath}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-primary">+{file.additions}</span>
              <span className="text-destructive">-{file.deletions}</span>
              <span className="capitalize">{file.type}</span>
            </div>
          </div>
          <ChevronRightIcon
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-2 border-t border-border p-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Before</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {file.before || "(empty)"}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">After</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {file.after || "(empty)"}
            </pre>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
