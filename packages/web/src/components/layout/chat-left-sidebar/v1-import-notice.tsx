import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Alert, AlertDescription } from "@buddy/ui/components/ui/alert"
import { language } from "@/context/language"
import { restoreAwaitedImportedSession } from "@/lib/restore-imported-session"
import { loadSessions } from "@/state/chat-actions"
import { v1ImportInProgress, v1ImportQueryOptions, type V1ImportReport } from "@/state/v1-import-query"

export type V1ImportNoticeLine = {
  readonly key: string
  readonly tone: "default" | "destructive"
  readonly text: string
}

function v1ImportRanThisLaunch(report: V1ImportReport | undefined, observedImport: boolean): boolean {
  if (!report) return false
  return report.importRan || observedImport || report.upgrade.state === "ready"
}

export function v1ImportNoticeLines(report: V1ImportReport | undefined, observedImport: boolean): readonly V1ImportNoticeLine[] {
  if (!report) return []
  if (report.upgrade.state === "failed") {
    return [{
      key: "failed",
      tone: "destructive",
      text: language.t("sidebar.chatImport.failed", { error: report.upgrade.error ?? language.t("sidebar.chatImport.unknownError") }),
    }]
  }
  if (v1ImportInProgress(report)) return [{ key: "progress", tone: "default", text: language.t("sidebar.chatImport.progress") }]
  const lines: V1ImportNoticeLine[] = []
  if (report.import?.status === "error") lines.push({ key: "error", tone: "default", text: language.t("sidebar.chatImport.error") })
  const finished = report.import?.status === "completed" || report.import?.status === "error"
  if (!finished || !v1ImportRanThisLaunch(report, observedImport)) return lines
  if (report.skipped.length > 0) {
    lines.push({ key: "skipped", tone: "default", text: language.t("sidebar.chatImport.skipped", { count: report.skipped.length }) })
  }
  const dropped = report.content.filter((chat) => chat.subtaskPrompts + chat.subtaskResults + chat.assistantFiles > 0).length
  if (dropped > 0) lines.push({ key: "content", tone: "default", text: language.t("sidebar.chatImport.content", { count: dropped }) })
  return lines
}

export function V1UpgradeFailureNotice(props: { readonly report: V1ImportReport | undefined }) {
  if (props.report?.upgrade.state !== "failed") return null
  const failedLine = v1ImportNoticeLines(props.report, false).find((line) => line.key === "failed")
  return (
    <div data-component="onboarding-upgrade-failure" className="mb-6">
      <Alert variant="destructive">
        <AlertDescription>{failedLine?.text}</AlertDescription>
      </Alert>
    </div>
  )
}

export function V1ImportNotice(props: { readonly directories: readonly string[] }) {
  const query = useQuery(v1ImportQueryOptions())
  const report = query.data
  const [observedImport, setObservedImport] = useState(false)
  const reloadedFor = useRef<string | undefined>(undefined)
  const directories = useRef(props.directories)
  directories.current = props.directories
  const status = report?.import?.status
  const ranThisLaunch = v1ImportRanThisLaunch(report, observedImport)

  useEffect(() => {
    if (status === "running" || status === "required") setObservedImport(true)
  }, [status])

  useEffect(() => {
    if (!ranThisLaunch || (status !== "completed" && status !== "error") || reloadedFor.current === status) return
    reloadedFor.current = status
    for (const directory of directories.current) {
      void loadSessions(directory)
        .then((sessions) => restoreAwaitedImportedSession(directory, sessions))
        .catch(() => undefined)
    }
  }, [status, ranThisLaunch])

  const lines = v1ImportNoticeLines(report, observedImport)
  if (lines.length === 0) return null
  return (
    <div data-component="left-sidebar-chat-import-notice" className="flex flex-col gap-1.5 px-1.5 pb-3">
      {lines.map((line) => (
        <Alert key={line.key} variant={line.tone}>
          <AlertDescription>{line.text}</AlertDescription>
        </Alert>
      ))}
    </div>
  )
}
