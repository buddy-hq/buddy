import { useQuery } from "@tanstack/react-query"
import { Alert, AlertDescription } from "@buddy/ui/components/ui/alert"
import { v1ImportQueryOptions } from "@/state/v1-import-query"
import { v1ImportNoticeLines } from "./chat-left-sidebar/v1-import-notice"

export function UpgradePendingScreen() {
  const { data: report } = useQuery(v1ImportQueryOptions())
  const state = report?.upgrade.state
  if (state !== "copying" && state !== "migrating" && state !== "failed") return null

  const lines = v1ImportNoticeLines(report, false)
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col gap-1.5 px-1.5 pb-3">
        {lines.map((line) => (
          <Alert key={line.key} variant={line.tone}>
            <AlertDescription>{line.text}</AlertDescription>
          </Alert>
        ))}
      </div>
    </div>
  )
}
