import { useEffect, useRef, useState } from "react"
import { Button, cn } from "@buddy/ui"
import {
  ArrowRightIcon,
  CheckIcon,
  CogIcon,
  CopyIcon,
  InfoIcon,
  Layers3Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
  type AppIcon,
} from "@/icons/app-icons"
import type { AssistantErrorModel } from "@/state/chat-error-model"
import "@/components/prompt/composer-surfaces.css"
import buddyConfusedUrl from "../../../../../assets/mascot/buddy-mascot-confused.png"
import buddyHeadsetUrl from "../../../../../assets/mascot/buddy-mascot-headset.png"
import buddySleepUrl from "../../../../../assets/mascot/buddy-mascot-sleep.png"
import buddyThinkUrl from "../../../../../assets/mascot/buddy-mascot-think.png"

export type AssistantErrorActionID =
  | "open-settings"
  | "try-again"
  | "switch-model"
  | "compact-and-continue"
  | "new-session"
  | "dismiss"
  | "continue"
  | "copy-details"

type Action = {
  id: AssistantErrorActionID
  label: string
  icon?: AppIcon
  quiet?: boolean
}

export type AssistantErrorCardSpec = {
  id: string
  headline: string
  detail?: string
  primary: Action
  secondary?: Action
  schemaName: string
  raw: string
}

const COPIED_FEEDBACK_MS = 1600

const MASCOT_BY_POSE = {
  headset: { url: buddyHeadsetUrl, alt: "Buddy wearing a support headset" },
  confused: { url: buddyConfusedUrl, alt: "Buddy scratching its head" },
  sleep: { url: buddySleepUrl, alt: "Buddy dozing" },
  think: { url: buddyThinkUrl, alt: "Buddy thinking" },
} as const

function mascotFor(id: string) {
  switch (id) {
    case "auth":
    case "setup":
      return MASCOT_BY_POSE.headset
    case "rate_limit":
    case "overloaded":
      return MASCOT_BY_POSE.sleep
    case "context":
      return MASCOT_BY_POSE.think
    default:
      return MASCOT_BY_POSE.confused
  }
}

function TerminalActionButton(props: {
  action: Action
  primary?: boolean
  onAction: (action: AssistantErrorActionID) => void
}) {
  const Icon = props.action.icon
  const inner = Icon ? (
    <>
      <Icon data-icon="inline-start" aria-hidden />
      {props.action.label}
    </>
  ) : (
    props.action.label
  )
  const btnVariant = props.action.quiet ? "ghost" : props.primary ? undefined : "outline"
  return (
    <Button
      size="sm"
      variant={btnVariant}
      className={cn("h-7", props.action.quiet && "text-text-weak")}
      onClick={() => props.onAction(props.action.id)}
    >
      {inner}
    </Button>
  )
}

export function AssistantErrorCard(props: {
  spec: AssistantErrorCardSpec
  alert?: boolean
  onAction: (action: AssistantErrorActionID) => void
}) {
  const { spec } = props
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const role = props.alert ? "alert" : undefined
  const m = mascotFor(spec.id)

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    },
    [],
  )

  async function copyRaw() {
    if (!("clipboard" in navigator)) return
    const ok = await navigator.clipboard
      .writeText(spec.raw)
      .then(() => true)
      .catch(() => false)
    if (!ok) return
    setCopied(true)
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
  }

  function onAction(action: AssistantErrorActionID) {
    if (action === "copy-details") {
      void copyRaw()
      return
    }
    props.onAction(action)
  }

  return (
    <div
      role={role}
      className="composer-surface composer-grain relative w-full overflow-hidden p-5"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -left-12 -top-14 size-56 rounded-full bg-icon-critical-base/20 blur-2xl dark:bg-icon-critical-base/12"
      />
      <div className="relative flex items-start gap-5">
        <div className="relative shrink-0">
          <img
            src={m.url}
            alt={m.alt}
            draggable={false}
            className="size-16 select-none object-contain"
          />
          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-surface-critical-strong ring-2 ring-surface-raised-base">
            <TriangleAlertIcon className="size-3 text-text-on-critical-strong" aria-hidden />
          </span>
        </div>

        <div className="min-w-0 flex-1 pt-1">
          <div className="text-sm font-medium leading-snug text-text-strong">{spec.headline}</div>
          {spec.detail ? (
            <div className="mt-1.5 text-[13px] leading-relaxed text-text-weak">{spec.detail}</div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <TerminalActionButton action={spec.primary} primary onAction={onAction} />
            {spec.secondary ? (
              <TerminalActionButton action={spec.secondary} onAction={onAction} />
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-text-weak"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              Details
            </Button>
          </div>

          {open ? (
            <div className="mt-3 rounded-lg border border-border-weaker-base bg-surface-inset-base p-3.5">
              <div className="mb-1.5 font-mono text-[11px] text-text-weaker">{spec.schemaName}</div>
              <div className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text-weak">
                {spec.raw}
              </div>
              <div className="mt-3">
                <Button
                  size="xs"
                  variant="ghost"
                  className={cn(copied ? "text-text-success-base" : "text-text-weak")}
                  onClick={() => void copyRaw()}
                >
                  {copied ? (
                    <CheckIcon data-icon="inline-start" aria-hidden />
                  ) : (
                    <CopyIcon data-icon="inline-start" aria-hidden />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function AssistantTruncatedNote(props: { onContinue: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border-weaker-base bg-surface-raised-base/60 px-3 py-2 text-[13px] text-text-weak">
      <InfoIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
      <span className="min-w-0 flex-1">
        Response was cut off at the model&rsquo;s length limit.
      </span>
      <Button size="xs" variant="outline" onClick={props.onContinue}>
        Continue
        <ArrowRightIcon data-icon="inline-end" aria-hidden />
      </Button>
    </div>
  )
}

function rawErrorText(model: AssistantErrorModel): string {
  return model.details.responseBody ?? model.details.message ?? model.details.name
}

function schemaName(model: AssistantErrorModel): string {
  return model.details.statusCode === undefined
    ? model.details.name
    : `${model.details.name} · statusCode ${model.details.statusCode}`
}

export function createAssistantErrorCardSpec(
  model: AssistantErrorModel,
  providerName?: string,
): AssistantErrorCardSpec {
  const diagnostic = {
    schemaName: schemaName(model),
    raw: rawErrorText(model),
  }

  switch (model.category) {
    case "auth":
      return {
        id: "auth",
        headline: providerName ? `${providerName} disconnected` : "Your model provider disconnected",
        detail: providerName
          ? `Your ${providerName} sign-in expired or was revoked.`
          : "The provider sign-in expired or was revoked.",
        primary: {
          id: "open-settings",
          label: providerName ? `Reconnect ${providerName}` : "Reconnect provider",
          icon: CogIcon,
        },
        ...diagnostic,
      }
    case "rate-limit":
      return {
        id: "rate_limit",
        headline: "You've hit the model's rate limit",
        detail: "It's capping requests for the next little while.",
        primary: { id: "try-again", label: "Try again", icon: RefreshCwIcon },
        secondary: { id: "switch-model", label: "Switch model" },
        ...diagnostic,
      }
    case "overloaded":
      return {
        id: "overloaded",
        headline: "The model is overloaded",
        detail: "It's under heavy load right now, usually brief.",
        primary: { id: "try-again", label: "Try again", icon: RefreshCwIcon },
        secondary: { id: "switch-model", label: "Switch model" },
        ...diagnostic,
      }
    case "network":
      return {
        id: "network",
        headline: "Couldn't reach the model",
        detail: "The request didn't get through. Check your connection.",
        primary: { id: "try-again", label: "Try again", icon: RefreshCwIcon },
        ...diagnostic,
      }
    case "context":
      return {
        id: "context",
        headline: "This conversation is too long for the model",
        detail: "It's past the model's context window.",
        primary: {
          id: "compact-and-continue",
          label: "Compact & continue",
          icon: Layers3Icon,
        },
        secondary: { id: "new-session", label: "New session" },
        ...diagnostic,
      }
    case "content":
      return {
        id: "content",
        headline: "The model stopped this response",
        detail: "The provider's content filter blocked it. Rephrasing may help.",
        primary: { id: "dismiss", label: "Dismiss", quiet: true },
        ...diagnostic,
      }
    case "format":
      return {
        id: "format",
        headline: "The model couldn't return a valid result",
        detail: "The response came back malformed. Usually a one-off.",
        primary: { id: "try-again", label: "Try again", icon: RefreshCwIcon },
        ...diagnostic,
      }
    case "output-length":
      return {
        id: "truncated",
        headline: "Response was cut off at the model's length limit",
        primary: { id: "continue", label: "Continue", icon: ArrowRightIcon },
        ...diagnostic,
      }
    case "unknown":
      return {
        id: "unknown",
        headline: "Something went wrong",
        detail: "An unexpected error interrupted the response.",
        primary: { id: "try-again", label: "Try again", icon: RefreshCwIcon },
        secondary: { id: "copy-details", label: "Copy details", quiet: true },
        ...diagnostic,
      }
    case "stopped":
      return {
        id: "unknown",
        headline: "Something went wrong",
        detail: "An unexpected error interrupted the response.",
        primary: { id: "try-again", label: "Try again", icon: RefreshCwIcon },
        secondary: { id: "copy-details", label: "Copy details", quiet: true },
        ...diagnostic,
      }
  }
}
