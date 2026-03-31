import { useEffect, useState } from "react"
import { Badge } from "@buddy/ui"
import { BasicTool, ToolOutputPanel } from "../../shared"
import { MermaidDiagram } from "../mermaid-diagram"
import { language } from "@/context/language"
import {
  isRecord,
  readNonEmptyString,
  readNonNegativeInt,
  unwrapError,
} from "../../shared/utils"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import type { ToolPartProps } from "../registry"
import type { RenderMermaidToolOutput } from "../types"

type RenderMermaidToolReference = Omit<RenderMermaidToolOutput, "source"> & {
  source?: string
}

type MermaidArtifactRoutePayload = {
  artifactID: string
  diagramType: string
  alt: string
  caption?: string
  repairAttempts: number
  repairLog: string[]
  source: string
}

const MERMAID_ARTIFACT_CACHE_LIMIT = 200
const mermaidArtifactCache = new Map<string, MermaidArtifactRoutePayload>()
const mermaidArtifactRequests = new Map<string, Promise<MermaidArtifactRoutePayload>>()

function touchMermaidArtifactCache(key: string, value: MermaidArtifactRoutePayload): void {
  mermaidArtifactCache.delete(key)
  mermaidArtifactCache.set(key, value)

  if (mermaidArtifactCache.size <= MERMAID_ARTIFACT_CACHE_LIMIT) {
    return
  }

  const oldest = mermaidArtifactCache.keys().next().value
  if (typeof oldest === "string") {
    mermaidArtifactCache.delete(oldest)
  }
}

function parseRenderMermaidReference(
  state: ToolPartProps["state"],
): RenderMermaidToolReference | undefined {
  if (readNonEmptyString(state.metadata.artifact) !== "RenderMermaidOutput") {
    return undefined
  }

  const value = isRecord(state.metadata.value) ? state.metadata.value : undefined
  if (!value) {
    return undefined
  }

  const artifactID = readNonEmptyString(value.artifactID)
  const artifactUrl =
    readNonEmptyString(value.artifactUrl) ??
    `/api/mermaid-artifacts/${artifactID ?? language.t("rightSidebar.snapshot.unknown")}`
  const diagramType =
    readNonEmptyString(value.diagramType) ?? language.t("chatTools.defaultMermaidType")
  const alt = readNonEmptyString(value.alt) ?? language.t("chatTools.defaultMermaidAlt")
  const caption = readNonEmptyString(value.caption)
  const repairAttempts = readNonNegativeInt(value.repairAttempts) ?? 0
  const source = readNonEmptyString(value.source)
  const repairLog = Array.isArray(value.repairLog)
    ? value.repairLog.filter((entry): entry is string => typeof entry === "string")
    : []

  if (!artifactID) {
    return undefined
  }

  return {
    artifactID,
    artifactUrl,
    source,
    diagramType,
    repairAttempts,
    repairLog,
    alt,
    ...(caption ? { caption } : {}),
  }
}

export function parseRenderMermaidOutput(
  state: ToolPartProps["state"],
): RenderMermaidToolOutput | undefined {
  const parsed = parseRenderMermaidReference(state)
  if (!parsed?.source) {
    return undefined
  }

  return {
    artifactID: parsed.artifactID,
    artifactUrl: parsed.artifactUrl,
    source: parsed.source,
    diagramType: parsed.diagramType,
    repairAttempts: parsed.repairAttempts,
    repairLog: [...parsed.repairLog],
    alt: parsed.alt,
    ...(parsed.caption ? { caption: parsed.caption } : {}),
  }
}

function parseMermaidArtifactResponse(value: unknown): MermaidArtifactRoutePayload | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const artifactID = readNonEmptyString(value.artifactID)
  const diagramType = readNonEmptyString(value.diagramType)
  const alt = readNonEmptyString(value.alt)
  const caption = readNonEmptyString(value.caption)
  const repairAttempts = readNonNegativeInt(value.repairAttempts)
  const source = readNonEmptyString(value.source)
  const repairLog = Array.isArray(value.repairLog)
    ? value.repairLog.filter((entry): entry is string => typeof entry === "string")
    : []

  if (!artifactID || !diagramType || !alt || repairAttempts === undefined || !source) {
    return undefined
  }

  return {
    artifactID,
    diagramType,
    alt,
    repairAttempts,
    repairLog,
    source,
    ...(caption ? { caption } : {}),
  }
}

async function fetchMermaidArtifact(
  directory: string,
  artifactID: string,
): Promise<MermaidArtifactRoutePayload> {
  const key = `${directory}::${artifactID}`
  const cached = mermaidArtifactCache.get(key)
  if (cached) {
    touchMermaidArtifactCache(key, cached)
    return cached
  }

  const existing = mermaidArtifactRequests.get(key)
  if (existing) {
    return existing
  }

  const request = getBuddyClient(directory)
    .mermaidArtifacts.read({
      artifactID,
    })
    .then((result) => {
      const payload = parseMermaidArtifactResponse(requireBuddyData(result))
      if (!payload) {
        throw new Error(language.t("chatTools.mermaidArtifactMissingFields"))
      }
      touchMermaidArtifactCache(key, payload)
      return payload
    })
    .finally(() => {
      mermaidArtifactRequests.delete(key)
    })

  mermaidArtifactRequests.set(key, request)
  return request
}

function inferMermaidDiagramTypeFromSource(source: string | undefined): string | undefined {
  if (!source) {
    return undefined
  }

  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("%%")) {
      continue
    }

    const [token] = trimmed.split(/\s+/u)
    if (!token) {
      continue
    }

    if (token.toLowerCase() === "graph") {
      return "flowchart"
    }

    return token
  }

  return undefined
}

function RenderMermaidToolCard({ state, info, directory }: ToolPartProps) {
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const showOutput = output.trim().length > 0
  const running = state.status === "pending" || state.status === "running"
  const pendingSource = readNonEmptyString(state.input.source)
  const pendingAlt =
    readNonEmptyString(state.input.alt) ??
    info.subtitle ??
    language.t("chatTools.defaultMermaidAlt")
  const pendingDiagramType = inferMermaidDiagramTypeFromSource(pendingSource)
  const parsed = state.status === "completed" ? parseRenderMermaidReference(state) : undefined
  const parsedArtifactID = parsed?.artifactID
  const parsedSource = parsed?.source
  const parsedKey = parsed ? `${parsed.artifactID}:${parsedSource ?? ""}` : ""

  const [rehydrated, setRehydrated] = useState<MermaidArtifactRoutePayload | undefined>(undefined)
  const [rehydrationError, setRehydrationError] = useState<string | undefined>(undefined)

  useEffect(() => {
    setRehydrated(undefined)
    setRehydrationError(undefined)

    if (state.status !== "completed") {
      return
    }
    if (!parsedKey || parsedSource || !parsedArtifactID) {
      return
    }
    if (!directory) {
      setRehydrationError(language.t("chatTools.mermaidNoWorkspaceDirectory"))
      return
    }

    let cancelled = false
    void fetchMermaidArtifact(directory, parsedArtifactID)
      .then((artifact) => {
        if (cancelled) return
        setRehydrated(artifact)
      })
      .catch((error) => {
        if (cancelled) return
        setRehydrationError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
    }
  }, [directory, parsedArtifactID, parsedKey, parsedSource, state.status])

  if (running) {
    return (
      <BasicTool
        trigger={{
          title: pendingAlt,
          ...(pendingDiagramType
            ? {
                trailing: (
                  <Badge variant="outline" className="text-[11px] text-text-weak">
                    {pendingDiagramType}
                  </Badge>
                ),
              }
            : {}),
        }}
        status={state.status}
        hideDetails
      >
        <div
          data-component="mermaid-tool-loading"
          role="status"
          aria-live="polite"
          className="rounded-lg border border-border-base bg-background-base p-3"
        >
          <div className="flex items-center gap-2 text-sm text-text-weak">
            <span className="size-2 rounded-full bg-text-weak/60 animate-pulse" />
            <span>{language.t("chatTools.generatingMermaid")}</span>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-surface-weak/70" />
            <div className="h-24 w-full animate-pulse rounded-md bg-surface-weak/55" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface-weak/70" />
          </div>
        </div>
      </BasicTool>
    )
  }

  if (!parsed) {
    return (
      <BasicTool
        trigger={{ title: info.title, subtitle: info.subtitle }}
        status={state.status}
        hideDetails
      >
        {state.status === "error" && showOutput ? (
          <ToolOutputPanel
            output={output}
            status={state.status}
            copyLabel={language.t("chatTools.copyOutput")}
          />
        ) : null}
      </BasicTool>
    )
  }

  const source = parsedSource ?? rehydrated?.source
  const diagramType = parsedSource
    ? parsed.diagramType
    : (rehydrated?.diagramType ?? parsed.diagramType)
  const alt = parsedSource ? parsed.alt : (rehydrated?.alt ?? parsed.alt)
  const repairLog = parsed.repairLog.length > 0 ? parsed.repairLog : (rehydrated?.repairLog ?? [])
  const isRehydrating =
    state.status === "completed" &&
    !source &&
    !!parsedArtifactID &&
    !!directory &&
    !rehydrationError &&
    !rehydrated

  return (
    <BasicTool
      trigger={{
        title: alt,
        trailing: (
          <Badge variant="outline" className="text-[11px] text-text-weak">
            {diagramType}
          </Badge>
        ),
      }}
      status={state.status}
      hideStatus
      hideDetails
    >
      {source ? (
        <MermaidDiagram
          source={source}
          artifactID={parsed.artifactID}
          alt={alt}
          hideLoadingPlaceholder
          className="rounded-lg border border-border-base bg-background-base p-3"
          failureClassName="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base"
          showRawSourceOnError
        />
      ) : null}

      {isRehydrating ? (
        <div className="rounded-lg border border-border-base bg-background-base p-3 text-sm text-text-weak">
          {language.t("chatTools.rehydratingMermaid")}
        </div>
      ) : null}

      {!source && !isRehydrating ? (
        <div className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
          {language.t("chatTools.mermaidSourceUnavailable")}
        </div>
      ) : null}

      {rehydrationError ? (
        <div className="mt-2 text-sm text-text-weak">{rehydrationError}</div>
      ) : null}

      {repairLog.length > 0 ? (
        <div className="mt-2 text-xs text-text-weak">{repairLog.join(" ")}</div>
      ) : null}

      {state.status === "error" && showOutput ? (
        <ToolOutputPanel
          output={output}
          status={state.status}
          copyLabel={language.t("chatTools.copyOutput")}
        />
      ) : null}
    </BasicTool>
  )
}

export function renderRenderMermaidTool(props: ToolPartProps) {
  return <RenderMermaidToolCard {...props} />
}
