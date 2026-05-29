import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { language } from "@/context/language"
import { sendPrompt } from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import { MermaidDiagram } from "@/components/chat/tools/render/mermaid/mermaid-diagram"
import { MermaidToolCard } from "@/components/chat/tools/render/mermaid/mermaid-tool-card"
import { useInlineAssetActivation } from "@/components/chat/inline-asset-boundary"
import {
  createInlineMermaidArtifact,
  readMermaidAutoRepairStatus,
  startMermaidAutoRepair,
  type MermaidArtifactRecord,
  type MermaidRepairStartResponse,
} from "@/components/chat/tools/render/mermaid/lib/persisted-renders"
import { findSupersedingMermaidArtifactID } from "@/components/chat/tools/render/mermaid/lib/supersession"

const MERMAID_STREAM_STABLE_DELAY_MS = 600
const MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS = 1_000
const MARKDOWN_MERMAID_VIEWPORT_HEIGHT_CLASS = "h-[30rem]"
const MARKDOWN_MERMAID_DEFAULT_TITLE = "Mermaid diagram"
const MARKDOWN_MERMAID_DEFAULT_TYPE = "mermaid"

type MarkdownMermaidContext = {
  directory: string
  sessionID: string
  messageID: string
  partID: string
}

type MermaidRenderFailure = {
  message: string
  persisted: boolean
  renderKey?: string
}

type MermaidRepairState =
  | { status: "idle" }
  | { status: "running"; repairRequestID: string }
  | { status: "succeeded"; replacementArtifactID: string }
  | { status: "exhausted"; lastErrorMessage: string }
  | { status: "ineligible"; lastErrorMessage: string }

type MermaidFixPromptTarget = {
  agent: string
  model: {
    providerID: string
    modelID: string
  }
}

export function shouldDelayMarkdownMermaidSegment(input: {
  isStreaming: boolean
  readySourceIdentity?: string
  sourceIdentity: string
}): boolean {
  return input.isStreaming && input.readySourceIdentity !== input.sourceIdentity
}

export function shouldClearMarkdownMermaidArtifact(input: {
  requestedSource?: string
  nextSource: string
}): boolean {
  return input.requestedSource !== undefined && input.requestedSource !== input.nextSource
}

export function shouldStartMarkdownMermaidAutoRepair(input: {
  artifact: MermaidArtifactRecord | undefined
  renderFailure?: MermaidRenderFailure
}): boolean {
  return (
    !!input.artifact &&
    !!input.renderFailure?.renderKey &&
    input.artifact.autoRepair.status === "eligible"
  )
}

function resolveAssistantMessage(
  directory: string,
  input: { messageID: string; sessionID: string },
): MermaidFixPromptTarget | undefined {
  const directoryState = useChatStore.getState().directories[directory]
  if (!directoryState) {
    return undefined
  }

  const messages =
    directoryState.messagesBySessionID?.[input.sessionID] ??
    (directoryState.sessionID === input.sessionID ? directoryState.messages : [])
  const assistantMessage = messages.find(
    (
      message,
    ): message is typeof message & {
      info: { role: "assistant"; agent: string; providerID: string; modelID: string }
    } => message.info.role === "assistant" && message.info.id === input.messageID,
  )
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

function formatFixPrompt(input: {
  artifactID: string
  alt: string
  errorMessage: string
  failedRenderKey?: string
  source: string
}): string {
  return [
    `The Mermaid diagram (alt: "${input.alt}") failed to render in the browser.`,
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
    "Copy the artifact ID verbatim; do not replace it with a placeholder, zeros, repeated characters, or a guessed ID.",
  ].join("\n")
}

function renderMarkdownMermaidCard(input: {
  title?: string
  diagramType?: string
  body: ReactNode
  actions?: ReactNode | null
  containerRef?: RefObject<HTMLDivElement>
}): ReactNode {
  return (
    <div ref={input.containerRef} className="my-4">
      <MermaidToolCard
        title={input.title ?? MARKDOWN_MERMAID_DEFAULT_TITLE}
        diagramType={input.diagramType ?? MARKDOWN_MERMAID_DEFAULT_TYPE}
        hideStatus
        actions={input.actions}
        contentClassName={MARKDOWN_MERMAID_VIEWPORT_HEIGHT_CLASS}
      >
        {input.body}
      </MermaidToolCard>
    </div>
  )
}

export function MarkdownMermaidSegment(props: {
  cacheKey: string
  context: MarkdownMermaidContext
  isStreaming: boolean
  raw: string
  source: string
  segmentIndex: number
}) {
  const sourceIdentity = `${props.cacheKey}\u0000${props.source}`
  const readySourceIdentityRef = useRef<string | undefined>(
    props.isStreaming ? undefined : sourceIdentity,
  )
  const [ready, setReady] = useState(!props.isStreaming)
  const [artifact, setArtifact] = useState<MermaidArtifactRecord | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [renderFailure, setRenderFailure] = useState<MermaidRenderFailure | undefined>(undefined)
  const [repairState, setRepairState] = useState<MermaidRepairState>({ status: "idle" })
  const [fixRequested, setFixRequested] = useState(false)
  const activation = useInlineAssetActivation()
  const startedRepairRef = useRef<string | undefined>(undefined)
  const requestedSourceByArtifactIDRef = useRef(new Map<string, string>())
  const artifactID = artifact?.artifactID
  const sessionMessages = useChatStore((store) => {
    const directoryState = store.directories[props.context.directory]
    if (!directoryState) {
      return []
    }
    return (
      directoryState.messagesBySessionID?.[props.context.sessionID] ??
      (directoryState.sessionID === props.context.sessionID ? directoryState.messages : [])
    )
  })

  useEffect(() => {
    if (
      !shouldDelayMarkdownMermaidSegment({
        isStreaming: props.isStreaming,
        readySourceIdentity: readySourceIdentityRef.current,
        sourceIdentity,
      })
    ) {
      readySourceIdentityRef.current = sourceIdentity
      setReady(true)
      return
    }
    setReady(false)
    const timeout = window.setTimeout(() => {
      readySourceIdentityRef.current = sourceIdentity
      setReady(true)
    }, MERMAID_STREAM_STABLE_DELAY_MS)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [props.isStreaming, sourceIdentity])

  useEffect(() => {
    if (!ready || !activation.active) {
      return
    }
    let cancelled = false
    setError(undefined)
    if (
      shouldClearMarkdownMermaidArtifact({
        requestedSource: artifactID
          ? requestedSourceByArtifactIDRef.current.get(artifactID)
          : undefined,
        nextSource: props.source,
      })
    ) {
      setArtifact(undefined)
      setRepairState({ status: "idle" })
      setRenderFailure(undefined)
      setFixRequested(false)
      startedRepairRef.current = undefined
    }
    void createInlineMermaidArtifact({
      directory: props.context.directory,
      sessionID: props.context.sessionID,
      messageID: props.context.messageID,
      partID: props.context.partID,
      segmentIndex: props.segmentIndex,
      source: props.source,
    })
      .then((nextArtifact) => {
        if (cancelled) return
        requestedSourceByArtifactIDRef.current.set(nextArtifact.artifactID, props.source)
        setArtifact(nextArtifact)
        setRepairState(repairStateFromArtifact(nextArtifact))
      })
      .catch((artifactError) => {
        if (cancelled) return
        setError(artifactError instanceof Error ? artifactError.message : String(artifactError))
      })
    return () => {
      cancelled = true
    }
  }, [
    props.context.directory,
    props.context.messageID,
    props.context.partID,
    props.context.sessionID,
    props.segmentIndex,
    props.source,
    ready,
    activation.active,
    artifactID,
  ])

  useEffect(() => {
    if (repairState.status !== "running" || !artifact) {
      return
    }
    let cancelled = false
    const interval = window.setInterval(() => {
      void readMermaidAutoRepairStatus({
        directory: props.context.directory,
        repairRequestID: repairState.repairRequestID,
        sessionID: artifact.origin.sessionID,
      })
        .then((status) => {
          if (cancelled || status.status === "running") return
          setRepairState(
            status.status === "succeeded" && status.replacementArtifactID
              ? { status: "succeeded", replacementArtifactID: status.replacementArtifactID }
              : {
                  status: "exhausted",
                  lastErrorMessage:
                    status.lastErrorMessage ??
                    language.t("chatTools.mermaidDiagram.renderErrorDefault"),
                },
          )
        })
        .catch((pollError) => {
          if (cancelled) return
          setRepairState({
            status: "exhausted",
            lastErrorMessage: pollError instanceof Error ? pollError.message : String(pollError),
          })
        })
    }, MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [artifact, props.context.directory, repairState])

  const handleRenderFailure = useCallback(
    (failure: MermaidRenderFailure) => {
      setRenderFailure(failure)
      if (!shouldStartMarkdownMermaidAutoRepair({ artifact, renderFailure: failure })) {
        setRepairState((current) => (artifact ? repairStateFromArtifact(artifact) : current))
        return
      }
      if (!artifact || !failure.renderKey) {
        return
      }
      const repairKey = `${artifact.artifactID}:${failure.renderKey}`
      if (startedRepairRef.current === repairKey) {
        return
      }
      startedRepairRef.current = repairKey
      void startMermaidAutoRepair({
        artifactID: artifact.artifactID,
        directory: props.context.directory,
        failedRenderKey: failure.renderKey,
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
              response.lastErrorMessage ??
              language.t("chatTools.mermaidDiagram.renderErrorDefault"),
          })
        })
        .catch((repairError) => {
          setRepairState({
            status: "exhausted",
            lastErrorMessage:
              repairError instanceof Error ? repairError.message : String(repairError),
          })
        })
    },
    [artifact, props.context.directory],
  )

  const supersedingArtifactID = useMemo(
    () =>
      artifact ? findSupersedingMermaidArtifactID(sessionMessages, artifact.artifactID) : undefined,
    [artifact, sessionMessages],
  )

  const canRequestFix =
    !!artifact &&
    !!renderFailure &&
    repairState.status !== "running" &&
    repairState.status !== "succeeded" &&
    !supersedingArtifactID &&
    (repairState.status === "exhausted" || repairState.status === "ineligible")

  const handleRequestFix = useCallback(() => {
    if (!artifact || fixRequested) return
    setFixRequested(true)
    const prompt = formatFixPrompt({
      artifactID: artifact.artifactID,
      alt: artifact.alt,
      errorMessage:
        renderFailure?.message ?? language.t("chatTools.mermaidDiagram.renderErrorDefault"),
      failedRenderKey: renderFailure?.renderKey,
      source: artifact.source,
    })
    void sendPrompt(
      props.context.directory,
      prompt,
      resolveAssistantMessage(props.context.directory, {
        messageID: props.context.messageID,
        sessionID: props.context.sessionID,
      }),
    ).catch(() => {
      setFixRequested(false)
    })
  }, [
    artifact,
    fixRequested,
    props.context.directory,
    props.context.messageID,
    props.context.sessionID,
    renderFailure,
  ])

  const errorMeta = useMemo(() => {
    if (repairState.status === "running") {
      return language.t("chatTools.mermaidDiagram.repairing")
    }
    if (repairState.status === "exhausted") {
      return repairState.lastErrorMessage
    }
    return undefined
  }, [repairState])

  if (!ready || !activation.active) {
    return renderMarkdownMermaidCard({
      title: MARKDOWN_MERMAID_DEFAULT_TITLE,
      diagramType: MARKDOWN_MERMAID_DEFAULT_TYPE,
      containerRef: activation.ref,
      body: (
        <div
          data-component="markdown-mermaid-loading"
          role="status"
          aria-live="polite"
          className="w-full min-w-[300px] p-4 sm:w-[450px]"
        >
          <div className="flex items-center gap-2 text-sm text-text-weak">
            <span className="size-2 rounded-full bg-text-weak/60 animate-pulse" />
            <span>{language.t("chatTools.mermaidDiagram.rendering")}</span>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-surface-weak/70" />
            <div className="h-24 w-full animate-pulse rounded-md bg-surface-weak/55" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface-weak/70" />
          </div>
        </div>
      ),
    })
  }

  if (error) {
    return (
      <div className="my-4 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
        {error}
      </div>
    )
  }

  if (!artifact) {
    return renderMarkdownMermaidCard({
      title: MARKDOWN_MERMAID_DEFAULT_TITLE,
      diagramType: MARKDOWN_MERMAID_DEFAULT_TYPE,
      containerRef: activation.ref,
      body: (
        <div className="flex h-full items-center justify-center text-sm text-text-weak">
          {language.t("chatTools.rehydratingMermaid")}
        </div>
      ),
    })
  }

  if (repairState.status === "succeeded" || supersedingArtifactID) {
    return (
      <div className="my-4 rounded-md border border-border-base/40 bg-surface-weak/10 p-3 text-sm text-text-weak">
        {language.t("chatTools.mermaidDiagram.replaced")}
      </div>
    )
  }

  return (
    <MermaidDiagram
      directory={props.context.directory}
      source={artifact.source}
      artifactID={artifact.artifactID}
      alt={artifact.alt}
      renderPriority={0}
      showRawSourceOnError
      errorMeta={errorMeta}
      onRenderFailure={handleRenderFailure}
      onRequestFix={canRequestFix ? () => handleRequestFix() : undefined}
      fixDisabled={fixRequested || repairState.status === "running"}
      renderWrapper={(diagramElement, actions) =>
        renderMarkdownMermaidCard({
          title: artifact.alt,
          diagramType: artifact.diagramType,
          containerRef: activation.ref,
          body: <div className="h-full w-full">{diagramElement}</div>,
          actions,
        })
      }
    />
  )
}

export type { MarkdownMermaidContext }
