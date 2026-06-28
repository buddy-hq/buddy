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
import { getTranscriptMessages, useTranscriptSessionMessages } from "@/state/transcript-repository"
import { MermaidDiagram } from "@/components/chat/tools/render/mermaid/mermaid-diagram"
import { MermaidToolCard } from "@/components/chat/tools/render/mermaid/mermaid-tool-card"
import {
  useInlineAssetActivation,
  useInlineAssetLifecycleReporter,
} from "@/components/chat/inline-asset-boundary"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import {
  createInlineMermaidObject,
  readMermaidAutoRepairStatus,
  startMermaidAutoRepair,
  type MermaidObjectRecord,
  type MermaidRepairStartResponse,
} from "@/components/chat/tools/render/mermaid/lib/persisted-renders"
import { findSupersedingMermaidRevisionID } from "@/components/chat/tools/render/mermaid/lib/supersession"
import { objectBenchTarget } from "@/components/chat/tools/render/buddy-object-result"

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
  | { status: "succeeded"; replacementRevisionID: string }
  | { status: "exhausted"; lastErrorMessage: string }
  | { status: "ineligible"; lastErrorMessage: string }

type MermaidFixPromptTarget = {
  agent: string
  model: {
    providerID: string
    modelID: string
  }
}

function mermaidOriginSessionID(origin: MermaidObjectRecord["origin"]): string | undefined {
  if (origin.kind === "tool" || origin.kind === "markdown") {
    return origin.sessionID
  }
  return undefined
}

export function shouldDelayMarkdownMermaidSegment(input: {
  isStreaming: boolean
  readySourceIdentity?: string
  sourceIdentity: string
}): boolean {
  return input.isStreaming && input.readySourceIdentity !== input.sourceIdentity
}

export function shouldClearMarkdownMermaidObject(input: {
  requestedSource?: string
  nextSource: string
}): boolean {
  return input.requestedSource !== undefined && input.requestedSource !== input.nextSource
}

export function shouldStartMarkdownMermaidAutoRepair(input: {
  object: MermaidObjectRecord | undefined
  renderFailure?: MermaidRenderFailure
}): boolean {
  return (
    !!input.object &&
    !!input.renderFailure?.renderKey &&
    input.object.autoRepair.status === "eligible"
  )
}

function resolveAssistantMessage(
  directory: string,
  input: { messageID: string; sessionID: string },
): MermaidFixPromptTarget | undefined {
  const messages = getTranscriptMessages(directory, input.sessionID)
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

function repairStateFromObject(object: MermaidObjectRecord | undefined): MermaidRepairState {
  if (!object) {
    return { status: "idle" }
  }
  switch (object.autoRepair.status) {
    case "running":
      return {
        status: "running",
        repairRequestID: object.autoRepair.repairRequestID,
      }
    case "succeeded":
      return {
        status: "succeeded",
        replacementRevisionID: object.autoRepair.replacementRevisionID,
      }
    case "exhausted":
      return {
        status: "exhausted",
        lastErrorMessage: object.autoRepair.lastErrorMessage,
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
  alt: string
  errorMessage: string
  failedRenderKey?: string
  objectID: string
  source: string
}): string {
  return [
    `The Mermaid diagram (alt: "${input.alt}") failed to render in the browser.`,
    "",
    `Object ID: ${input.objectID}`,
    ...(input.failedRenderKey ? [`Failed render key: ${input.failedRenderKey}`, ""] : []),
    `Browser render error: ${input.errorMessage}`,
    "",
    "Failed source:",
    "```mermaid",
    input.source,
    "```",
    "",
    `Please fix the Mermaid source and call render_mermaid exactly once with repairOfObjectID: "${input.objectID}".`,
    "Copy the object ID verbatim; do not replace it with a placeholder, zeros, repeated characters, or a guessed ID.",
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
  const [object, setObject] = useState<MermaidObjectRecord | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [renderFailure, setRenderFailure] = useState<MermaidRenderFailure | undefined>(undefined)
  const [repairState, setRepairState] = useState<MermaidRepairState>({ status: "idle" })
  const [fixRequested, setFixRequested] = useState(false)
  const activation = useInlineAssetActivation()
  useInlineAssetLifecycleReporter({
    ref: activation.ref,
    active: activation.active && ready,
  })
  const openBenchRoute = useOpenBench()
  const startedRepairRef = useRef<string | undefined>(undefined)
  const requestedSourceByObjectIDRef = useRef(new Map<string, string>())
  const objectID = object?.objectID
  const sessionMessages = useTranscriptSessionMessages(
    props.context.directory,
    props.context.sessionID,
  )

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
      shouldClearMarkdownMermaidObject({
        requestedSource: objectID ? requestedSourceByObjectIDRef.current.get(objectID) : undefined,
        nextSource: props.source,
      })
    ) {
      setObject(undefined)
      setRepairState({ status: "idle" })
      setRenderFailure(undefined)
      setFixRequested(false)
      startedRepairRef.current = undefined
    }
    void createInlineMermaidObject({
      directory: props.context.directory,
      sessionID: props.context.sessionID,
      messageID: props.context.messageID,
      partID: props.context.partID,
      segmentIndex: props.segmentIndex,
      source: props.source,
    })
      .then((nextObject) => {
        if (cancelled) return
        requestedSourceByObjectIDRef.current.set(nextObject.objectID, props.source)
        setObject(nextObject)
        setRepairState(repairStateFromObject(nextObject))
      })
      .catch((objectError) => {
        if (cancelled) return
        setError(objectError instanceof Error ? objectError.message : String(objectError))
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
    objectID,
  ])

  useEffect(() => {
    if (repairState.status !== "running" || !object) {
      return
    }
    const sessionID = mermaidOriginSessionID(object.origin)
    if (!sessionID) {
      return
    }
    let cancelled = false
    const interval = window.setInterval(() => {
      void readMermaidAutoRepairStatus({
        directory: props.context.directory,
        repairRequestID: repairState.repairRequestID,
        sessionID,
      })
        .then((status) => {
          if (cancelled || status.status === "running") return
          setRepairState(
            status.status === "succeeded" && status.replacementRevisionID
              ? { status: "succeeded", replacementRevisionID: status.replacementRevisionID }
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
  }, [object, props.context.directory, repairState])

  const handleRenderFailure = useCallback(
    (failure: MermaidRenderFailure) => {
      setRenderFailure(failure)
      if (!shouldStartMarkdownMermaidAutoRepair({ object, renderFailure: failure })) {
        setRepairState((current) => (object ? repairStateFromObject(object) : current))
        return
      }
      if (!object || !failure.renderKey) {
        return
      }
      const sessionID = mermaidOriginSessionID(object.origin)
      if (!sessionID) {
        return
      }
      const repairKey = `${object.objectID}:${object.revisionID}:${failure.renderKey}`
      if (startedRepairRef.current === repairKey) {
        return
      }
      startedRepairRef.current = repairKey
      void startMermaidAutoRepair({
        directory: props.context.directory,
        failedRenderKey: failure.renderKey,
        objectID: object.objectID,
        sessionID,
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
    [object, props.context.directory],
  )

  const supersedingRevisionID = useMemo(
    () =>
      object
        ? findSupersedingMermaidRevisionID(sessionMessages, object.objectID, object.revisionID)
        : undefined,
    [object, sessionMessages],
  )

  const canRequestFix =
    !!object &&
    !!renderFailure &&
    repairState.status !== "running" &&
    repairState.status !== "succeeded" &&
    !supersedingRevisionID &&
    (repairState.status === "exhausted" || repairState.status === "ineligible")

  const handleRequestFix = useCallback(() => {
    if (!object || fixRequested) return
    setFixRequested(true)
    const prompt = formatFixPrompt({
      alt: object.alt,
      errorMessage:
        renderFailure?.message ?? language.t("chatTools.mermaidDiagram.renderErrorDefault"),
      failedRenderKey: renderFailure?.renderKey,
      objectID: object.objectID,
      source: object.source,
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
    fixRequested,
    object,
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

  if (!object) {
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

  if (repairState.status === "succeeded" || supersedingRevisionID) {
    return (
      <div className="my-4 rounded-md border border-border-base/40 bg-surface-weak/10 p-3 text-sm text-text-weak">
        {language.t("chatTools.mermaidDiagram.replaced")}
      </div>
    )
  }

  return (
    <MermaidDiagram
      directory={props.context.directory}
      source={object.source}
      objectID={object.objectID}
      revisionID={object.revisionID}
      alt={object.alt}
      renderPriority={0}
      showRawSourceOnError
      errorMeta={errorMeta}
      onRenderFailure={handleRenderFailure}
      onFullscreenOpen={() => {
        void openBenchRoute({
          directory: props.context.directory,
          target: objectBenchTarget({
            kind: "mermaid",
            objectID: object.objectID,
            revisionID: object.revisionID,
            viewID: "rendered",
          }),
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: null,
        })
      }}
      onRequestFix={canRequestFix ? () => handleRequestFix() : undefined}
      fixDisabled={fixRequested || repairState.status === "running"}
      renderWrapper={(diagramElement, actions) =>
        renderMarkdownMermaidCard({
          title: object.alt,
          diagramType: object.diagramType,
          containerRef: activation.ref,
          body: <div className="h-full w-full">{diagramElement}</div>,
          actions,
        })
      }
    />
  )
}

export type { MarkdownMermaidContext }
