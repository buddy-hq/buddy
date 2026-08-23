# Transcript errors: proposed design

Status: design proposal
Author basis: `docs/features/error-handling/current-state.md` audit + current source
Companion to: the current-state audit (read that first for the "why")

This document proposes an end-to-end replacement for how Buddy presents retries, turn
failures, and operational errors. It is opinionated. Where it makes a call you might
disagree with, that call is flagged in the final section.

Every claim about runtime behavior below was checked against the vendored source
(`vendor/opencode/**`) and the adapter/web layers, not inferred.

---

## 0. Hard constraints (what this design may and may not touch)

Three rules from `AGENTS.md` shape every choice here:

1. **No vendor edits.** `vendor/opencode/**` is off-limits except as a tracked vendored
   patch for the next subtree refresh (`AGENTS.md` § Vendor, line 37). All work lands in
   `packages/web`, and where a runtime seam is unavoidable, `packages/opencode-adapter`.
2. **Use only contracts the runtime already emits.** Two are load-bearing and genuinely
   reach the client: `session.status` (busy / retry, carrying `attempt` + `next`) and
   `assistantMessage.error` (the typed discriminant union, intrinsically message-scoped).
   `session.error` also arrives but is **demoted to notifications/logging** (§6.2). Note
   `session.info.time.compacting` exists in the schema but the runtime **never assigns it**
   (it is only ever plumbed through storage), so there is **no** client-visible
   compaction-in-progress signal to build on (§5.3).
3. **Don't fake durability.** Ephemeral signals must not be dressed up as durable. In
   particular we do **not** synthesize a `RetryPart` in the adapter: it would look durable
   but vanish on reconnect (it was never written to the message store), breaking the
   "predictable during reconnects" priority. (A genuinely durable retry history would require
   emitting a real `RetryPart` from the runtime — a vendor change we don't make — so it is
   out of scope, and retry history stays attempt-only. §6.4.)

---

## 1. Two principles

Everything below follows from two sentences.

**Principle 1 — A retry is not an error; it is the model still working.**
Retries are the normal weather of talking to LLM providers. They are already handled
correctly by the runtime. They should look like progress, not like failure, and should
only ask for the user's attention when they stop behaving like normal weather (taking
unusually long, or repeating). Red is never used for a state the system is actively
recovering from.

**Principle 2 — One failure appears in exactly one place, in the user's language.**
Today one terminal failure can render as two or three red boxes, in raw provider/runtime
text, using schema names like `APIError`. The target: a single, calm, turn-anchored card,
written in product language, with one obvious next step and the raw text tucked behind
"Details".

The current system violates both. It styles active retries in critical red, and it splits
one failure across a durable transcript card **and** a shared, untyped composer dock fed by
an overloaded `session.error` event.

---

## 2. The severity ladder

We replace "three independent red-box paths" with **one ladder of four surfaces**, ordered
by how much the user should worry, plus two things that are explicitly *not* errors.

| Tier | Surface | Means | Owned by | Tone | Lives |
| --- | --- | --- | --- | --- | --- |
| 0 | **Working row** | Still going (incl. quiet retries; runtime compaction just reads as "working") | `session.status` (busy / retry early) | Default + motion | In the turn |
| 1 | **Retry notice** | Still going, but slow/repeating | `session.status` (retry, escalated) | **Amber** | In the turn (last turn) |
| 2 | **Turn error card** | This turn ended without an answer | `assistantMessage.error` only | **Calm red** | Anchored to the turn, durable |
| 3 | **Operational toast** | Something around the chat failed (a load, a mutation, a send) | typed operational channel | Neutral + status dot | Transient, outside the transcript |

Not errors:

- **Stopped divider** — the user aborted. Neutral, never red. (Already exists.)
- **Inline caveat note** — the model *did* respond but with a caveat (output truncated at
  the length limit; input file couldn't be read so we continued without it). Muted, inline,
  attached to the message. Not a red card.

The single most important rule: **color encodes recoverability, not category.** Amber = we
are recovering. Red = the turn is over. Everything the runtime auto-recovers from
(retries in progress, auto-compaction, read fallbacks) is barred from red.

---

## 3. Retry, redesigned

This is your core idea, made precise. A retry passes through **stages**, and the stage —
not the mere fact of a retry — decides what the user sees.

### 3.1 Stages

| Stage | Trigger (attempt only) | What the user sees |
| --- | --- | --- |
| **Q — Quiet** | attempt ≤ 2 (and no structured action) | Nothing new. The existing working row ("Exploring", "Climbing") keeps running. |
| **N — Notice** | attempt ≥ 3 | A calm **amber** notice: spinner + one product line + countdown + attempt. |
| **P — Persistent** | attempt ≥ 5 | Same amber notice, copy sets expectations + offers **Switch model** / **Stop**. |
| **A — Actionable** | `status.action` present (free-tier / account rate limit) — any attempt | Promote immediately to an actionable card with the action's title/message/label/link. |

The thresholds are tunable constants, not magic:

```
QUIET_MAX_ATTEMPT       = 2
NOTICE_MIN_ATTEMPT      = 3     // ≈ the moment silence becomes noticeable
PERSISTENT_MIN_ATTEMPT  = 5
```

**Escalation keys on `attempt` alone — no elapsed-time thresholds.** The runtime exposes
only `attempt` and `next` (an absolute per-attempt "next try" timestamp), never a retry
*start* time or cumulative wait — so any elapsed clock would be client-local and would reset
on reload/reconnect. `attempt` is server-authored and survives reconnect via
`SessionStatus.get`, which makes it the one honest driver. The countdown line still derives
from `next − now`.

### 3.2 What the retry notice says

The retry `message` from the runtime is raw provider text ("Internal server error",
"Error from provider (Console): Provider rate limit exceeded"). **We do not show that as
the headline.** We map it to a coarse category and show product copy; the raw string moves
to a tooltip / "Details". This mapping is best-effort: the retry status carries only the
message string (plus the structured `action` when present), not an HTTP status — so when the
category is uncertain we fall back to the neutral "Retrying the request." headline rather
than guess. (Precise per-class retry copy would need `RetryPart`'s structured `APIError`,
which the runtime doesn't emit — §6.4.)

| Category (from retry message) | Notice headline (Stage N) | Persistent headline (Stage P) |
| --- | --- | --- |
| overloaded / 5xx / capacity | "The model provider is busy." | "Still busy — this is taking longer than usual." |
| rate limit | "Hitting the model's rate limit." | "Still rate limited — you can switch models." |
| network / connection reset | "Reconnecting to the model." | "Still trying to reconnect." |
| unknown retryable | "Retrying the request." | "Still retrying — this is taking longer than usual." |

Countdown line stays: `Trying again in {n}s · attempt {k}`. In Stage P, add buttons.

### 3.3 The escalation, end to end

```
attempt 1–2        attempt 3–4                   attempt 5+                   runtime stops retrying
────────────       ──────────────────────        ─────────────────────        ──────────────────────
Working row        Amber retry notice            Amber notice + actions       Terminal turn card
(no change)        "The provider is busy.        "Still busy… Switch          (Tier 2, §4) — driven by
                    Trying again in 6s · #3"       model?"  [Switch] [Stop]     assistantMessage.error
```

**There is no "retries exhausted" event.** The runtime retries a retryable error
*indefinitely* — `SessionRetry.policy` has no max-attempt bound; it stops only when
`retryable()` returns undefined (the error became non-retryable), when the turn succeeds, or
on abort. So the amber→red transition is not a timer firing: it happens when the runtime's
own `halt` sets `assistantMessage.error`, and the card is a reaction to that real state
change. When it happens it should *settle in place* — same column, same width — not appear
as a new box elsewhere. Stage P's **Stop** and **Switch model** are the user's escape
hatches precisely because the system will otherwise keep trying forever.

### 3.4 Fix: keep `status.action`

`normalizeSessionStatusValue` currently drops `status.action`
(`packages/web/src/state/session-status.ts`). Preserve it. Stage A depends on it, and it's
how OpenCode surfaces free-tier / account-rate-limit dialogs. This is a real capability we
currently throw away.

---

## 4. Terminal errors, redesigned

The part you said you didn't know how to design. Here is the whole thing.

### 4.1 Rules for every terminal card

1. **Human headline, never the schema name.** `APIError`, `MessageOutputLengthError`, etc.
   never appear in the face of the card. They move to "Details".
2. **Exactly one primary action** — the single most useful next step. At most one secondary.
3. **Calm, not alarming.** Red as an *accent* (icon + thin edge + faint tint), not a
   full-bleed saturated box. Fades in once, then holds still. No pulsing red.
4. **Progressive disclosure.** One headline line, one optional detail line. Raw text, status
   codes, JSON, provider names all live behind **Details** + **Copy**.
5. **Tone matches cause.** Auth reads as "needs setup", content-filter as informational,
   overload as "try again", context as "too long" — not all as "ERROR".
6. **Per-category icon.** Scannable, and carries meaning for color-blind users so red isn't
   doing all the work.

### 4.2 The map: runtime → user

Every runtime discriminant (and the pre-message setup failures) maps to one user category
with fixed copy and actions.

| Runtime source | Category | Tier | Icon | Headline | Detail | Primary | Secondary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ProviderAuthError` (or 401/403 API) | `auth` | 2 | key | "This model needs to be connected" | "Add your {provider} API key to continue." | Open settings | — |
| `APIError` rate-limit (terminal) | `rate_limit` | 2 | clock | "You've hit the model's rate limit" | "Wait a moment, or switch models." | Try again | Switch model |
| `APIError` 5xx / overloaded (terminal) | `overloaded` | 2 | activity | "The model is overloaded right now" | "This usually clears up quickly." | Try again | Switch model |
| `APIError` connection/transport | `network` | 2 | plug | "Couldn't reach the model" | "Check your connection and try again." | Try again | — |
| `ContextOverflowError` (compaction off) | `context` | 2 | layers | "This conversation is too long for the model" | "Compact it to keep going, or start fresh." | Compact & continue | New session |
| `ContentFilterError` | `content` | 2 (info) | shield | "The model stopped this response" | "It was blocked by the provider's content filter. Try rephrasing." | Dismiss | — |
| `StructuredOutputError` | `format` | 2 | braces | "The model couldn't return a valid result" | "This happens occasionally — try again." | Try again | — |
| `MessageOutputLengthError` | `truncated` | **note** if visible text, else **2** | scissors | "Response was cut off at the model's length limit" | — | Continue | — |
| setup failure **with** an `assistantMessage.error` | `setup` | 2 | wrench | "Couldn't start this turn" | *(specific reason)* | *(context)* | Dismiss |
| `UnknownError` / anything unmapped | `unknown` | 2 | alert | "Something went wrong" | "Try again. If it keeps happening, copy the details." | Try again | Copy details |
| `MessageAbortedError` | `stopped` | divider | — | "Stopped" | — | — | — |

Notes:

- **Truncated** is not a failure — the model produced content up to the cap. **When there is
  visible text**, it renders as a muted inline note under that text with a **Continue**
  action, not a red card. **When truncation left no visible text**, there's nothing to
  annotate, so it falls back to a calm terminal card — still not styled as a hard error.
  Either way this fixes the current bug where the card shows `MessageOutputLengthError` as
  *both* the label and the message.
- **Content-filter** offers no "Try again" — re-sending identical content won't help.
  Rephrasing will.
- **Setup** errors split by whether an assistant message exists. If the runtime created the
  assistant message before failing, its `assistantMessage.error` renders a normal card. If it
  threw *before* any assistant message — so only `session.error` fired, with nothing to anchor
  to — we do **not** fabricate a transcript card from `session.error`; it surfaces as an
  operational toast instead (§5.1, §6.2). This keeps the rule absolute: **the transcript is
  fed only by `assistantMessage.error`.**
- The recoverable/continuing `session.error` variants (file/dir read fallback, auto-compaction)
  are **not** in this table — they never become terminal cards (§5.3).

### 4.3 Card anatomy

```
┌─────────────────────────────────────────────────────────┐
│ ⛌  This conversation is too long for the model           │   ← icon + headline
│    Compact it to keep going, or start fresh.             │   ← detail (muted)
│                                                          │
│    [ Compact & continue ]   New session      Details ▸   │   ← primary / secondary / disclosure
└─────────────────────────────────────────────────────────┘
      thin critical edge, faint critical tint — not a solid red block
```

Expanded "Details" reveals: the schema name, the raw message, status code / response body
if present, and a **Copy** button (copies the raw, not the friendly text — so a copied
report is diagnosable).

### 4.4 Actions inventory

| Action | Behavior (composed from existing SDK endpoints — no new contract) |
| --- | --- |
| Try again | **Revert to the failed user turn, then resend it** (`session.revert` to that message → `session.prompt`). A bare resend appends a *new* turn instead of rerunning the failed one — the revert step is what makes it a true retry. |
| Stop | Abort the running / retrying request (`session.abort`). This is what actually ends the otherwise-indefinite retry loop. |
| Switch model | **Abort, set the session model, resend.** Changing the model alone only affects the *next* turn; it does not interrupt an in-flight retry. |
| Open settings | Deep-link to provider/credentials settings. |
| Compact & continue | **Multi-step**: run compaction (summarize), then resend. There is no atomic "compact-and-rerun" primitive — flag it as heavier. |
| New session | Start a **genuinely empty** session — not a fork. A fork copies the conversation, so it would carry the same overflow forward; only an empty session (or Compact & continue) actually clears the tokens. |
| Continue | Resend, asking the model to continue the truncated response. |
| View limits | Follow `status.action.link` (usage-limit case). |
| Copy details | Copy the raw error payload. |
| Dismiss | Collapse the note (informational cases only). |

None of these need a new backend contract — they compose `session.revert`, `session.abort`,
`session.prompt`, and model selection, all already exposed by the SDK. What's new is the
**client-side orchestration** (e.g. Try again = revert-then-resend), which lives in
`packages/web` / `packages/buddy`, never in vendor.

---

## 5. Operational errors + recovery: retire the dock

The composer dock (`DirectoryChatState.error`) is the single biggest source of pain: one
untyped string, 20+ writers, mixed scopes, cleared by unrelated activity, and a mirror of
the transcript card. **Retire it as an error surface** and split its jobs by scope.

### 5.1 Operational toast (Tier 3)

Non-turn failures — session-list load, transcript load, provider-catalog load, fork / undo
/ redo / update mutations, a prompt submit that never created a turn — become a typed,
transient toast:

```ts
type OperationalError = {
  source: "session-list" | "transcript" | "catalog" | "mutation" | "submit" | ...
  severity: "error" | "warning"
  message: string          // classified, product language
  action?: ErrorAction     // e.g. Retry load
  fingerprint: string      // dedup
}
```

Dismissible, auto-expiring (≈8s for non-blocking), deduplicated within a window, rendered
outside the transcript. It never mirrors a turn card.

### 5.2 Composer states that aren't "errors"

- **No model configured** → not an error. A composer *setup hint* / disabled state:
  "Connect a model to start chatting →". This is an empty state, not a red bar.
- **Submit failed** (the message didn't leave) → a small inline composer error tied to the
  send action: "Message didn't send. Retry." — because it's about the thing the user just
  did, right where they did it.

### 5.3 Recovery events never turn red

- **Auto-compaction** (runtime-initiated when context fills mid-turn) has **no client-visible
  signal** on the current contract. `needsCompaction` is server-internal and never published;
  and `session.info.time.compacting` — despite existing in the schema and being read by
  `isSessionWorking` — is **never actually assigned by the runtime** (it's only ever plumbed
  through storage). So runtime-initiated compaction can't earn its own "Compacting…" label; it
  simply reads as a normal **Tier 0** working row — the turn is still going. What we *must*
  stop: today Buddy marks the session not-running, forces idle, and writes the context error
  into the dock — a red flash on a recovery path. Stop all three. (Client-*initiated*
  compaction — the "Compact & continue" action — is the exception: the client owns that flow,
  so it can show its own "Compacting the conversation…" progress until the call resolves.)
- **File/dir read fallback** (runtime inserts synthetic text and continues) is **benign**.
  At most a muted inline note on the user message ("Couldn't read `X` — continued without
  it."). Never idle, never red.

---

## 6. State architecture

The fix underneath the visuals: **one source of truth per concern, and one classifier.**

### 6.1 One classifier

One classification path feeds every surface, so retry text, terminal cards, and toasts can
never diverge (today `formatMessageError` and `readSessionErrorMessage` are two different
extractors that disagree). But it's split by responsibility — classification, copy, and
dedup are **separate**, not one mega-function:

```ts
// 1) Pure classification — no copy, no actions, no dedup.
type ErrorCategory =
  | "auth" | "rate_limit" | "overloaded" | "network"
  | "context" | "content" | "format" | "truncated"
  | "setup" | "unknown" | "stopped"
type Disposition = "transient" | "terminal" | "recovering" | "benign"

function categorize(error: unknown): { category: ErrorCategory; disposition: Disposition }

// 2) Presentation — category → product copy + actions (the copy lock, §10).
type ErrorPresentation = {
  headline: string
  detail?: string
  primary?: ErrorAction
  secondary?: ErrorAction
}
function present(category: ErrorCategory, ctx: { provider?: string }): ErrorPresentation

// raw text is carried straight from the source, for Details/Copy only — never re-parsed.
```

Splitting these (per `AGENTS.md`'s maintainability priority) keeps classification testable in
isolation, lets copy live with i18n, and keeps action-wiring out of the pure path. **Dedup is
not here** — it belongs only to operational notifications (§6.3), because turn errors are
already de-duplicated by message identity. Used by: the retry notice (§3.2), the terminal card
(§4.2), the toast (§5.1).

### 6.2 Source of truth per concern

| Concern | Single source | Never sourced from |
| --- | --- | --- |
| Turn terminal error | `assistantMessage.error` (durable, turn-scoped) | `session.error`, the dock |
| Retry / working | `session.status` (transient) | anything durable |
| Compaction (recovery) | client-initiated "Compact & continue" flow (the client owns it) | `session.info.time.compacting` (schema-only, never assigned) and `needsCompaction` (server-internal) — neither is observable |
| Operational error | typed operational channel (§5.1) | the turn, the transcript |
| Notifications / logging | `session.error` → notification subsystem only | the transcript, the dock, the composer |

**`session.error` never renders in the transcript, the dock, or the composer — full stop.**
It carries no `messageID` and no terminal/recoverable discriminator (every publisher emits
only `{ sessionID, error }`, and some only `{ error }`), so the client cannot honestly attach
it to a turn. It feeds notifications/logging only, and must **not** force the session idle —
`session.status` owns lifecycle; `assistantMessage.error` owns turn errors.

Two `session.error` cases still need handling, and only these:

- **Setup failures with no assistant message** (agent/provider/command not found, which
  throw before a message exists) → an **operational toast** (§5.1), **not** a synthesized
  transcript card and **not** a composer error string. We never fabricate transcript rows from
  `session.error`. (The composer's own setup hint — "Connect a model…" — is driven by
  provider-availability state, *not* by `session.error`, so the full-stop rule above holds.)
- **Recoverable/benign** (compaction, read fallback) → §5.3; never an error surface.

### 6.3 Deduplication

Turn errors need **no** dedup: each lives on exactly one `assistantMessage.error`, rendered
once, keyed by `messageID`. The old "two/three red boxes" came from `session.error` mirroring
the same failure into the dock *and* the transcript — and that's gone structurally now that
`session.error` never renders in either (§6.2), not patched with a fingerprint check.

Dedup applies to **operational notifications only** (§5.1): collapse identical operational
failures within a short window via `fingerprint = hash(source + category + normalizedMessage)`.
That is the only place a fingerprint exists — and note it keys on `source`, not `sessionID +
raw`, so two genuinely distinct failures are never wrongly merged.

### 6.4 Vendor boundary — what we deliberately don't do

Everything above runs on contracts the runtime **already emits**, entirely within
`packages/web` (plus the adapter). No `vendor/opencode` edits, per `AGENTS.md`. Two tempting
shortcuts are explicitly rejected:

- **Don't add a `kind` discriminator to `session.error`.** That's a vendor change — and the
  design no longer needs it. Because `session.error` is demoted to notifications, its
  terminal-vs-recoverable ambiguity stops mattering; we never route it into the transcript
  where disposition would have to be inferred.
- **Don't synthesize `RetryPart` in the adapter.** The schema (`RetryPart`:
  `{ attempt, error: APIError, time.created }`, `schema/src/v1/session.ts:220`) already
  exists, but the runtime never emits it — the retry path only calls `status.set(…, {type:
  "retry"})`. Faking it client-side/adapter-side would look durable yet vanish on reconnect
  (it was never written to the message store), violating "predictable during reconnects."

This is a **hard limit, not a TODO.** The only thing that would upgrade retry history from
attempt-only heuristics to exact, durable, reconnect-safe data is emitting a real `RetryPart`
per attempt (with true elapsed via `time.created` and full classification via
`APIError.statusCode`) — and that is a runtime change we don't make. So the attempt-based
client design isn't a stopgap waiting on a patch; it *is* the design. Retry history stays
attempt-only, and that's fine.

---

## 7. Visual + motion language

So it actually looks great, and looks like one system.

**Color = recoverability.**

| State | Surface treatment |
| --- | --- |
| Working / quiet retry | Default foreground, subtle motion (shimmer/pulse). No chrome. |
| Retry notice (N/P) | **Amber**: soft `warning` tint, warning-colored spinner + countdown. |
| Terminal card | **Calm red**: category icon + thin `critical` left edge + faint `critical` tint. Headline medium weight; detail muted; actions as buttons; Details/Copy as quiet text buttons. |
| Toast | Neutral surface + status dot (amber/red), title + message + dismiss. |

**Motion.** Retries pulse (they're alive). Terminal cards fade in once and then hold
perfectly still — a failure should not keep grabbing the eye. No animated red.

**Iconography.** One icon per category (key, clock, activity, plug, layers, shield, braces,
scissors, wrench, alert). Icons make the ladder scannable and keep meaning legible without
relying on red.

**Density + alignment.** One line by default, expand for details. Cards share the
transcript's horizontal padding so they read as part of the turn, not floating UI. The
retry notice and the terminal card occupy the *same column and width*, so the N→2 hand-off
is a settle-in-place, not a jump.

**Tokens.** Reuse existing `critical` tokens but at lower saturation (edge + `/10` tint, not
solid). Add a `warning`/amber token set for Tier 1 if one isn't already present.

---

## 8. Accessibility

Fix the current three-different-roles inconsistency; make announcements deliberate.

| Surface | Role | Announcement |
| --- | --- | --- |
| Quiet retry | — | nothing |
| Retry notice | `role="status"`, `aria-live="polite"` | once on appear, once per stage change — **not** every countdown tick |
| Terminal card | `role="alert"`, `aria-atomic` | once; guard against virtualizer remount re-announcing (track announced fingerprints) |
| Toast | `status` (info) / `alert` (error) | once; **do not auto-focus** — even actionable toasts keep their action in normal focus order / behind a shortcut, so focus is never stolen mid-task |

Countdown ticks are `aria-hidden`; a stable polite summary carries the meaning.

---

## 9. Lifecycle rules (deterministic)

- **Retry notice**: shown iff `status === retry` and stage ≥ N. Hidden on `busy` or `idle`.
  Never survives the turn.
- **Terminal card**: derived purely from the stored message error. Durable. Replaced only
  when the turn is re-run / forked. **Never** cleared by `busy`, by another session's
  activity, or by unrelated loads. (Today the dock is cleared by all three — that goes away
  with the dock.)
- **Toast**: appears on operational failure, auto-expires (≈8s) unless blocking,
  dismissible, deduped within a window.
- **Compaction progress**: shown **only** while the client is running its own "Compact &
  continue" flow, cleared when that call resolves. There is no passive runtime signal to key
  off — `needsCompaction` is server-internal and `session.info.time.compacting` is never
  assigned (§5.3) — so runtime-initiated compaction shows no distinct progress; it just reads
  as a normal working row.
- **No cross-surface clearing.** With the dock-as-mirror gone, delete "busy clears the
  dock" and "any completed message clears the dock". Durable cards live and die with their
  turn.

---

## 10. Copy lock (current → proposed)

This is the canonical wording table — the easel's **Copy lock** view renders these same
rows so the team can sign off on every string in one place. "Today" is what actually renders
in the current build; "Proposed" is what we're locking. Final wording is still yours to tune,
but lock the *set* here.

### 10.1 Terminal cards

Today, **every** discriminant renders identically: an uppercase **"Assistant error"** label,
the raw **schema name**, and the **raw provider text** — via `AssistantErrorCard` +
`formatMessageError`. There is no per-category copy, no headline, no guidance. The lock
replaces that undifferentiated card with:

| Category | Today (renders now) | Proposed headline | Proposed detail |
| --- | --- | --- | --- |
| auth | `Assistant error` · `ProviderAuthError` · *raw 401 text* | This model needs to be connected | Add your {provider} API key to continue. |
| rate_limit | `Assistant error` · `APIError` · *raw 429 JSON* | You've hit the model's rate limit | Wait a moment, or switch models. |
| overloaded | `Assistant error` · `APIError` · `Overloaded` | The model is overloaded right now | This usually clears up quickly. |
| network | `Assistant error` · `APIError` · `Connection error…` | Couldn't reach the model | Check your connection and try again. |
| context | `Assistant error` · `ContextOverflowError` · *raw token counts* | This conversation is too long for the model | Compact it to keep going, or start fresh. |
| content | `Assistant error` · `ContentFilterError` · `finish_reason: content_filter` | The model stopped this response | Blocked by the provider's content filter. Try rephrasing. |
| format | `Assistant error` · `StructuredOutputError` · *raw* | The model couldn't return a valid result | This happens occasionally — try again. |
| truncated (note) | `Assistant error` · `MessageOutputLengthError` · `MessageOutputLengthError` | Response was cut off at the model's length limit | *(inline note under the visible text, not a red card — see §4.3)* |
| setup | `Assistant error` · `UnknownError` · *raw* | Couldn't start this turn | *(specific reason)* |
| unknown | `Assistant error` · `UnknownError` · *raw / empty* | Something went wrong | Try again. If it keeps happening, copy the details. |
| aborted | *(card suppressed today, but only sometimes — §4)* | Stopped | *(neutral divider, never red — not an error card)* |

### 10.2 Retry (session.status)

| Field | Today | Proposed |
| --- | --- | --- |
| headline | raw provider `message`, or `Retrying request` | overloaded → "The model provider is busy." · rate limit → "Hitting the model's rate limit." · network → "Reconnecting to the model." · unknown → "Retrying the request." |
| persistent stage | *(none — no stage concept today)* | "Still busy — this is taking longer than usual." / "Still rate limited — you can switch models." + **Switch model** / **Stop** |
| countdown | `Retrying in {n}s. Attempt #{k}.` / `Retrying now. Attempt #{k}.` | `Trying again in {n}s · attempt {k}` |
| color | **critical red** | **amber / warning** |

### 10.3 Operational (toast)

Today these strings land in the shared dock as raw text (`readSessionErrorMessage` →
"An error occurred"). Proposed — typed toasts, keyed by source:

- transcript load: "Couldn't load this conversation." / Retry
- session list: "Couldn't load your sessions." / Retry
- catalog: "Couldn't load available models." / Retry
- mutation: "That action didn't go through." / Retry
- submit (inline): "Message didn't send." / Retry
- setup-without-message (inline/toast): "Couldn't start this turn — {reason}."

### 10.4 Composer setup hint

Replaces today's raw "No provider available"-style dock string:

- "Connect a model to start chatting →"

---

## 11. Implementation plan

Each phase is independently shippable and independently valuable.

**Phase 0 — Foundations.** Build `classifyError` (§6.1). Preserve `status.action` in
`normalizeSessionStatusValue` (§3.4). No visible change yet.

**Phase 1 — Stop the duplication (highest UX win, lowest risk).** `session.error` no longer
writes the dock, the transcript, or forces idle; it routes to notifications/logging only
(§6.2). `assistantMessage.error` becomes the sole transcript error source. Result: the
two/three-red-box screenshots collapse to one card — structurally, so no dedup heuristic is
needed on the turn-error path.

**Phase 2 — Retry as recovery.** Implement stages Q/N/P/A (§3); restyle the notice amber;
source its text from the classifier; render the usage-limit action.

**Phase 3 — Terminal taxonomy + card.** Rebuild `AssistantErrorCard` with
headline/detail/actions/Details (§4). Hide schema names. Fix output-length duplication
(→ truncated note). Fix content-filter tone. Fix the abort-suppresses-a-real-error bug
(only suppress the card when the turn's *terminal* error is itself abort-like, not when any
message in the turn was aborted).

**Phase 4 — Operational surface.** Typed toast (§5.1); composer setup hint + inline submit
error (§5.2); retire `DirectoryChatState.error` as a shared string.

**Phase 5 — Recovery states.** Progress for the client-initiated "Compact & continue" flow
(no passive runtime signal to observe — §5.3) + read-fallback note.

**Phase 6 — Tests.** Rendering matrix (category × tier), dedup, compaction, fallback,
session switch, escalation thresholds, action wiring, single-announcement. Closes the gaps
the audit lists under "Existing test coverage".

Phases 1–3 alone resolve every failure mode in the audit's "Confirmed current-state failure
modes" list except the ones Phase 4–5 own (mixed-scope dock string, recovery-as-terminal).
There is no vendor phase: everything ships in `packages/web` / `packages/buddy`.

---

## 12. Calls I made — and the ones that are yours

Made these calls (say the word to change them):

- **Escalation thresholds** attempt 3 (Notice) / 5 (Persistent). **Attempt-only** — the
  elapsed-time thresholds from the first draft were removed because the contract carries no
  client-visible elapsed for the *current* attempt (only `next`, the countdown to the *next*
  one). Server-authored `attempt` is the one signal that survives reconnect.
- **Truncated and content-filter are not treated the same as failures.** Truncated → inline
  note + Continue, and only when visible text exists (otherwise a calm terminal card);
  content-filter → calm informational card, no Try again.
- **Retire the dock entirely** rather than keep a slimmer version. Operational errors go to
  toasts (transient) or persistent inline placeholders (blocking loads). A **submit** failure
  (the client's own prompt call rejecting) goes inline in the composer; a
  **setup-without-message** failure (which arrives only via `session.error`) goes to a toast —
  never the composer.
- **"Try again" = revert + resend** (`session.revert` then `session.prompt`), not a bare new
  submit. For truncation the action is "Continue"; during a live retry the escape hatches are
  Stop (`session.abort`) and Switch model (abort + select + resend).

Resolved by the source check (no longer open):

- **Vendor contract** — settled: no `vendor/` edits (AGENTS.md §37), and none deferred either.
  `session.error` is demoted to notifications/logging, so it needs no `kind` discriminator.
  Durable retry history would need runtime `RetryPart` emission — a vendor change we don't
  make — so it's out of scope, not a pending phase, and retry history stays attempt-only
  (§6.4). No adapter-synthesized `RetryPart` — it would fake durability and vanish on reconnect.

Genuinely your calls:

1. **Threshold feel** — surface retries *earlier* (Notice at attempt 2) for transparency, or
   *later* (attempt 4) for calm? Current default: attempt 3.
2. **Auth/rate-limit dead-ends** — should "Switch model" be a first-class button on those
   cards, or a quieter link? (It's a 3-step action: abort + select + resend.)
3. **Operational surface** — toast (my lean) vs. a single persistent inline strip, for the
   *transient* operational errors. Blocking loads get a persistent inline placeholder either
   way.
