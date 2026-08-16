import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { parseToolState } from "@/components/chat/tools/parse-tool-state"
import { getToolInfoForPart } from "@/components/chat/tools/tool-info"
import { Media, MediaThumbnail, MultiViewShell } from "@/components/media"
import { language } from "@/context/language"
import { readNonEmptyString } from "@/components/chat/tools/types"
import { unwrapError } from "@/components/chat/utils/error"
import { sendPrompt } from "@/state/chat-actions"
import { getTranscriptMessages, useTranscriptSessionMessages } from "@/state/transcript-repository"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import {
  metadataWithInlinePresentation,
  objectBenchTarget,
  readInlinePresentation,
  type BuddyPresentationDescriptor,
} from "@/components/chat/tools/render/buddy-object-result"
import { useHydratedInlinePresentation } from "@/components/chat/tools/render/use-hydrated-inline-presentation"
import type { ToolPartProps } from "@/components/chat/tools/registry"
import type { AssistantMessageInfo, MessagePart, MessageWithParts } from "@/state/chat-types"
import {
  readMermaidObject,
  readMermaidAutoRepairStatus,
  startMermaidAutoRepair,
  type MermaidObjectRecord,
  type MermaidRepairStartResponse,
} from "@/components/media/renderers/mermaid/lib/persisted-renders"
import { hashMermaidSource } from "@/components/media/renderers/mermaid/lib/render"
import { findSupersedingMermaidRevisionID } from "@/components/media/renderers/mermaid/lib/supersession"
import { createMermaidLoadingState } from "@/components/media/renderers/mermaid/loading-state"

type RenderMermaidToolOutput = {
  objectID: string
  revisionID: string | null
  source: string
  sourceHash: string
  diagramType: string
  alt: string
  caption?: string
}

type RenderMermaidToolReference = Omit<RenderMermaidToolOutput, "source"> & {
  source?: string
  viewID: string
}

type RenderMermaidToolSources = {
  objectSource?: string
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

function mermaidOriginSessionID(origin: MermaidObjectRecord["origin"]): string | undefined {
  if (origin.kind === "tool" || origin.kind === "markdown") {
    return origin.sessionID
  }
  return undefined
}

export function shouldStartMermaidAutoRepair(input: {
  object: Pick<MermaidObjectRecord, "autoRepair" | "origin"> | undefined
  directory?: string
  renderFailure?: MermaidRenderFailure
}): boolean {
  return (
    !!input.directory &&
    !!input.object &&
    !!input.renderFailure?.renderKey &&
    input.object.origin.kind === "tool" &&
    input.object.autoRepair.status === "eligible"
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
      replacementRevisionID: string
    }
  | {
      status: "exhausted"
      lastErrorMessage: string
    }
  | {
      status: "ineligible"
      lastErrorMessage: string
    }

const MERMAID_OBJECT_CACHE_LIMIT = 200
const MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS = 1_000
const mermaidObjectCache = new Map<string, MermaidObjectRecord>()
const mermaidObjectRequests = new Map<string, Promise<MermaidObjectRecord>>()

function touchMermaidObjectCache(key: string, value: MermaidObjectRecord): void {
  mermaidObjectCache.delete(key)
  mermaidObjectCache.set(key, value)

  if (mermaidObjectCache.size <= MERMAID_OBJECT_CACHE_LIMIT) {
    return
  }

  const oldest = mermaidObjectCache.keys().next().value
  if (oldest !== undefined) {
    mermaidObjectCache.delete(oldest)
  }
}

function parseRenderMermaidReference(
  state: ToolPartProps["state"],
): RenderMermaidToolReference | undefined {
  const presentation = readInlinePresentation(state.metadata, "mermaid")
  if (presentation?.data?.renderer !== "mermaid") return undefined
  const source = presentation.data.source
  const diagramType =
    inferMermaidDiagramTypeFromSource(source) ?? language.t("chatTools.defaultMermaidType")
  const caption = presentation.data.caption

  return Object.assign(
    {
      objectID: presentation.ref.objectID,
      revisionID: presentation.ref.revisionID,
      source,
      sourceHash: hashMermaidSource(source),
      diagramType,
      alt: presentation.data.alt,
      viewID: presentation.viewID,
    },
    caption ? { caption } : undefined,
  )
}

export function parseRenderMermaidObjectOutput(
  state: ToolPartProps["state"],
): RenderMermaidToolOutput | undefined {
  const parsed = parseRenderMermaidReference(state)
  if (!parsed?.source) {
    return undefined
  }

  return Object.assign(
    {
      objectID: parsed.objectID,
      revisionID: parsed.revisionID,
      source: parsed.source,
      sourceHash: parsed.sourceHash,
      diagramType: parsed.diagramType,
      alt: parsed.alt,
    },
    parsed.caption ? { caption: parsed.caption } : undefined,
  )
}

export function parseRenderMermaidSources(state: ToolPartProps["state"]): RenderMermaidToolSources {
  const parsed = parseRenderMermaidReference(state)
  return {
    objectSource: parsed?.source,
    inputSource: readNonEmptyString(state.input.source),
  }
}

async function fetchMermaidObject(
  directory: string,
  objectID: string,
  revisionID: string | null,
): Promise<MermaidObjectRecord> {
  const key = `${directory}::${objectID}::${revisionID ?? "current"}`
  const cached = mermaidObjectCache.get(key)
  if (cached) {
    touchMermaidObjectCache(key, cached)
    return cached
  }

  const existing = mermaidObjectRequests.get(key)
  if (existing) {
    return existing
  }

  const request = readMermaidObject(directory, objectID, revisionID)
    .then((object) => {
      touchMermaidObjectCache(key, object)
      return object
    })
    .finally(() => {
      mermaidObjectRequests.delete(key)
    })

  mermaidObjectRequests.set(key, request)
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
  alt: string
  errorMessage: string
  failedRenderKey?: string
  objectID: string
  source: string
}): string {
  return [
    `The mermaid diagram (alt: "${input.alt}") failed to render in the browser.`,
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
  return getTranscriptMessages(directory, sessionID)
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

function RenderMermaidToolCard({ part, state, info, directory }: ToolPartProps) {
  const openBenchRoute = useOpenBench()
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const showOutput = output.trim().length > 0
  const running = state.status === "pending" || state.status === "running"
  const pendingAlt =
    readNonEmptyString(state.input.alt) ??
    info.subtitle ??
    language.t("chatTools.defaultMermaidAlt")
  const parsed = state.status === "completed" ? parseRenderMermaidReference(state) : undefined
  const parsedObjectID = parsed?.objectID
  const parsedRevisionID = parsed?.revisionID ?? null

  const [rehydrated, setRehydrated] = useState<MermaidObjectRecord | undefined>(undefined)
  const [rehydrationError, setRehydrationError] = useState<string | undefined>(undefined)
  const [fixRequested, setFixRequested] = useState(false)
  const [repairState, setRepairState] = useState<MermaidRepairState>({
    status: "idle",
  })
  const [renderFailure, setRenderFailure] = useState<MermaidRenderFailure | undefined>(undefined)
  const startedRepairRef = useRef<string | undefined>(undefined)
  const objectSessionID = rehydrated
    ? (mermaidOriginSessionID(rehydrated.origin) ?? part.sessionID)
    : part.sessionID
  const sessionMessages = useTranscriptSessionMessages(directory, objectSessionID)

  useEffect(() => {
    setRehydrated(undefined)
    setRehydrationError(undefined)

    if (state.status !== "completed") {
      return
    }
    if (!parsedObjectID) {
      return
    }
    if (!directory) {
      setRehydrationError(language.t("chatTools.mermaidNoWorkspaceDirectory"))
      return
    }

    let cancelled = false
    void fetchMermaidObject(directory, parsedObjectID, parsedRevisionID)
      .then((object) => {
        if (cancelled) return
        setRehydrated(object)
      })
      .catch((error) => {
        if (cancelled) return
        setRehydrationError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
    }
  }, [directory, parsedObjectID, parsedRevisionID, state.status])

  const object = rehydrated

  useEffect(() => {
    setRepairState(repairStateFromObject(object))
  }, [object])

  useEffect(() => {
    if (!shouldStartMermaidAutoRepair({ object, directory, renderFailure })) {
      return
    }
    const renderKey = renderFailure?.renderKey
    if (!directory || !object || !renderKey) {
      return
    }
    if (object.origin.kind !== "tool" || object.autoRepair.status !== "eligible") {
      return
    }

    const repairKey = `${object.objectID}:${object.revisionID}:${renderKey}`
    if (startedRepairRef.current === repairKey) {
      return
    }
    startedRepairRef.current = repairKey

    void startMermaidAutoRepair({
      directory,
      failedRenderKey: renderKey,
      objectID: object.objectID,
      sessionID: object.origin.sessionID,
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
  }, [object, directory, renderFailure])

  useEffect(() => {
    if (repairState.status !== "running" || !directory || !object) {
      return
    }
    const sessionID = mermaidOriginSessionID(object.origin)
    if (!sessionID) {
      return
    }

    let cancelled = false
    const interval = window.setInterval(() => {
      void readMermaidAutoRepairStatus({
        directory,
        repairRequestID: repairState.repairRequestID,
        sessionID,
      })
        .then((status) => {
          if (cancelled) {
            return
          }
          if (status.status === "running") {
            return
          }
          setRepairState(
            status.status === "succeeded" && status.replacementRevisionID
              ? {
                  status: "succeeded",
                  replacementRevisionID: status.replacementRevisionID,
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
  }, [object, directory, repairState])

  const source = parsed?.source ?? object?.source
  const alt = parsed?.alt ?? object?.alt ?? pendingAlt
  const currentObjectID = parsed?.objectID ?? object?.objectID
  const currentRevisionID = parsed?.revisionID ?? object?.revisionID ?? null
  const supersedingRevisionID = useMemo(() => {
    if (!currentObjectID) {
      return undefined
    }
    return findSupersedingMermaidRevisionID(sessionMessages, currentObjectID, currentRevisionID)
  }, [currentObjectID, currentRevisionID, sessionMessages])

  const handleRenderFailure = useCallback((failure: MermaidRenderFailure) => {
    setRenderFailure(failure)
  }, [])

  const handleRequestFix = useCallback(() => {
    if (!directory || fixRequested || !source || !alt) return
    const objectID = parsed?.objectID ?? object?.objectID
    if (!objectID) return
    setFixRequested(true)
    const feedback = formatMermaidFixFeedback({
      alt,
      errorMessage:
        renderFailure?.message ?? language.t("chatTools.mermaidDiagram.renderErrorDefault"),
      failedRenderKey: renderFailure?.renderKey,
      objectID,
      source,
    })
    void sendPrompt(directory, feedback, resolveMermaidFixPromptTarget(directory, part)).catch(
      () => {
        setFixRequested(false)
      },
    )
  }, [
    alt,
    directory,
    fixRequested,
    object?.objectID,
    parsed?.objectID,
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
    !supersedingRevisionID &&
    (repairState.status === "exhausted" || repairState.status === "ineligible")

  const errorMeta =
    repairState.status === "running"
      ? language.t("chatTools.mermaidDiagram.repairing")
      : repairState.status === "exhausted"
        ? repairState.lastErrorMessage
        : undefined

  if (running) {
    return (
      <Media
        item={{
          kind: "mermaid",
          state: createMermaidLoadingState(),
        }}
        className="h-[30rem]"
      />
    )
  }

  if (!parsed) {
    return (
      <Media
        item={{
          kind: "mermaid",
          state:
            state.status === "error"
              ? {
                  status: "error",
                  message: info.title,
                  detail: showOutput ? output : undefined,
                }
              : {
                  status: "empty",
                  message: info.title,
                },
        }}
        className="h-[30rem]"
      />
    )
  }

  if (repairState.status === "succeeded" || supersedingRevisionID) {
    return (
      <Media
        item={{
          kind: "mermaid",
          state: {
            status: "empty",
            message: language.t("chatTools.mermaidDiagram.replaced"),
          },
        }}
        className="h-[30rem]"
      />
    )
  }

  if (!source) {
    return (
      <Media
        item={{
          kind: "mermaid",
          state: {
            status: "error",
            message: language.t("chatTools.mermaidSourceUnavailable"),
            detail: rehydrationError,
          },
        }}
        className="h-[30rem]"
      />
    )
  }

  return (
    <Media
      item={{
        kind: "mermaid",
        state: {
          status: "ready",
          data: {
            directory,
            source,
            alt,
            objectID: parsed.objectID,
            revisionID: parsed.revisionID,
            renderPriority: 0,
            errorDetail: errorMeta,
            onRenderFailure: handleRenderFailure,
            onRequestFix: canRequestFix ? () => handleRequestFix() : undefined,
            fixDisabled: fixRequested || repairState.status === "running",
            onFullscreenOpen: directory
              ? () => {
                  void openBenchRoute({
                    directory,
                    target: objectBenchTarget({
                      kind: "mermaid",
                      objectID: parsed.objectID,
                      revisionID: parsed.revisionID,
                      viewID: parsed.viewID,
                    }),
                    mode: BENCH_MODE_REQUEST_POLICY,
                    autoOpen: null,
                  })
                }
              : undefined,
          },
        },
      }}
      className="h-[30rem]"
    />
  )
}

export function renderRenderMermaidTool(props: ToolPartProps) {
  const presentation =
    props.state.status === "completed"
      ? readInlinePresentation(props.state.metadata, "mermaid")
      : undefined
  if (presentation) {
    return <HydratedMermaidToolCard toolProps={props} presentation={presentation} />
  }
  return <RenderMermaidToolCard {...props} />
}

function HydratedMermaidToolCard(props: {
  toolProps: ToolPartProps
  presentation: BuddyPresentationDescriptor
}) {
  const hydrated = useHydratedInlinePresentation({
    directory: props.toolProps.directory,
    presentation: props.presentation,
  })
  const state = {
    ...props.toolProps.state,
    metadata: metadataWithInlinePresentation(props.toolProps.state.metadata, hydrated.presentation),
  }
  return <RenderMermaidToolCard {...props.toolProps} state={state} />
}

function isRenderableGroupedMermaidPart(part: MessagePart): boolean {
  const state = parseToolState(part)
  if (state.status !== "completed") {
    return false
  }
  const parsed = parseRenderMermaidReference(state)
  return !!(parsed?.source ?? readNonEmptyString(state.input.source))
}

export function resolveGroupedMermaidDefaultIndex(parts: MessagePart[]): number {
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index]
    if (part && isRenderableGroupedMermaidPart(part)) {
      return index
    }
  }
  return 0
}

export function GroupedMermaidToolCard({
  parts,
  directory,
}: {
  parts: MessagePart[]
  directory?: string
}) {
  const items = parts.map((part) => {
    const state = parseToolState(part)
    const parsed = state.status === "completed" ? parseRenderMermaidReference(state) : undefined
    const source =
      state.status === "completed" ? (parsed?.source ?? readNonEmptyString(state.input.source)) : ""
    const info = getToolInfoForPart(part, state) ?? { title: state.title ?? "Diagram" }
    const canRenderThumbnail = !!source

    return {
      key: part.id,
      thumbnail: (
        <div className="h-full w-full pointer-events-none flex items-center justify-center p-1 bg-background-base rounded-md overflow-hidden">
          {canRenderThumbnail ? (
            <MediaThumbnail
              item={{
                kind: "mermaid",
                state: {
                  status: "ready",
                  data: {
                    directory,
                    source,
                    alt: info.title,
                    objectID: parsed?.objectID,
                    revisionID: parsed?.revisionID,
                  },
                },
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-medium text-text-weak">
              {state.status === "error"
                ? language.t("chatTools.status.error")
                : language.t("chatTools.status.pending")}
            </div>
          )}
        </div>
      ),
      children: (
        <RenderMermaidToolCard
          part={part}
          state={state}
          info={info}
          tool="render_mermaid"
          directory={directory}
        />
      ),
    }
  })

  return (
    <MultiViewShell
      items={items}
      contentClassName="bg-transparent rounded-none border-none p-0 h-auto w-full shadow-none"
      thumbnailSize="lg"
      defaultIndex={resolveGroupedMermaidDefaultIndex(parts)}
    />
  )
}
