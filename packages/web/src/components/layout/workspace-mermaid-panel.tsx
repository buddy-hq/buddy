import { useCallback, useEffect, useState } from "react"
import { Badge, Button, Card, CardContent } from "@buddy/ui"
import { language } from "@/context/language"
import { MermaidDiagram } from "@/components/chat/shared"
import {
  loadWorkspaceMermaidArtifacts,
  type WorkspaceMermaidArtifactView,
} from "@/state/chat-actions"

function formatCreatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function artifactLabel(count: number): string {
  return `${count} diagram${count === 1 ? "" : "s"}`
}

export function WorkspaceMermaidPanel(props: { directory: string }) {
  const [artifacts, setArtifacts] = useState<WorkspaceMermaidArtifactView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)

  const loadArtifacts = useCallback(
    async (isDisposed?: () => boolean) => {
      const disposed = isDisposed ?? (() => false)
      if (!disposed()) {
        setLoading(true)
        setError(undefined)
      }

      try {
        const result = await loadWorkspaceMermaidArtifacts(props.directory)
        if (disposed()) return
        setArtifacts(result.artifacts)
      } catch (loadError) {
        if (disposed()) return
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      } finally {
        if (!disposed()) {
          setLoading(false)
        }
      }
    },
    [props.directory],
  )

  useEffect(() => {
    let disposed = false
    void loadArtifacts(() => disposed)

    return () => {
      disposed = true
    }
  }, [loadArtifacts])

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">{language.t("workspaceMermaid.title")}</p>
          <p className="text-[11px] text-text-weak">{artifactLabel(artifacts.length)}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void loadArtifacts()
          }}
        >
          {language.t("common.refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-text-weak">{language.t("workspaceMermaid.loading")}</div>
      ) : null}

      {!loading && artifacts.length === 0 ? (
        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border-base/70 bg-background-base p-3 text-sm text-text-weak">
          {language.t("workspaceMermaid.emptyState")}
        </div>
      ) : null}

      {artifacts.length > 0 ? (
        <div className="flex-1 min-h-0 space-y-3 overflow-y-auto">
          {artifacts.map((artifact) => (
            <Card key={artifact.artifactID} size="sm" className="gap-0 py-0">
              <CardContent className="space-y-3 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{artifact.diagramType}</Badge>
                  <Badge variant="outline">{formatCreatedAt(artifact.createdAt)}</Badge>
                  {artifact.repairAttempts > 0 ? (
                    <Badge variant="outline">
                      {language.t("workspaceMermaid.repairedPrefix")} {artifact.repairAttempts}{" "}
                      {artifact.repairAttempts === 1
                        ? language.t("workspaceMermaid.repairedTime")
                        : language.t("workspaceMermaid.repairedTimes")}
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-text-base">{artifact.alt}</p>
                  {artifact.caption ? (
                    <p className="text-sm text-text-weak">{artifact.caption}</p>
                  ) : null}
                </div>

                <MermaidDiagram
                  source={artifact.source}
                  artifactID={artifact.artifactID}
                  alt={artifact.alt}
                  className="rounded-lg border border-border-base bg-background-base p-3"
                  failureClassName="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base"
                  showRawSourceOnError
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {error}
        </p>
      ) : null}
    </div>
  )
}
