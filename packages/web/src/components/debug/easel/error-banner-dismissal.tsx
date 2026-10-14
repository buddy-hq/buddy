import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@buddy/ui/components/ui/alert"
import { Badge } from "@buddy/ui/components/ui/badge"
import { Button } from "@buddy/ui/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@buddy/ui/components/ui/toggle-group"
import { CheckIcon, ChevronUpIcon, MinusIcon, RotateCcwIcon, TriangleAlertIcon, XIcon } from "@/icons/app-icons"
import {
  AssistantErrorCard,
  createAssistantErrorCardSpec,
  type AssistantErrorActionID,
} from "@/components/chat/assistant-error-card"
import type { AssistantErrorModel } from "@/state/chat-error-model"
import { findCatalogID } from "./select-value"

type ScenarioID = "network" | "quota" | "auth" | "context" | "retry" | "retry-action"
type RecoveryAction = { id: AssistantErrorActionID; label: string }
type TerminalScenario = {
  id: ScenarioID
  label: string
  kind: "transient" | "blocker"
  rule: string
  model: AssistantErrorModel
  recovery: readonly RecoveryAction[]
}
type RetryScenario = {
  id: ScenarioID
  label: string
  kind: "retry"
  rule: string
  requiresAction: boolean
}
type Scenario = TerminalScenario | RetryScenario
type Presentation = "expanded" | "compact"
type RetryPreviewState =
  | { status: "retrying"; attempt: number; seconds: number }
  | { status: "stopped" }

const SCENARIOS: readonly Scenario[] = [
  {
    id: "network",
    label: "Network failure",
    kind: "transient",
    rule: "Dismiss the large card. The failed response and its details remain reachable.",
    model: {
      category: "network",
      disposition: "terminal",
      details: { name: "APIError", message: "Connection reset by the model provider (sample error)." },
    },
    recovery: [{ id: "try-again", label: "Try again" }],
  },
  {
    id: "quota",
    label: "Account limit",
    kind: "blocker",
    rule: "Minimize the card. Keep the account limit, reset information and model choice visible.",
    model: {
      category: "usage-limit",
      disposition: "terminal",
      details: {
        name: "APIError",
        statusCode: 429,
        message: "Account usage limit reached (sample error).",
        providerError: { type: "usage_limit_reached", planType: "plus" },
      },
    },
    recovery: [{ id: "open-settings", label: "Choose model" }],
  },
  {
    id: "auth",
    label: "Sign-in expired",
    kind: "blocker",
    rule: "Minimize the card. Reconnect stays available while this provider is selected.",
    model: {
      category: "auth",
      disposition: "terminal",
      details: { name: "ProviderAuthError", statusCode: 401, message: "Sign-in expired (sample error)." },
    },
    recovery: [{ id: "open-settings", label: "Reconnect OpenAI" }],
  },
  {
    id: "context",
    label: "Context full",
    kind: "blocker",
    rule: "Minimize the card. Keep Compact & continue and New session available.",
    model: {
      category: "context",
      disposition: "terminal",
      details: { name: "ContextOverflowError", message: "Requested 214,300 tokens; limit 200,000 (sample error)." },
    },
    recovery: [
      { id: "compact-and-continue", label: "Compact & continue" },
      { id: "new-session", label: "New session" },
    ],
  },
  {
    id: "retry",
    label: "Still retrying",
    kind: "retry",
    requiresAction: false,
    rule: "Minimize the detail. Retrying, countdown, attempt and Stop remain visible.",
  },
  {
    id: "retry-action",
    label: "Retry needs action",
    kind: "retry",
    requiresAction: true,
    rule: "Minimize the detail. Keep both Stop and the required provider action available.",
  },
]

function PreviewComposer(props: { retrying: boolean }) {
  return (
    <div className="composer-surface composer-grain relative flex flex-col gap-5 p-3">
      <p className="text-sm text-text-weaker">Ask a follow-up…</p>
      <div className="flex items-center justify-between gap-3">
        <Badge variant="outline">OpenAI · sample model</Badge>
        <Button size="sm" variant="secondary" disabled>
          {props.retrying ? "Working in preview" : "Preview composer"}
        </Button>
      </div>
    </div>
  )
}

function RecoveryButtons(props: {
  actions: readonly RecoveryAction[]
  onAction: (action: AssistantErrorActionID) => void
}) {
  return props.actions.map((action) => (
    <Button key={action.id} size="xs" variant="outline" onClick={() => props.onAction(action.id)}>
      {action.label}
    </Button>
  ))
}

function TerminalPreview(props: { scenario: TerminalScenario; episode: number }) {
  const [presentation, setPresentation] = useState<Presentation | "recovered">("expanded")
  const [event, setEvent] = useState("A new sample failure is visible.")
  const [failureNumber, setFailureNumber] = useState(props.episode)
  const baseSpec = createAssistantErrorCardSpec(props.scenario.model, "OpenAI")
  // A fixed sample reset avoids implying that this demo reads account usage.
  const spec = props.scenario.id === "quota"
    ? { ...baseSpec, detail: "Sample reset: tomorrow at 9:00 AM. Choose another provider or wait for the reset." }
    : baseSpec

  function handleAction(action: AssistantErrorActionID) {
    if (action === "dismiss") {
      setPresentation("compact")
      setEvent("Card dismissed. The sample message error is still stored.")
      return
    }
    if (action === "try-again") {
      setFailureNumber((current) => current + 1)
      setPresentation("expanded")
      setEvent("Preview retry failed again. The new failure reopens the card.")
      return
    }
    const recovery = props.scenario.recovery.find((candidate) => candidate.id === action)
    setEvent(`${recovery?.label ?? "Stop"} pressed in preview. The sample failure stays until recovery is confirmed.`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-xs text-text-weaker">
        <span>Failed response · sample {failureNumber}</span>
        <span>{presentation === "expanded" ? "Full card" : presentation === "recovered" ? "Recovered" : props.scenario.kind === "blocker" ? "Minimized" : "Dismissed"}</span>
      </div>
      {presentation === "recovered" ? (
        <Alert role="status">
          <CheckIcon aria-hidden />
          <AlertTitle>Recovery confirmed</AlertTitle>
          <AlertDescription>The sample blocker has cleared. Start a new failure to show the notice again.</AlertDescription>
        </Alert>
      ) : presentation === "expanded" ? (
        <div className="relative">
          <AssistantErrorCard key={failureNumber} spec={spec} onAction={handleAction} />
          <Button
            size="icon-xs"
            variant="ghost"
            className="absolute right-2 top-2 z-10"
            aria-label={props.scenario.kind === "blocker" ? "Minimize error notice" : "Dismiss error notice"}
            title={props.scenario.kind === "blocker" ? "Minimize" : "Dismiss"}
            onClick={() => {
              setPresentation("compact")
              setEvent(props.scenario.kind === "blocker"
                ? "Card minimized. The recovery action remains visible."
                : "Card dismissed. The sample message error and details remain available.")
            }}
          >
            {props.scenario.kind === "blocker" ? <MinusIcon /> : <XIcon />}
          </Button>
          {props.scenario.id === "quota" ? (
            <div className="mt-2 flex justify-end">
              <RecoveryButtons actions={props.scenario.recovery} onAction={handleAction} />
            </div>
          ) : null}
        </div>
      ) : (
        <Alert role="status">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{props.scenario.kind === "blocker" ? spec.headline : "Response failed"}</span>
              <div className="flex flex-wrap items-center gap-2">
                <RecoveryButtons actions={props.scenario.recovery} onAction={handleAction} />
                <Button size="xs" variant="ghost" onClick={() => setPresentation("expanded")}>
                  Show card
                  <ChevronUpIcon data-icon="inline-end" />
                </Button>
              </div>
            </div>
          </AlertTitle>
          <AlertDescription>
            {props.scenario.id === "quota" ? <p>Sample reset: tomorrow at 9:00 AM.</p> : null}
            <details className="mt-1">
              <summary className="w-fit cursor-pointer rounded text-xs outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base">Error details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs">{spec.schemaName}{"\n"}{spec.raw}</pre>
            </details>
          </AlertDescription>
        </Alert>
      )}
      <PreviewComposer retrying={false} />
      <p role="status" aria-live="polite" className="text-xs text-text-weak">{event}</p>
      <div className="flex justify-end">
        <Button size="xs" variant="ghost" disabled={presentation === "recovered"} onClick={() => {
          setPresentation("recovered")
          setEvent("Successful recovery simulated. This clears the sample blocker, unlike dismissing its card.")
        }}>Simulate successful recovery</Button>
      </div>
    </div>
  )
}

function RetryPreview(props: { scenario: RetryScenario }) {
  const [presentation, setPresentation] = useState<Presentation>("expanded")
  const [retry, setRetry] = useState<RetryPreviewState>({ status: "retrying", attempt: 5, seconds: 8 })
  const [event, setEvent] = useState("The simulated retry loop is running. No request is sent.")

  useEffect(() => {
    if (retry.status !== "retrying") return
    const timer = window.setInterval(() => {
      setRetry((current) => {
        if (current.status !== "retrying") return current
        return current.seconds > 1
          ? { ...current, seconds: current.seconds - 1 }
          : { status: "retrying", attempt: current.attempt + 1, seconds: 8 }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [retry.status])

  return (
    <div className="flex flex-col gap-3">
      {retry.status === "stopped" ? (
        <Alert role="status">
          <CheckIcon aria-hidden />
          <AlertTitle>Stopped</AlertTitle>
          <AlertDescription>The preview countdown stopped. Start a new failure to replay it.</AlertDescription>
        </Alert>
      ) : (
        <Alert role="status">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{props.scenario.requiresAction ? "Account limit · retrying" : "Still trying to reconnect"}</span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={presentation === "expanded" ? "Minimize retry notice" : "Expand retry notice"}
                title={presentation === "expanded" ? "Minimize" : "Expand"}
                onClick={() => {
                  setPresentation((current) => current === "expanded" ? "compact" : "expanded")
                  setEvent("Only the detail changes. The retry loop and Stop remain visible.")
                }}
              >
                {presentation === "expanded" ? <MinusIcon /> : <ChevronUpIcon />}
              </Button>
            </div>
          </AlertTitle>
          <AlertDescription>
            <p className="tabular-nums">Trying again in {retry.seconds}s · attempt {retry.attempt}</p>
            {presentation === "expanded" ? (
              <p className="mt-2">{props.scenario.requiresAction
                ? "Sample provider asks you to enable usage from your available balance."
                : "The provider could not be reached. Buddy is still retrying this response."}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="xs" variant="outline" onClick={() => {
                setRetry({ status: "stopped" })
                setEvent("Stop ended the simulated retry loop. No runtime was contacted.")
              }}>Stop</Button>
              {props.scenario.requiresAction ? (
                <Button size="xs" variant="outline" onClick={() => setEvent("Open provider settings pressed in preview. No settings or external link opens.")}>Open provider settings</Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      )}
      <PreviewComposer retrying={retry.status === "retrying"} />
      <p role="status" aria-live="polite" className="text-xs text-text-weak">{event}</p>
    </div>
  )
}

/** Interactive Issue 18 proposal using sample errors and a local simulated retry loop. */
export function ErrorBannerDismissalEasel() {
  const [scenarioID, setScenarioID] = useState<ScenarioID>("network")
  const [episode, setEpisode] = useState(1)
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioID)
  if (!scenario) return null

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-weaker-base px-4 py-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text-strong">Error notices · make room, keep the next step</p>
          <p className="text-xs text-text-weak">Issue 18 · interactive proposal</p>
        </div>
        <Badge variant="outline">Preview only · fake data</Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-6">
          <ToggleGroup
            type="single"
            value={scenarioID}
            variant="outline"
            size="sm"
            className="flex-wrap"
            aria-label="Error notice scenario"
            onValueChange={(value) => {
              const next = findCatalogID(value, SCENARIOS)
              if (next) setScenarioID(next)
            }}
          >
            {SCENARIOS.map((item) => <ToggleGroupItem key={item.id} value={item.id}>{item.label}</ToggleGroupItem>)}
          </ToggleGroup>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-lg text-sm leading-relaxed text-text-weak">{scenario.rule}</p>
            <Button size="sm" variant="outline" onClick={() => setEpisode((current) => current + 1)}>
              <RotateCcwIcon data-icon="inline-start" />
              New failure / reset
            </Button>
          </div>
          <div className="flex flex-col gap-7 rounded-2xl border border-border-weaker-base bg-background-stronger p-4 sm:p-6">
            <div className="flex flex-col gap-4 pb-4">
              <div className="composer-surface composer-grain relative ml-auto max-w-sm px-4 py-3 text-sm text-text-base">Explain what happens when the provider cannot finish my response.</div>
              <p className="max-w-lg text-sm leading-relaxed text-text-weak">I’ll walk through the failure and the recovery options.</p>
            </div>
            {scenario.kind === "retry" ? (
              <RetryPreview key={`${scenario.id}:${episode}`} scenario={scenario} />
            ) : (
              <TerminalPreview key={`${scenario.id}:${episode}`} scenario={scenario} episode={episode} />
            )}
          </div>
          <p className="text-xs leading-relaxed text-text-weaker">Try the close or minimize control, reopen the card, then start a new failure. Recovery buttons report a preview action below the composer. Try again deliberately produces another sample failure. No model, account, session or settings are changed.</p>
        </div>
      </div>
    </div>
  )
}
