import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ToolErrorPanel } from "../../../tools/tool-error-panel"
import { MermaidDiagram } from "./mermaid-diagram"
import { MermaidToolCard } from "./mermaid-tool-card"
import { language } from "@/context/language"
import { isRecord, readNonEmptyString } from "../../../tools/types"
import { unwrapError } from "../../../utils/error"
import { sendPrompt } from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import type { ToolPartProps } from "../../registry"
import type { AssistantMessageInfo, MessagePart, MessageWithParts } from "@/state/chat-types"
import {
  readMermaidArtifact,
  readMermaidAutoRepairStatus,
  startMermaidAutoRepair,
  type MermaidArtifactRecord,
  type MermaidRepairStartResponse,
} from "./lib/persisted-renders"
import { findSupersedingMermaidArtifactID } from "./lib/supersession"

type RenderMermaidToolOutput = {
  artifactID: string
  artifactUrl: string
  source: string
  sourceHash: string
  diagramType: string
  alt: string
  caption?: string
  supersedesArtifactID?: string
}

type RenderMermaidToolReference = Omit<RenderMermaidToolOutput, "source"> & {
  source?: string
}

type RenderMermaidToolSources = {
  artifactSource?: string
  inputSource?: string
}

type MermaidFixPromptTarget = {
  agent: string
  model: {
    providerID: string
    modelID: string
  }
}

type MermaidRenderFailure = {
  message: string
  persisted: boolean
  renderKey?: string
}

export function shouldStartMermaidAutoRepair(input: {
  artifact: Pick<MermaidArtifactRecord, "autoRepair" | "origin"> | undefined
  directory?: string
  renderFailure?: MermaidRenderFailure
}): boolean {
  return (
    !!input.directory &&
    !!input.artifact &&
    !!input.renderFailure?.renderKey &&
    input.artifact.origin.kind === "tool" &&
    input.artifact.autoRepair.status === "eligible"
  )
}

type MermaidRepairState =
  | {
      status: "idle"
    }
  | {
      status: "running"
      repairRequestID: string
    }
  | {
      status: "succeeded"
      replacementArtifactID: string
    }
  | {
      status: "exhausted"
      lastErrorMessage: string
    }
  | {
      status: "ineligible"
      lastErrorMessage: string
    }

const MERMAID_ARTIFACT_CACHE_LIMIT = 200
const MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS = 1_000
const mermaidArtifactCache = new Map<string, MermaidArtifactRecord>()
const mermaidArtifactRequests = new Map<string, Promise<MermaidArtifactRecord>>()

function touchMermaidArtifactCache(key: string, value: MermaidArtifactRecord): void {
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
  if (!value || readNonEmptyString(value.kind) !== "mermaid.v2") {
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
  const source = readNonEmptyString(value.source)
  const sourceHash = readNonEmptyString(value.sourceHash) ?? ""
  const supersedesArtifactID = readNonEmptyString(value.supersedesArtifactID)

  if (!artifactID) {
    return undefined
  }

  return {
    artifactID,
    artifactUrl,
    source,
    sourceHash,
    diagramType,
    alt,
    ...(caption ? { caption } : {}),
    ...(supersedesArtifactID ? { supersedesArtifactID } : {}),
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
    sourceHash: parsed.sourceHash,
    diagramType: parsed.diagramType,
    alt: parsed.alt,
    ...(parsed.caption ? { caption: parsed.caption } : {}),
    ...(parsed.supersedesArtifactID ? { supersedesArtifactID: parsed.supersedesArtifactID } : {}),
  }
}

export function parseRenderMermaidSources(state: ToolPartProps["state"]): RenderMermaidToolSources {
  const parsed = parseRenderMermaidReference(state)
  return {
    artifactSource: parsed?.source,
    inputSource: readNonEmptyString(state.input.source),
  }
}

async function fetchMermaidArtifact(
  directory: string,
  artifactID: string,
): Promise<MermaidArtifactRecord> {
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

  const request = readMermaidArtifact(directory, artifactID)
    .then((artifact) => {
      touchMermaidArtifactCache(key, artifact)
      return artifact
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

function formatMermaidFixFeedback(input: {
  artifactID: string
  alt: string
  errorMessage: string
  failedRenderKey?: string
  source: string
}): string {
  return [
    `The mermaid diagram (alt: "${input.alt}") failed to render in the browser.`,
    "",
    `Artifact ID: ${input.artifactID}`,
    ...(input.failedRenderKey ? [`Failed render key: ${input.failedRenderKey}`, ""] : []),
    `Browser render error: ${input.errorMessage}`,
    "",
    "Failed source:",
    "```mermaid",
    input.source,
    "```",
    "",
    `Please fix the Mermaid source and call render_mermaid exactly once with repairOfArtifactID: "${input.artifactID}".`,
  ].join("\n")
}

function resolveAssistantMessage(messages: MessageWithParts[], part: MessagePart) {
  return messages.find(
    (message): message is MessageWithParts & { info: AssistantMessageInfo } =>
      message.info.role === "assistant" && message.info.id === part.messageID,
  )
}

function resolveMermaidFixPromptTarget(
  directory: string,
  part: MessagePart,
): MermaidFixPromptTarget | undefined {
  const messages = selectSessionMessages(directory, part.sessionID)
  const assistantMessage = resolveAssistantMessage(messages, part)
  if (!assistantMessage) {
    return undefined
  }

  return {
    agent: assistantMessage.info.agent,
    model: {
      providerID: assistantMessage.info.providerID,
      modelID: assistantMessage.info.modelID,
    },
  }
}

function selectSessionMessages(directory: string, sessionID: string): MessageWithParts[] {
  const directoryState = useChatStore.getState().directories[directory]
  if (!directoryState) {
    return []
  }

  return (
    directoryState.messagesBySessionID?.[sessionID] ??
    (directoryState.sessionID === sessionID ? directoryState.messages : [])
  )
}

function repairStateFromArtifact(artifact: MermaidArtifactRecord | undefined): MermaidRepairState {
  if (!artifact) {
    return { status: "idle" }
  }
  switch (artifact.autoRepair.status) {
    case "running":
      return {
        status: "running",
        repairRequestID: artifact.autoRepair.repairRequestID,
      }
    case "succeeded":
      return {
        status: "succeeded",
        replacementArtifactID: artifact.autoRepair.replacementArtifactID,
      }
    case "exhausted":
      return {
        status: "exhausted",
        lastErrorMessage: artifact.autoRepair.lastErrorMessage,
      }
    case "not_needed":
      return {
        status: "ineligible",
        lastErrorMessage: language.t("chatTools.mermaidDiagram.renderFixRequest"),
      }
    default:
      return { status: "idle" }
  }
}

function RenderMermaidToolCard({ part, state, info, directory }: ToolPartProps) {
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

  const [rehydrated, setRehydrated] = useState<MermaidArtifactRecord | undefined>(undefined)
  const [rehydrationError, setRehydrationError] = useState<string | undefined>(undefined)
  const [fixRequested, setFixRequested] = useState(false)
  const [repairState, setRepairState] = useState<MermaidRepairState>({ status: "idle" })
  const [renderFailure, setRenderFailure] = useState<MermaidRenderFailure | undefined>(undefined)
  const startedRepairRef = useRef<string | undefined>(undefined)
  const artifactSessionID = rehydrated?.origin.sessionID ?? part.sessionID
  const sessionMessages = useChatStore((store) => {
    if (!directory || !artifactSessionID) {
      return []
    }
    const directoryState = store.directories[directory]
    if (!directoryState) {
      return []
    }
    return (
      directoryState.messagesBySessionID?.[artifactSessionID] ??
      (directoryState.sessionID === artifactSessionID ? directoryState.messages : [])
    )
  })

  useEffect(() => {
    setRehydrated(undefined)
    setRehydrationError(undefined)

    if (state.status !== "completed") {
      return
    }
    if (!parsedArtifactID) {
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
  }, [directory, parsedArtifactID, state.status])

  const artifact = rehydrated

  useEffect(() => {
    setRepairState(repairStateFromArtifact(artifact))
  }, [artifact])

  useEffect(() => {
    if (!shouldStartMermaidAutoRepair({ artifact, directory, renderFailure })) {
      return
    }
    const renderKey = renderFailure?.renderKey
    if (!directory || !artifact || !renderKey) {
      return
    }
    if (artifact.origin.kind !== "tool" || artifact.autoRepair.status !== "eligible") {
      return
    }

    const repairKey = `${artifact.artifactID}:${renderKey}`
    if (startedRepairRef.current === repairKey) {
      return
    }
    startedRepairRef.current = repairKey

    void startMermaidAutoRepair({
      artifactID: artifact.artifactID,
      directory,
      failedRenderKey: renderKey,
      sessionID: artifact.origin.sessionID,
    })
      .then((response: MermaidRepairStartResponse) => {
        if (response.status === "running") {
          setRepairState({
            status: "running",
            repairRequestID: response.repairRequestID,
          })
          return
        }
        setRepairState({
          status: "exhausted",
          lastErrorMessage:
            response.lastErrorMessage ?? language.t("chatTools.mermaidDiagram.renderErrorDefault"),
        })
      })
      .catch((error) => {
        setRepairState({
          status: "exhausted",
          lastErrorMessage: error instanceof Error ? error.message : String(error),
        })
      })
  }, [artifact, directory, renderFailure])

  useEffect(() => {
    if (repairState.status !== "running" || !directory || !artifact) {
      return
    }

    let cancelled = false
    const interval = window.setInterval(() => {
      void readMermaidAutoRepairStatus({
        directory,
        repairRequestID: repairState.repairRequestID,
        sessionID: artifact.origin.sessionID,
      })
        .then((status) => {
          if (cancelled) {
            return
          }
          if (status.status === "running") {
            return
          }
          setRepairState(
            status.status === "succeeded" && status.replacementArtifactID
              ? {
                  status: "succeeded",
                  replacementArtifactID: status.replacementArtifactID,
                }
              : {
                  status: "exhausted",
                  lastErrorMessage:
                    status.lastErrorMessage ??
                    language.t("chatTools.mermaidDiagram.renderErrorDefault"),
                },
          )
        })
        .catch(() => {
          if (cancelled) {
            return
          }
          setRepairState({
            status: "exhausted",
            lastErrorMessage: language.t("chatTools.mermaidDiagram.renderErrorDefault"),
          })
        })
    }, MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [artifact, directory, repairState])

  const source = parsed?.source ?? artifact?.source
  const diagramType = parsed?.diagramType ?? artifact?.diagramType ?? pendingDiagramType
  const alt = parsed?.alt ?? artifact?.alt ?? pendingAlt
  const currentArtifactID = parsed?.artifactID ?? artifact?.artifactID
  const supersedingArtifactID = useMemo(() => {
    if (!currentArtifactID) {
      return undefined
    }
    return findSupersedingMermaidArtifactID(sessionMessages, currentArtifactID)
  }, [currentArtifactID, sessionMessages])

  const handleRenderFailure = useCallback((failure: MermaidRenderFailure) => {
    setRenderFailure(failure)
  }, [])

  const handleRequestFix = useCallback(() => {
    if (!directory || fixRequested || !source || !alt) return
    const artifactID = parsed?.artifactID ?? artifact?.artifactID
    if (!artifactID) return
    setFixRequested(true)
    const feedback = formatMermaidFixFeedback({
      artifactID,
      alt,
      errorMessage:
        renderFailure?.message ?? language.t("chatTools.mermaidDiagram.renderErrorDefault"),
      failedRenderKey: renderFailure?.renderKey,
      source,
    })
    void sendPrompt(directory, feedback, resolveMermaidFixPromptTarget(directory, part)).catch(
      () => {
        setFixRequested(false)
      },
    )
  }, [
    alt,
    artifact?.artifactID,
    directory,
    fixRequested,
    parsed?.artifactID,
    part,
    renderFailure,
    source,
  ])

  const canRequestFix =
    !!directory &&
    !!source &&
    !!renderFailure &&
    repairState.status !== "running" &&
    repairState.status !== "succeeded" &&
    !supersedingArtifactID &&
    (repairState.status === "exhausted" || repairState.status === "ineligible")

  const errorMeta =
    repairState.status === "running"
      ? language.t("chatTools.mermaidDiagram.repairing")
      : repairState.status === "exhausted"
        ? repairState.lastErrorMessage
        : undefined

  if (running) {
    return (
      <MermaidToolCard
        title={pendingAlt}
        diagramType={pendingDiagramType}
        status={state.status}
        contentClassName="h-[32rem]"
      >
        <div
          data-component="mermaid-tool-loading"
          role="status"
          aria-live="polite"
          className="w-full min-w-[300px] p-4 sm:w-[450px]"
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
      </MermaidToolCard>
    )
  }

  if (!parsed) {
    return (
      <MermaidToolCard title={info.title} status={state.status}>
        {state.status === "error" && showOutput ? <ToolErrorPanel error={output} /> : null}
      </MermaidToolCard>
    )
  }

  if (repairState.status === "succeeded" || supersedingArtifactID) {
    return (
      <MermaidToolCard title={alt} diagramType={diagramType} hideStatus>
        <div className="p-4 text-sm text-text-weak">
          {language.t("chatTools.mermaidDiagram.replaced")}
        </div>
      </MermaidToolCard>
    )
  }

  if (!source) {
    return (
      <MermaidToolCard title={alt} diagramType={diagramType} hideStatus>
        <div className="p-4 text-sm text-text-weak">
          {rehydrationError ?? language.t("chatTools.mermaidSourceUnavailable")}
        </div>
      </MermaidToolCard>
    )
  }

  return (
    <MermaidDiagram
      directory={directory}
      source={source}
      artifactID={parsed.artifactID}
      alt={alt}
      hideLoadingPlaceholder
      renderPriority={0}
      className="h-full p-4"
      showRawSourceOnError
      errorMeta={errorMeta}
      onRenderFailure={handleRenderFailure}
      onRequestFix={canRequestFix ? () => handleRequestFix() : undefined}
      fixDisabled={fixRequested || repairState.status === "running"}
      renderWrapper={(diagramElement, actions) => (
        <MermaidToolCard
          title={alt}
          diagramType={diagramType}
          hideStatus
          actions={actions}
          contentClassName="h-[32rem]"
        >
          <div className="h-full w-full">{diagramElement}</div>
        </MermaidToolCard>
      )}
    />
  )
}

export function renderRenderMermaidTool(props: ToolPartProps) {
  return <RenderMermaidToolCard {...props} />
}
