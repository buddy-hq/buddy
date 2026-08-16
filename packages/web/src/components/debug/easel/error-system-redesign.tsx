import { useEffect, useState, type ComponentType, type ReactNode } from "react"
import { Badge, Button, cn, ToggleGroup, ToggleGroupItem } from "@buddy/ui"
import {
  ArrowRightIcon,
  Clock3Icon,
  CogIcon,
  CopyIcon,
  CpuSettingsIcon,
  ExternalLinkIcon,
  HandIcon,
  InfoIcon,
  KeyRound,
  Layers3Icon,
  PlugIcon,
  RefreshCwIcon,
  ShieldAlert,
  TriangleAlertIcon,
  WrenchIcon,
  ZapIcon,
  type AppIcon,
} from "@/icons/app-icons"
// Grain material (composer-surface / composer-grain) — the terminal card wears it
// so it belongs to the composer region it sits above. See docs/design/grain.md.
import "@/components/prompt/composer-surfaces.css"
// Companion-variant mascots only (transparent-bg poses; see assets/mascot/AGENTS.md).
import buddyConfusedUrl from "../../../../../../assets/mascot/buddy-mascot-confused.png"
import buddyHeadsetUrl from "../../../../../../assets/mascot/buddy-mascot-headset.png"
import buddySleepUrl from "../../../../../../assets/mascot/buddy-mascot-sleep.png"
import buddyThinkUrl from "../../../../../../assets/mascot/buddy-mascot-think.png"

/**
 * Easel · Error system redesign
 *
 * Low-fidelity, real-component prototype for docs/errors/proposed-design.md.
 * Four views:
 *   1. Retry ladder   — a retry is not an error; it surfaces only once it stops
 *                        behaving like normal weather (attempt 3+). The runtime has
 *                        no max-attempt bound, so it never "runs out" of retries —
 *                        it goes terminal only when an attempt returns a
 *                        non-retryable error (assistantMessage.error).
 *   2. Terminal states — the taxonomy: every runtime discriminant mapped to one
 *                        calm, product-language card with one primary action.
 *   3. Copy lock       — every error kind in one table: the raw string that renders
 *                        today vs. the product copy we're locking (mirrors §10).
 *   4. Before / after  — one failure, three red boxes (today) → one card (proposed).
 *
 * Everything uses production tokens (critical / warning / success families) and
 * @buddy/ui primitives so the fidelity reads true.
 */

type View = "retry" | "terminal" | "copy-lock" | "before-after"

// ─── Shared chrome ───────────────────────────────────────────────────────────

function TranscriptFrame(props: { children: ReactNode; composer?: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-surface-raised-base px-3.5 py-2 text-sm text-text-base">
          what is this
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm leading-relaxed text-text-base">
        <p>
          It&rsquo;s the transcript error surface. I was pulling the provider response together when
          the request ran into trouble&hellip;
        </p>
      </div>
      {props.children}
      {props.composer ? <FakeComposer /> : null}
    </div>
  )
}

function FakeComposer() {
  return (
    <div className="mt-1 flex items-center gap-2 rounded-2xl border border-border-base bg-surface-base px-3.5 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm text-text-weaker">
        Message Buddy&hellip;
      </span>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-interactive-base text-text-on-interactive-base">
        <ArrowRightIcon className="size-4" aria-hidden />
      </span>
    </div>
  )
}

function Caption(props: { children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-text-weaker">{props.children}</p>
}

// ─── Tier 0 · working row (quiet retries live here) ──────────────────────────

function WorkingRow(props: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-text-weak">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-surface-interactive-base opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-surface-interactive-base" />
      </span>
      <span className="animate-pulse">{props.label}</span>
    </div>
  )
}

// ─── Two locked surface styles ────────────────────────────────────────────────
//
// The whole error system renders in exactly two treatments — nothing else. Both
// belong to the composer region they sit near, so both are grain surfaces.
//
//   1. Companion card — a settled, non-retryable outcome. A grain surface with a
//      mascot companion and a red alert indicator (a soft red wash + a badge on
//      the companion, never a spine) so it reads unmistakably as an error.
//   2. Ticker — transient retry "weather". Amber, never red. It starts as one
//      ambient line and, only when it needs to offer actions, grows into a grain
//      surface with those actions stacked underneath where they're tappable.

// ── Retry surface · the ticker ────────────────────────────────────────────────

type RetryStage = "quiet" | "notice" | "persistent"

type RetryAction = { label: string; primary?: boolean; icon?: AppIcon }
type RetryContent = { headline: string; sub: string; actions?: RetryAction[] }

// The ticker's "alive" tell — a breathing amber dot, not a spinner.
function AmberPulse() {
  return (
    <span className="relative flex size-2.5 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-icon-warning-base opacity-60" />
      <span className="relative inline-flex size-2.5 rounded-full bg-icon-warning-base" />
    </span>
  )
}

function RetryActions(props: { actions: RetryAction[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.actions.map((a) => (
        <Button
          key={a.label}
          size="sm"
          variant={a.primary ? "outline" : "ghost"}
          className={a.primary ? undefined : "text-text-weak"}
        >
          {a.label}
          {a.icon ? <a.icon data-icon="inline-end" aria-hidden /> : null}
        </Button>
      ))}
    </div>
  )
}

function RetrySurface(props: { content: RetryContent }) {
  const { content } = props
  const actions = content.actions ?? []
  const aria = { role: "status" as const, "aria-live": "polite" as const }

  const line = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <AmberPulse />
      <span className="font-medium text-text-strong">{content.headline}</span>
      <span className="text-text-weaker" aria-hidden>
        ·
      </span>
      <span className="tabular-nums text-text-weak">{content.sub}</span>
    </div>
  )

  // No actions → one ambient amber line in the flow. No box, no fill: weather you
  // can read at a glance and ignore. The antidote to "the big orange thing".
  if (actions.length === 0) {
    return (
      <div {...aria} className="w-full py-1">
        {line}
      </div>
    )
  }

  // Needs actions → the ticker grows into a grain surface, with the actions
  // stacked underneath the line where they're actually visible and tappable.
  return (
    <div
      {...aria}
      className="composer-surface composer-grain relative w-full overflow-hidden p-3.5"
    >
      {line}
      <div className="mt-3">
        <RetryActions actions={actions} />
      </div>
    </div>
  )
}

function RetryNotice(props: {
  stage: Exclude<RetryStage, "quiet">
  attempt: number
  seconds: number
}) {
  const persistent = props.stage === "persistent"
  return (
    <RetrySurface
      content={{
        headline: persistent
          ? "Still busy — this is taking longer than usual"
          : "The model provider is busy",
        sub:
          props.seconds > 0
            ? `Trying again in ${props.seconds}s · attempt ${props.attempt}`
            : `Retrying now · attempt ${props.attempt}`,
        actions: persistent
          ? [{ label: "Switch model", primary: true }, { label: "Stop" }]
          : undefined,
      }}
    />
  )
}

// Stage A — a known, user-resolvable limit. Promotes immediately, any attempt.
function RetryActionCard() {
  return (
    <RetrySurface
      content={{
        headline: "You’ve reached the free model’s limit",
        sub: "Resets in about 3 minutes — switch models to keep going now.",
        actions: [
          { label: "Switch model", primary: true },
          { label: "View limits", icon: ExternalLinkIcon },
        ],
      }}
    />
  )
}

// ── Terminal surface · the companion card ─────────────────────────────────────

type Action = { label: string; icon?: AppIcon; quiet?: boolean }

type TerminalSpec = {
  id: string
  tag: string
  icon: AppIcon
  headline: string
  detail?: string
  primary: Action
  secondary?: Action
  schemaName: string
  raw: string
}

// Companion mascot — one per card, small and to one side so it stays a
// supporting accent, not the whole card (poses: assets/mascot/AGENTS.md).
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

function TerminalActionButton(props: { action: Action; primary?: boolean }) {
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
      className={props.action.quiet ? "text-text-weak" : undefined}
    >
      {inner}
    </Button>
  )
}

function TerminalCard(props: { spec: TerminalSpec; alert?: boolean }) {
  const { spec } = props
  const [open, setOpen] = useState(false)
  const role = props.alert ? "alert" : undefined
  const m = mascotFor(spec.id)

  return (
    <div
      role={role}
      className="composer-surface composer-grain relative w-full overflow-hidden p-4"
    >
      {/* Error indicator, not a spine: a soft red wash bleeds in from the
          companion so the whole grain surface reads as an alert. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-12 size-48 rounded-full bg-icon-critical-base/12 blur-2xl"
      />
      <div className="relative flex items-start gap-4">
        <div className="relative shrink-0">
          <img
            src={m.url}
            alt={m.alt}
            draggable={false}
            className="size-16 select-none object-contain"
          />
          {/* the crisp half of the signal — a red alert badge on the companion */}
          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-surface-critical-strong ring-2 ring-surface-raised-base">
            <TriangleAlertIcon className="size-3 text-text-on-critical-base" aria-hidden />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-strong">{spec.headline}</div>
          {spec.detail ? (
            <div className="mt-0.5 text-[13px] leading-snug text-text-weak">{spec.detail}</div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TerminalActionButton action={spec.primary} primary />
            {spec.secondary ? <TerminalActionButton action={spec.secondary} /> : null}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-text-weak"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              Details
            </Button>
          </div>

          {open ? (
            <div className="mt-2 rounded-lg border border-border-weaker-base bg-surface-inset-base p-2.5">
              <div className="mb-1 font-mono text-[11px] text-text-weaker">{spec.schemaName}</div>
              <div className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text-weak">
                {spec.raw}
              </div>
              <div className="mt-2">
                <Button size="xs" variant="ghost" className="text-text-weak">
                  <CopyIcon data-icon="inline-start" aria-hidden />
                  Copy for support
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// Benign: the model DID respond, just incompletely. Not a red card.
function TruncatedNote() {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border-weaker-base bg-surface-raised-base/60 px-3 py-2 text-[13px] text-text-weak">
      <InfoIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
      <span className="min-w-0 flex-1">
        Response was cut off at the model&rsquo;s length limit.
      </span>
      <Button size="xs" variant="outline">
        Continue
        <ArrowRightIcon data-icon="inline-end" aria-hidden />
      </Button>
    </div>
  )
}

// Non-error: the user stopped the turn.
function StoppedDivider() {
  return (
    <div className="flex items-center gap-3 py-0.5 text-text-weaker">
      <div className="h-px flex-1 bg-border-weaker-base" />
      <span className="flex items-center gap-1.5 text-xs">
        <HandIcon className="size-3.5" aria-hidden />
        Stopped
      </span>
      <div className="h-px flex-1 bg-border-weaker-base" />
    </div>
  )
}

const TERMINAL_SPECS: TerminalSpec[] = [
  {
    id: "auth",
    tag: "auth · ProviderAuthError",
    icon: KeyRound,
    headline: "This model needs to be connected",
    detail: "Add your Anthropic API key to continue.",
    primary: { label: "Open settings", icon: CogIcon },
    schemaName: "ProviderAuthError",
    raw: "401 · invalid x-api-key while loading provider credentials",
  },
  {
    id: "rate_limit",
    tag: "rate_limit · APIError 429 (terminal)",
    icon: Clock3Icon,
    headline: "You've hit the model's rate limit",
    detail: "Wait a moment, or switch to another model.",
    primary: { label: "Try again", icon: RefreshCwIcon },
    secondary: { label: "Switch model" },
    schemaName: "APIError · statusCode 429",
    raw: '{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}',
  },
  {
    id: "overloaded",
    tag: "overloaded · APIError 529 (terminal)",
    icon: ZapIcon,
    headline: "The model is overloaded right now",
    detail: "This usually clears up quickly.",
    primary: { label: "Try again", icon: RefreshCwIcon },
    secondary: { label: "Switch model" },
    schemaName: "APIError · statusCode 529",
    raw: "Overloaded",
  },
  {
    id: "network",
    tag: "network · APIError (transport)",
    icon: PlugIcon,
    headline: "Couldn't reach the model",
    detail: "Check your connection and try again.",
    primary: { label: "Try again", icon: RefreshCwIcon },
    schemaName: "APIError · retryable",
    raw: "Connection reset by server (ECONNRESET)",
  },
  {
    id: "context",
    tag: "context · ContextOverflowError (compaction off)",
    icon: Layers3Icon,
    headline: "This conversation is too long for the model",
    detail: "Compact it to keep going, or start fresh.",
    primary: { label: "Compact & continue", icon: Layers3Icon },
    secondary: { label: "New session" },
    schemaName: "ContextOverflowError",
    raw: "Requested 214,300 tokens · model context window is 200,000",
  },
  {
    id: "content",
    tag: "content · ContentFilterError",
    icon: ShieldAlert,
    headline: "The model stopped this response",
    detail: "It was blocked by the provider's content filter. Try rephrasing.",
    primary: { label: "Dismiss", quiet: true },
    schemaName: "ContentFilterError",
    raw: "finish_reason: content_filter",
  },
  {
    id: "format",
    tag: "format · StructuredOutputError",
    icon: CpuSettingsIcon,
    headline: "The model couldn't return a valid result",
    detail: "This happens occasionally — try again.",
    primary: { label: "Try again", icon: RefreshCwIcon },
    schemaName: "StructuredOutputError · retries 2",
    raw: "Response did not satisfy the required JSON schema after 2 retries",
  },
  {
    id: "setup",
    tag: "setup · pre-message (no assistant message)",
    icon: WrenchIcon,
    headline: "Couldn't start this turn",
    detail: "The selected model is no longer available. Pick another to continue.",
    primary: { label: "Choose model" },
    schemaName: "UnknownError",
    raw: "provider model not found: anthropic/claude-legacy",
  },
  {
    id: "unknown",
    tag: "unknown · UnknownError (catch-all)",
    icon: TriangleAlertIcon,
    headline: "Something went wrong",
    detail: "Try again. If it keeps happening, copy the details.",
    primary: { label: "Try again", icon: RefreshCwIcon },
    secondary: { label: "Copy details", quiet: true },
    schemaName: "UnknownError",
    raw: '{"error":{"type":"api_error","message":"internal server error"}}',
  },
]

// ─── View 1 · retry ladder ────────────────────────────────────────────────────

// The runtime has no max-attempt bound (retry.ts · policy() retries while the error
// stays retryable, stopping only when it turns non-retryable). So this demo never
// "runs out" of retries — it either keeps climbing, or an attempt returns a
// non-retryable error and the turn goes terminal. The cap here is purely so the
// auto-play doesn't count forever.
const DEMO_ATTEMPT_CAP = 8

function demoDelay(attempt: number) {
  return Math.min(2 + attempt, 7)
}

function stageForAttempt(attempt: number): RetryStage {
  if (attempt <= 2) return "quiet"
  if (attempt <= 4) return "notice"
  return "persistent"
}

function stageBlurb(opts: {
  terminal: boolean
  stage: RetryStage
  usageLimit: boolean
  atCap: boolean
}) {
  if (opts.usageLimit) {
    return "Stage A — a known, user-resolvable limit. It skips the ladder and offers the fix straight away."
  }
  if (opts.terminal) {
    return "An attempt came back non-retryable, so the runtime stopped and wrote one assistantMessage.error. The amber notice settles in place into the same column — there's no 'retries exhausted' event and no new box elsewhere."
  }
  if (opts.stage === "quiet") {
    return "Stage Quiet (attempt 1–2) — nothing new surfaces. It's just the model working; transient blips resolve here."
  }
  if (opts.stage === "notice") {
    return "Stage Notice (attempt 3+) — now that the wait is noticeable, a calm amber notice appears. Amber, not red: we're still recovering."
  }
  return opts.atCap
    ? "Stage Persistent (attempt 5+) — plus an escape hatch (Stop / Switch model). The runtime has no attempt cap; it keeps retrying while the error stays retryable. (Demo paused here so it doesn't count forever.)"
    : "Stage Persistent (attempt 5+) — same amber notice, plus an escape hatch. Still not a failure; the user just gets agency."
}

function RetryLadderView() {
  const [attempt, setAttempt] = useState(1)
  const [seconds, setSeconds] = useState(() => demoDelay(1))
  const [playing, setPlaying] = useState(false)
  const [terminal, setTerminal] = useState(false)
  const [usageLimit, setUsageLimit] = useState(false)

  useEffect(() => {
    setSeconds(demoDelay(attempt))
  }, [attempt])

  useEffect(() => {
    if (!playing || terminal || usageLimit) return
    const id = window.setInterval(() => {
      setSeconds((s) => {
        if (s > 1) return s - 1
        setAttempt((a) => {
          if (a + 1 > DEMO_ATTEMPT_CAP) {
            setPlaying(false)
            return a
          }
          return a + 1
        })
        return 0
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [playing, terminal, usageLimit])

  const stage = stageForAttempt(attempt)
  const atCap = attempt >= DEMO_ATTEMPT_CAP

  const reset = () => {
    setPlaying(false)
    setTerminal(false)
    setUsageLimit(false)
    setAttempt(1)
    setSeconds(demoDelay(1))
  }

  const step = (delta: number) => {
    setPlaying(false)
    setTerminal(false)
    setAttempt((a) => Math.min(DEMO_ATTEMPT_CAP, Math.max(1, a + delta)))
  }

  const networkSpec = TERMINAL_SPECS.find((s) => s.id === "network")!

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-weaker-base bg-background-base px-3 py-2">
        <Button
          size="sm"
          variant={playing ? "outline" : undefined}
          disabled={usageLimit || terminal || atCap}
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? "Pause" : "Play"}
        </Button>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Previous attempt" onClick={() => step(-1)}>
            −
          </Button>
          <span className="min-w-16 select-none text-center text-xs tabular-nums text-text-weak">
            attempt {attempt}
          </span>
          <Button size="sm" variant="ghost" aria-label="Next attempt" onClick={() => step(1)}>
            +
          </Button>
        </div>
        <Button size="sm" variant="ghost" className="text-text-weak" onClick={reset}>
          Reset
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-weak">
            <input
              type="checkbox"
              checked={usageLimit}
              onChange={(e) => {
                const on = e.currentTarget.checked
                setUsageLimit(on)
                if (on) setTerminal(false)
              }}
            />
            Usage limit (Stage A)
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-weak">
            <input
              type="checkbox"
              checked={terminal}
              onChange={(e) => {
                const on = e.currentTarget.checked
                setTerminal(on)
                if (on) {
                  setUsageLimit(false)
                  setPlaying(false)
                }
              }}
            />
            Non-retryable → terminal
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background-base">
        <TranscriptFrame>
          {usageLimit ? (
            <RetryActionCard />
          ) : terminal ? (
            <TerminalCard spec={networkSpec} alert />
          ) : stage === "quiet" ? (
            <WorkingRow label="Exploring the codebase…" />
          ) : (
            <RetryNotice stage={stage} attempt={attempt} seconds={seconds} />
          )}

          <div className="mt-1 rounded-lg border border-dashed border-border-weaker-base bg-surface-inset-base/50 px-3 py-2">
            <Caption>{stageBlurb({ terminal, stage, usageLimit, atCap })}</Caption>
          </div>
        </TranscriptFrame>
      </div>
    </div>
  )
}

// ─── View 2 · terminal states gallery ─────────────────────────────────────────

function TerminalStatesView() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface-inset-base">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-5">
        {TERMINAL_SPECS.map((spec) => (
          <div key={spec.id} className="flex flex-col gap-1">
            <span className="px-0.5 font-mono text-[11px] text-text-weaker">{spec.tag}</span>
            <TerminalCard spec={spec} />
          </div>
        ))}

        <div className="mt-2 h-px bg-border-weaker-base" />
        <span className="px-0.5 font-mono text-[11px] text-text-weaker">
          truncated · MessageOutputLengthError — a note only when visible text landed; otherwise it
          falls back to a terminal card
        </span>
        <TruncatedNote />

        <span className="mt-1 px-0.5 font-mono text-[11px] text-text-weaker">
          stopped · MessageAbortedError — a non-error the user caused
        </span>
        <StoppedDivider />
      </div>
    </div>
  )
}

// ─── View 3 · before / after ──────────────────────────────────────────────────

function LegacyAssistantBox(props: { name: string; text: string }) {
  return (
    <div className="w-full rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-icon-critical-base/85">
        Assistant error
      </div>
      <div className="mt-1 text-xs text-icon-critical-base/75">{props.name}</div>
      <div className="mt-2 break-words text-sm text-icon-critical-base">{props.text}</div>
    </div>
  )
}

function LegacyDockBox(props: { text: string }) {
  return (
    <div className="w-full rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
      {props.text}
    </div>
  )
}

function CompareColumn(props: {
  badge: string
  badgeTone: "critical" | "success"
  headline: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-base bg-background-base p-3.5">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            props.badgeTone === "critical"
              ? "border-border-critical-base/40 text-text-critical-base"
              : "border-border-success-base/40 text-text-success-base",
          )}
        >
          {props.badge}
        </Badge>
        <span className="text-xs text-text-weaker">{props.headline}</span>
      </div>
      {props.children}
    </div>
  )
}

function BeforeAfterView() {
  const networkSpec = TERMINAL_SPECS.find((s) => s.id === "unknown")!

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface-inset-base">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5">
        <CompareColumn
          badge="Today"
          badgeTone="critical"
          headline="one failure · three red boxes · raw names"
        >
          <div className="flex justify-end">
            <div className="rounded-2xl rounded-br-md bg-surface-raised-base px-3.5 py-2 text-sm text-text-base">
              what is this
            </div>
          </div>
          <LegacyAssistantBox name="APIError" text="No providerText available" />
          <div className="flex justify-end">
            <div className="rounded-2xl rounded-br-md bg-surface-raised-base px-3.5 py-2 text-sm text-text-base">
              ?
            </div>
          </div>
          <LegacyAssistantBox name="APIError" text="No providerText available" />
          <LegacyDockBox text="No provider available" />
          <div className="flex items-center gap-2 rounded-2xl border border-border-base bg-surface-base px-3.5 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm text-text-weaker">Message Buddy…</span>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-interactive-base text-text-on-interactive-base">
              <ArrowRightIcon className="size-4" aria-hidden />
            </span>
          </div>
          <Caption>
            The two turn cards and the composer dock are three projections of the same failure, in
            schema names and empty raw text.
          </Caption>
        </CompareColumn>

        <div className="flex items-center gap-2 px-1 text-text-weaker">
          <div className="h-px flex-1 bg-border-weaker-base" />
          <ArrowRightIcon className="size-4 rotate-90" aria-hidden />
          <div className="h-px flex-1 bg-border-weaker-base" />
        </div>

        <CompareColumn
          badge="Proposed"
          badgeTone="success"
          headline="one card · plain language · one action · raw in Details"
        >
          <div className="flex justify-end">
            <div className="rounded-2xl rounded-br-md bg-surface-raised-base px-3.5 py-2 text-sm text-text-base">
              what is this
            </div>
          </div>
          <TerminalCard spec={networkSpec} />
          <div className="flex items-center gap-2 rounded-2xl border border-border-base bg-surface-base px-3.5 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm text-text-weaker">Message Buddy…</span>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-interactive-base text-text-on-interactive-base">
              <ArrowRightIcon className="size-4" aria-hidden />
            </span>
          </div>
          <Caption>
            Sourced only from the stored message error. The redundant session.error feeds
            notifications, deduplicated — so it never becomes a second or third box.
          </Caption>
        </CompareColumn>
      </div>
    </div>
  )
}

// ─── View · copy lock (current → proposed, every kind in one place) ───────────

function TodayErrorBox(props: { name: string; text: string }) {
  return (
    <div className="h-full rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-icon-critical-base/85">
        Assistant error
      </div>
      <div className="mt-1 font-mono text-[11px] text-icon-critical-base/75">{props.name}</div>
      <div className="mt-1.5 break-words text-[13px] text-icon-critical-base">{props.text}</div>
    </div>
  )
}

// Each proposed copy is shown in the real treatment it renders in — so the
// difference between a terminal card, an inline note, a divider, an amber retry
// notice and a toast is visible, not just described. TreatmentTag labels which.
type Treatment = "terminal" | "inline" | "divider" | "retry" | "toast"

const TREATMENT_META = {
  terminal: { label: "Terminal card", hint: "in the transcript, above the composer" },
  inline: { label: "Inline note", hint: "under the visible text" },
  divider: { label: "Divider", hint: "between turns" },
  retry: { label: "Retry notice", hint: "amber, transient — never red" },
  toast: { label: "Toast / hint", hint: "outside the transcript" },
} satisfies Record<Treatment, { label: string; hint: string }>

function TreatmentTag(props: { treatment: Treatment }) {
  const m = TREATMENT_META[props.treatment]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="border-border-base text-text-weak">
        {m.label}
      </Badge>
      <span className="text-[11px] text-text-weaker">{m.hint}</span>
    </div>
  )
}

// A typed toast / composer hint — the operational + setup treatment. It lives
// outside the transcript, so it never becomes a red card in the conversation.
function ToastPill(props: { icon?: AppIcon; text: string; action?: string }) {
  const Icon = props.icon
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border-base bg-surface-raised-base px-3 py-2">
      {Icon ? <Icon className="size-4 shrink-0 text-icon-base" aria-hidden /> : null}
      <span className="min-w-0 flex-1 text-[13px] text-text-base">{props.text}</span>
      {props.action ? (
        <Button size="xs" variant="ghost" className="shrink-0 text-text-weak">
          {props.action}
        </Button>
      ) : null}
    </div>
  )
}

function CopyLockRow(props: { tag: string; today: ReactNode; proposed: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-0.5 font-mono text-[11px] text-text-weaker">{props.tag}</span>
      <div className="grid items-stretch gap-2 sm:grid-cols-2">
        {props.today}
        {props.proposed}
      </div>
    </div>
  )
}

function CopyLockSection(props: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-text-base">{props.title}</span>
        <div className="h-px flex-1 bg-border-weaker-base" />
      </div>
      {props.children}
    </div>
  )
}

function CopyLockView() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface-inset-base">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-5">
        <div className="rounded-lg border border-dashed border-border-weaker-base bg-background-base px-3 py-2.5">
          <Caption>
            Every error kind in one place — the raw string that renders today vs. the copy
            we&rsquo;re locking, shown in its <em>real</em> treatment and labeled by where it lands
            (terminal card · inline note · divider · amber retry · toast). Today, every terminal
            case shows the same uppercase &ldquo;Assistant error&rdquo; label over a raw schema
            name. Sign off here; §10 of the design doc mirrors this table.
          </Caption>
        </div>

        <div className="grid grid-cols-2 gap-2 px-0.5">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-border-critical-base/40 text-text-critical-base"
            >
              Today
            </Badge>
            <span className="text-[11px] text-text-weaker">what renders now</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-border-success-base/40 text-text-success-base"
            >
              Proposed
            </Badge>
            <span className="text-[11px] text-text-weaker">what we lock</span>
          </div>
        </div>

        <CopyLockSection title="Terminal cards">
          {TERMINAL_SPECS.map((spec) => (
            <CopyLockRow
              key={spec.id}
              tag={spec.tag}
              today={<TodayErrorBox name={spec.schemaName} text={spec.raw} />}
              proposed={
                <div className="flex h-full flex-col gap-1.5">
                  <TreatmentTag treatment="terminal" />
                  <TerminalCard spec={spec} />
                </div>
              }
            />
          ))}
        </CopyLockSection>

        <CopyLockSection title="Benign & non-error (not red cards)">
          <CopyLockRow
            tag="truncated · MessageOutputLengthError"
            today={
              <TodayErrorBox name="MessageOutputLengthError" text="MessageOutputLengthError" />
            }
            proposed={
              <div className="flex h-full flex-col gap-1.5">
                <TreatmentTag treatment="inline" />
                <TruncatedNote />
                <span className="text-[11px] text-text-weaker">
                  Only when the model actually produced text; otherwise it falls back to a calm
                  terminal card.
                </span>
              </div>
            }
          />
          <CopyLockRow
            tag="stopped · MessageAbortedError"
            today={
              <TodayErrorBox
                name="MessageAbortedError"
                text="(today: card sometimes suppressed, sometimes shown as an error)"
              />
            }
            proposed={
              <div className="flex h-full flex-col justify-center gap-1.5">
                <TreatmentTag treatment="divider" />
                <StoppedDivider />
                <span className="text-[11px] text-text-weaker">
                  Never a red card — the user caused it.
                </span>
              </div>
            }
          />
        </CopyLockSection>

        <CopyLockSection title="Retry (session.status — amber, never red)">
          <CopyLockRow
            tag="retry · overloaded / rate limit"
            today={
              <div className="h-full rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3">
                <div className="text-[13px] font-medium text-icon-critical-base">
                  Number of request tokens has exceeded your per-minute rate limit
                </div>
                <div className="mt-1 text-[11px] text-icon-critical-base/75">
                  Retrying in 4s. Attempt #3.
                </div>
              </div>
            }
            proposed={
              <div className="flex h-full flex-col gap-1.5">
                <TreatmentTag treatment="retry" />
                <RetryNotice stage="notice" attempt={3} seconds={4} />
                <span className="text-[11px] text-text-weaker">
                  The persistent stage (attempt 5+) adds Switch model / Stop.
                </span>
              </div>
            }
          />
        </CopyLockSection>

        <CopyLockSection title="Operational & setup (out of the transcript)">
          <CopyLockRow
            tag="session.error · dock string (today)"
            today={
              <div className="flex h-full flex-col gap-2">
                <LegacyDockBox text="An error occurred" />
                <LegacyDockBox text="No provider available" />
              </div>
            }
            proposed={
              <div className="flex h-full flex-col gap-2">
                <TreatmentTag treatment="toast" />
                <ToastPill icon={PlugIcon} text="Couldn't load this conversation." action="Retry" />
                <ToastPill icon={CogIcon} text="Connect a model to start chatting →" />
                <span className="text-[11px] text-text-weaker">
                  Setup without a message: &ldquo;Couldn&rsquo;t start this turn — {"{reason}"}
                  .&rdquo;
                </span>
              </div>
            }
          />
        </CopyLockSection>
      </div>
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

const VIEWS: { id: View; label: string; blurb: string; component: ComponentType }[] = [
  {
    id: "retry",
    label: "Retry ladder",
    blurb: "A retry is not an error — it surfaces only when it stops behaving like normal weather",
    component: RetryLadderView,
  },
  {
    id: "terminal",
    label: "Terminal states",
    blurb: "Every runtime discriminant → one calm, product-language card with one action",
    component: TerminalStatesView,
  },
  {
    id: "copy-lock",
    label: "Copy lock",
    blurb: "Every error kind — the string that renders today vs. the copy we're locking",
    component: CopyLockView,
  },
  {
    id: "before-after",
    label: "Before / after",
    blurb: "One failure, three red boxes today → one card proposed",
    component: BeforeAfterView,
  },
]

export function ErrorSystemRedesignEasel() {
  const [view, setView] = useState<View>("retry")
  const active = VIEWS.find((v) => v.id === view) ?? VIEWS[0]!
  const ActiveView = active.component

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-weaker-base px-3 py-1.5">
        <span className="text-xs font-medium text-text-base">Error system</span>
        <div className="h-3.5 w-px bg-border-weaker-base" />
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => {
            if (v) {
              // SAFETY: This select only emits values from the configured view items.
              setView(v as View)
            }
          }}
          variant="outline"
          size="sm"
        >
          {VIEWS.map((v) => (
            <ToggleGroupItem key={v.id} value={v.id} className="text-xs">
              {v.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="hidden min-w-0 truncate text-[11px] text-text-weaker xl:inline">
          {active.blurb}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <ActiveView />
      </div>
    </div>
  )
}
