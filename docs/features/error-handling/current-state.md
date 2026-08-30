# Transcript errors: historical audit (2026-07-22)

Status: **historical audit**. Do not treat this file as current product behavior.
Audited: 2026-07-22
Scope at audit time: non-tool errors and retry states visible in or immediately around the chat transcript
Source basis at audit time: the 2026-07-22 working tree, including the vendored OpenCode app and runtime

This document is a dated failure analysis. It preserves contracts, event publication sites,
compaction/read-fallback lessons, and OpenCode desktop comparisons from that audit.

**Current Buddy `session.error` behavior (verify in code, not in the historical sections below):**
`packages/web/src/lib/directory-chat/use-chat-sync.ts` handles `session.error` as
notification-only. It ignores non-parent sessions and abort-like errors, then calls
`appendErrorNotification` and optionally `platform.notify`. It does **not** mark the session
idle, does **not** mark the transcript not-running, and does **not** write
`DirectoryChatState.error`. Session lifecycle stays on `session.status`. Terminal turn copy
comes from `assistantMessage.error` via `packages/web/src/state/chat-error-model.ts` and
`packages/web/src/components/chat/assistant-error-card.tsx`. Retry `status.action` is preserved
by `normalizeSessionStatusValue` in `packages/web/src/state/session-status.ts`.

Where later sections say “Buddy currently” about `session.error`, retry `action` dropping, or
the undifferentiated assistant-error card, that language describes **2026-07-22**, not the tree
now. Line numbers cited in historical sections were true at audit time and must not be used as
live pointers.

## Executive summary

The current system has three independent red-box presentation paths:

1. A retry row inside the transcript, derived from `session.status.type === "retry"`.
2. A durable assistant-error row inside the transcript, derived from
   `assistantMessage.error`.
3. A directory-level error dock above the composer, derived from a single untyped
   `DirectoryChatState.error` string.

The first two are turn-oriented transcript rows. The third is outside the transcript scroll area
and is shared by session runtime failures, prompt submission failures, transcript-loading failures,
provider-catalog failures, permission/question failures, session mutations, and several locally
generated validation errors.

OpenCode currently defines eight assistant-error discriminants. The set of discriminants is finite,
but the set of messages is not: most error variants contain an arbitrary string originating in a
provider, SDK, runtime, plugin, configuration lookup, or local operation.

The principal source of duplicate visible errors is that one terminal runtime failure can be
represented twice:

- as a durable error on an assistant message; and
- as a transient `session.error` event.

Buddy renders the durable message error in the transcript and also converts the event into the
directory-level composer dock. These are two projections of the same underlying failure.

The `session.error` event is not semantically terminal. OpenCode also publishes it for operations
that continue or automatically recover, including automatic context compaction and failed file or
directory reads that are replaced with synthetic fallback text.

**Historical failure (2026-07-22, the lesson to keep):** Buddy treated every non-abort parent
`session.error` as terminal UI: it marked the session non-running, forced idle, and populated the
composer dock. That made recoverable compaction and read fallbacks look like hard failures.

**Current behavior:** that path is gone. `session.error` is notification-only (see the header).
Do not reintroduce idle/dock writes from this event.

OpenCode's own desktop app separates these sources differently. Its transcript derives retry rows
from session status and durable error rows from assistant messages. Its session-state reducer does
not use `session.error`; that event is consumed by its notification subsystem instead. Its visual
treatment remains raw and inline, but the state ownership is less ambiguous than Buddy's current
ownership.

## Scope boundaries

Included:

- assistant-message errors;
- session retry status;
- interruption/abort handling where it replaces an error card;
- `session.error` events;
- the directory-level error string and dock;
- prompt and session operations that write into the same dock;
- provider/runtime message normalization;
- OpenCode desktop/app behavior for the same sources;
- the five supplied screenshots.

Excluded:

- tool-state failures rendered by `ToolErrorPanel` or tool-specific renderers;
- reader, media renderer, editor, settings, onboarding, and catalog-drawer errors that do not enter
  the transcript or its composer-level dock;
- generic React error boundaries and full-page route errors;
- operating-system notifications except where they consume `session.error` and clarify ownership.

## Vocabulary

### Assistant-message error

A durable error stored on an assistant message as `assistantMessage.error`. It is returned when
message history is loaded and survives reopening the session.

### Session status

The current lifecycle state for a session. The SDK contract has three states: `idle`, `busy`, and
`retry`. Retry contains an attempt number, a raw message, the next retry timestamp, and an optional
structured action.

### Session error event

An event named `session.error`. Its payload contains only an optional session ID and an optional
assistant-error object. It has no message ID, terminal flag, recovery flag, operation, severity, or
display disposition.

### Directory error

An optional string stored at `DirectoryChatState.error`. It is not an assistant-error object and has
no category, source, session ID, message ID, timestamp, action, severity, or lifecycle metadata.

### Transcript row

A virtualized row projected from messages and active session state. Retry and assistant errors are
ordinary transcript rows with stable turn-relative keys.

## OpenCode and SDK data contracts

### Session status

The generated SDK defines:

```ts
type SessionStatus =
  | { type: "idle" }
  | {
      type: "retry"
      attempt: number
      message: string
      action?: {
        reason: string
        provider: string
        title: string
        message: string
        label: string
        link?: string
      }
      next: number
    }
  | { type: "busy" }
```

Source: `packages/sdk/src/gen/types.gen.ts:356-373`.

Buddy aliases `SessionStatusInfo` directly to this generated type in
`packages/web/src/state/chat-types.ts`.

`normalizeSessionStatusValue` accepts both legacy string values (`"busy"`, `"idle"`) and object
values. Invalid or unknown values become idle. A malformed retry uses:

- attempt `1`;
- message `"Retrying request"`;
- `Date.now()` as the next retry time.

**Historical (2026-07-22):** normalization kept `type`, `attempt`, `message`, and `next`, and
dropped `action` even though the generated contract includes it.

**Current:** `normalizeSessionStatusValue` in `packages/web/src/state/session-status.ts` parses
`action` with `retryActionSchema` and preserves it on retry status. `retryStage` in
`packages/web/src/state/chat-error-model.ts` treats a present `status.action` as stage
`actionable`. `SessionRetryNotice` in `packages/web/src/components/chat/session-retry-notice.tsx`
renders that action.

Source (current): `packages/web/src/state/session-status.ts` (`normalizeSessionStatusValue`).

### Assistant-error discriminants

The current OpenCode schema and generated SDK contain exactly eight assistant-error variants:

| Discriminant | Data fields | Runtime meaning in the current source |
| --- | --- | --- |
| `ProviderAuthError` | `providerID`, `message` | Provider credential or API-key loading failure. |
| `UnknownError` | `message`, optional `ref` | Catch-all runtime, configuration, lookup, or otherwise unclassified failure. |
| `MessageOutputLengthError` | empty/open data object | Provider stopped because the response reached its output limit. |
| `MessageAbortedError` | `message` | Turn was aborted, cancelled, or interrupted. |
| `StructuredOutputError` | `message`, `retries` | A required structured response was not produced. |
| `ContextOverflowError` | `message`, optional `responseBody` | The request exceeded the model context window. |
| `ContentFilterError` | `message` | The provider ended or blocked the response through a content filter. |
| `APIError` | `message`, optional `statusCode`, `isRetryable`, optional headers/body/metadata | Provider API, transport, capacity, rate-limit, server, or network failure. |

Sources:

- `vendor/opencode/packages/schema/src/v1/session.ts:385-395`
- `packages/sdk/src/gen/types.gen.ts:416-493`

The generated contract is finite, but Buddy widens the frontend representation:

```ts
type MessageError = {
  name: SdkAssistantError["name"] | string
  message?: string
  data?: unknown
  [key: string]: unknown
}
```

This allows partial incremental payloads and future or custom names to reach the UI without being
rejected. Consequently, the actual frontend name space is open even though the current SDK union
contains eight names.

Source: `packages/web/src/state/chat-types.ts:28-35`.

### The `session.error` event

The schema is:

```ts
{
  type: "session.error"
  properties: {
    sessionID?: string
    error?: AssistantError
  }
}
```

The event reuses the assistant-error schema but does not declare whether the event represents a
terminal turn, a recoverable condition, a warning, a control-flow transition, or a notification.

Source: `vendor/opencode/packages/schema/src/v1/session.ts:651-657`.

## OpenCode runtime production of errors

### Converting thrown failures into assistant errors

`MessageV2.fromError` maps runtime failures into the assistant-error union:

- `AbortError` DOM exceptions become `MessageAbortedError`.
- output-length failures remain `MessageOutputLengthError`.
- API-key loading failures become `ProviderAuthError`.
- `ECONNRESET` becomes retryable `APIError` with message `"Connection reset by server"`.
- Bun decompression failures become retryable `APIError`, unless the request was already aborted.
- provider response-header timeouts become retryable `APIError`.
- provider response-stream failures become retryable `APIError`.
- provider SDK `APICallError` values are parsed into either `ContextOverflowError` or `APIError`.
- ordinary JavaScript `Error` values become `UnknownError`.
- non-`Error` stream payloads are parsed as provider stream errors where possible; otherwise they
  become `UnknownError` containing `JSON.stringify(value)`.

Source: `vendor/opencode/packages/opencode/src/session/message-v2.ts`, function `fromError`.

### Retry classification

OpenCode's retry policy treats a failure as retryable under the following current rules:

- `ContextOverflowError` is explicitly not retried by the retry policy.
- `APIError` is retried when `isRetryable` is true.
- Any `APIError` with an HTTP status of 500 or above is retried even when its SDK-provided
  `isRetryable` value is false.
- A response body containing `FreeUsageLimitError` produces a free-tier action.
- A response body containing `GoUsageLimitError` produces an account-rate-limit action with a
  generated reset description and settings link.
- An API message containing `Overloaded` is presented to the retry status as
  `"Provider is overloaded"`.
- Plain messages containing `rate increased too quickly`, `rate limit`, or `too many requests` are
  treated as retryable.
- JSON error payloads with `too_many_requests` produce `"Too Many Requests"`.
- JSON codes containing `exhausted` or `unavailable` produce `"Provider is overloaded"`.
- Nested JSON error codes containing `rate_limit` produce `"Rate Limited"`.

The retry delay starts at 2 seconds and doubles per attempt. Without retry headers it is capped at
30 seconds. `retry-after-ms` and `retry-after` response headers are honored and capped at the maximum
32-bit signed integer timeout.

For each attempt, the processor sets session status to `retry` with `attempt`, `message`, optional
`action`, and `next`. A new attempt sets status back to `busy` before opening the model stream.

Sources:

- `vendor/opencode/packages/opencode/src/session/retry.ts`
- `vendor/opencode/packages/opencode/src/session/processor.ts:627-676`

### `session.error` publication sites

The current runtime has thirteen explicit `Session.Event.Error` publication sites: ten in
`session/prompt.ts` and three branches in `session/processor.ts`.

| Location | Condition | Subsequent runtime behavior visible in source |
| --- | --- | --- |
| `prompt.ts:318` | Requested task/subagent is not found. | Publishes `UnknownError`, then throws. |
| `prompt.ts:466` | Shell request agent is not found. | Publishes `UnknownError`, then throws. |
| `prompt.ts:604` | Selected provider model is not found. | Publishes `UnknownError`, then fails the lookup. |
| `prompt.ts:642` | Prompt agent is not found while creating the user message. | Publishes `UnknownError`, then throws. |
| `prompt.ts:894` | A referenced file cannot be read while creating the user message. | Publishes `UnknownError`, then inserts synthetic fallback text and continues. |
| `prompt.ts:916` | A referenced directory cannot be read while creating the user message. | Publishes `UnknownError`, then inserts synthetic fallback text and continues. |
| `prompt.ts:1175` | The active agent from the latest user message is no longer found. | Publishes `UnknownError`, then throws. |
| `prompt.ts:1306` | Provider finishes with `content-filter`. | Stores `ContentFilterError` on the assistant message, publishes the event, then ends the turn. |
| `prompt.ts:1367` | Slash command is not found. | Publishes `UnknownError`, then throws. |
| `prompt.ts:1428` | Agent selected for a slash command is not found. | Publishes `UnknownError`, then throws. |
| `processor.ts:611` | Context overflow with automatic compaction disabled. | Stores the error on the assistant message, marks finish `error`, publishes, and sets idle. |
| `processor.ts:616` | Context overflow with automatic compaction enabled. | Sets `needsCompaction`, publishes, and returns so the loop can create an automatic compaction. The error is not attached to that assistant message in this branch. |
| `processor.ts:620` | Any other model/stream processing failure after retry handling. | Stores the error on the assistant message, publishes, and sets idle. |

The event therefore represents several different facts:

- a durable terminal assistant failure;
- a terminal failure before an assistant message is available;
- a recoverable control-flow transition into compaction;
- a non-terminal input/resource read failure that has an in-band fallback;
- an abort, which is later filtered specially by Buddy.

### Error storage without a `session.error` event

Not every durable assistant error publishes `session.error` at the point where it is created.
`StructuredOutputError` is stored on the assistant message when a required JSON-schema response is
not produced, but that branch does not publish `Session.Event.Error`.

Source: `vendor/opencode/packages/opencode/src/session/prompt.ts:1309-1315`.

This creates an observable difference in Buddy: a structured-output failure can produce the durable
transcript card without producing the directory-level dock through the event path.

## Buddy event ingestion and state ownership

### Session-status events

On `session.status`, Buddy:

1. normalizes the status;
2. seals active assistant messages when the new status is idle;
3. updates working-session notification tracking;
4. records whether the transcript session is running;
5. writes the status into `sessionStatusByID`;
6. clears the directory error when the active session enters `busy`.

Retry status remains an active/working status. `isSessionStatusActive` returns true for both `busy`
and `retry`.

Source (audit-time line numbers, do not reuse): `use-chat-sync.ts` session-status branch.

### Session-error events

**Current (notification-only):** on `session.error`, Buddy:

1. Reads the optional event session ID.
2. Ignores the event when it belongs to a non-parent/subagent session.
3. Ignores abort-like errors and returns.
4. Formats the event error for notification text via `readSessionErrorMessage`.
5. Appends an in-app error notification (`appendErrorNotification`).
6. Optionally sends an operating-system notification when error notifications are enabled.
7. Returns without changing session status, running flags, or `DirectoryChatState.error`.

Source: `packages/web/src/lib/directory-chat/use-chat-sync.ts` (`payload.type === "session.error"`).
Helper: `appendErrorNotification` in the same file.

**Historical (2026-07-22, do not restore):** the same event also marked the transcript not
running, applied idle, treated abort as a dock-clearing interruption, and wrote every other
error into `DirectoryChatState.error`. The event still has no terminal/recoverable flag, which
is why routing it into session lifecycle and the dock was the failure mode.

There is still no check on the event itself for:

- whether a durable assistant message already contains the same error;
- whether the runtime remains busy;
- whether the event represents automatic compaction;
- whether the input read recovered with fallback text;
- whether a message ID exists;
- whether the event has already been displayed;
- whether the event is terminal.

Those gaps are why the current design keeps `session.error` off the transcript and dock.

### Message-update events

On `message.updated`, Buddy writes the message into the transcript repository. When a completed
assistant message has no error, it clears the directory error. A completed assistant message with an
error does not clear the dock.

Source: `packages/web/src/lib/directory-chat/use-chat-sync.ts:450-476`.

### Directory error storage

`setDirectoryError` directly replaces the optional string on the directory state. It keeps no
history and performs no deduplication or source tracking.

Source: `packages/web/src/state/chat-store.ts:519-527`.

The directory error is runtime state, not persisted state. `chat-store` persistence includes active
directory/session and reading-resource selections, but not `directories` or their error strings.

Changing the selected session inside the same directory does not inherently clear the directory
error. Session-selection reducers spread the existing directory state and retain `error`. The normal
`selectSession` action subsequently loads the selected transcript, and a successful load clears the
error; the selection state transition itself does not.

### Other writers to the same directory error

The same string is used for errors unrelated to an assistant-message failure. Current writers
include:

- loading the session list;
- loading the active transcript;
- loading permissions;
- loading questions;
- loading the provider catalog;
- opening/loading a directory session;
- sending a prompt;
- sending a slash command;
- manually compacting a session;
- aborting a prompt when recovery checks fail;
- undo/revert mutations;
- redo/restore mutations;
- forking a session;
- updating a session;
- opening existing folders and other current-directory controller operations;
- attempting compaction without a model or session;
- attempting a slash command with unsupported native-resource attachments;
- receiving a parent-session `session.error` event.

Most API/action failures reach this string through `stringifyError`, which returns:

- `Error.message` for JavaScript errors;
- the original string for string failures;
- `JSON.stringify(value)` when possible;
- `String(value)` as the final fallback.

Source: `packages/web/src/lib/api-client.ts`.

SDK results are commonly converted into thrown `Error` values by `requireBuddyData` or
`buddyResultMessage`. These helpers recursively look for nested `error` or `message` fields and use
generic messages such as `"Request failed"`, `"Request failed (STATUS)"`, or
`"Request failed (no response)"` when no message is available.

Source: `packages/web/src/lib/buddy-client.ts:25-68`.

### Directory error clearing

The directory error is cleared by multiple independent operations, including:

- starting a new prompt or command;
- starting or selecting draft/canonical session flows in several action paths;
- a `session.status` event that moves the active session to `busy`;
- a completed assistant message with no error;
- successful session, message, permission, question, provider, and update loads/mutations;
- a recovered abort attempt;
- an abort-like `session.error` event.

Because writers and clearers cover unrelated operations, the lifetime of the dock string depends on
later directory activity rather than solely on the failure that created it.

## Buddy transcript projection

### Turn construction

`projectTimelineRows` groups messages into turns. For each turn it:

- flattens assistant parts;
- identifies whether any assistant message was aborted;
- finds the last non-abort assistant error in the turn;
- formats that error into display text;
- projects assistant content/activity rows;
- appends an interruption divider, retry row, or error row according to current state.

Sources:

- `packages/web/src/components/chat/chat-timeline-rows.ts:196-210`
- `packages/web/src/components/chat/chat-timeline-rows.ts:287-307`

### Abort behavior

A turn is considered aborted when any assistant message either:

- has finish reason `aborted`, `cancelled`, or `interrupted`; or
- has an abort-like error.

Abort-like detection accepts:

- names `MessageAbortedError`, `AbortError`, and `Cancelled`;
- exact messages `aborted`, `cancelled`, and `interrupted`;
- any message containing `abort`, `cancel`, or `interrupt`, including `data.message`.

An aborted turn receives a `Stopped` divider. The assistant error row requires `!aborted`, so the
presence of an abort anywhere in the turn suppresses a red error row even if the turn also contains
a different non-abort assistant error.

Sources:

- `packages/web/src/state/chat-error.ts`
- `packages/web/src/components/chat/chat-timeline-rows.ts:410-417`

### Retry-row rule

A retry row is appended only when:

- the turn is the last visible turn; and
- the active session status is `retry`.

Its key is `retry:${userMessageID}`. It is part of the virtualized scroll content, after the current
turn's assistant/activity content.

Source: `packages/web/src/components/chat/chat-timeline-rows.ts:419-426`.

### Assistant-error-row rule

An assistant error row is appended when:

- formatted error text is non-empty;
- the turn is not considered aborted; and
- the session is not considered busy.

Its key is `error:${userMessageID}`. It is durable because it is reconstructed from stored assistant
messages whenever history is loaded.

**Historical (2026-07-22):** the error name was displayed unless it was exactly `UnknownError`.
Schema names such as `APIError` were exposed as technical labels.

**Current:** `createAssistantErrorCardSpec` in `assistant-error-card.tsx` maps
`AssistantErrorCategory` from `chat-error-model.ts` to product headlines (for example
"You've hit the model's rate limit", "Couldn't reach the model"). Schema names stay in
diagnostics/details, not as the card face.

Source (current): `packages/web/src/components/chat/assistant-error-card.tsx`,
`packages/web/src/state/chat-error-model.ts`.

### Row layout and virtualization

Retry and error rows are ordinary virtualized timeline rows. Both receive an estimated height of
96 pixels. Their articles use the same transcript horizontal padding as other turn rows. Their
vertical location is determined by turn order and the virtualizer; they are not overlays or fixed
elements.

Source: `packages/web/src/components/chat/chat-transcript.tsx:229-249` and `:764-782`.

### Assistant error card

**Historical (2026-07-22):** `AssistantErrorCard` was an undifferentiated critical box: fixed
uppercase `Assistant error` label, technical name, raw formatted message, copy of that message
only. No retry, settings, or details disclosure.

**Current:** `createAssistantErrorCardSpec` builds per-category headline, detail, and actions
(`try-again`, `open-settings`, `compact-and-continue`, `new-session`, `dismiss`, `continue`,
`copy-details`, `stop`). `directory-chat-main-pane.tsx` mounts that card from
`resolveLatestTerminalAssistantError`, not from `session.error`.

Source: `packages/web/src/components/chat/assistant-error-card.tsx`,
`packages/web/src/components/directory-chat/directory-chat-main-pane.tsx`.

### Retry notice

**Historical (2026-07-22):** `SessionRetryNotice` used the same critical red family as terminal
errors, showed the raw retry message, and **did not** render `status.action`.

**Current:** quiet retries (`attempt` below `RETRY_NOTICE_MIN_ATTEMPT` = 3, and no action) render
nothing. Notice/persistent stages use `buildRetryStateModel`. When `status.action` is present,
stage is `actionable` and `RetryActionCard` renders the structured action. Attempt thresholds:
notice at 3, persistent at 5 (`RETRY_PERSISTENT_MIN_ATTEMPT`).

Source: `packages/web/src/components/chat/session-retry-notice.tsx`,
`packages/web/src/state/chat-error-model.ts` (`retryStage`, `buildRetryStateModel`).

### Directory error dock

**Historical (2026-07-22):** a raw-string dock sat after the transcript `ScrollArea` and before
the composer, fed in part by `session.error`. Audit citation `directory-chat-main-pane.tsx:398-404`
is stale.

**Current:** that raw dock is not what sits above the composer. `directory-chat-main-pane.tsx`
renders classified `AssistantErrorCard` from `resolveLatestTerminalAssistantError`.
`DirectoryChatState.error` / `setDirectoryError` still exist for operational writers in
`chat-actions.ts` and `use-directory-chat-page-controller.ts`, but they are not the
`session.error` path and are not the old untyped red dock described in this audit. Retiring the
remaining string writers is still an open design item in `proposed-design.md` §5.

Source: `packages/web/src/components/directory-chat/directory-chat-main-pane.tsx`,
`packages/web/src/state/chat-store.ts` (`setDirectoryError`).

## Message extraction and normalization

### Assistant-message formatter

`formatMessageError` accepts an unknown object and chooses the first non-empty value in this order:

1. top-level `message`;
2. `data.message`;
3. `name`.

If no such string exists, the error produces no transcript error row.

The selected string passes through `unwrapError`, which:

- removes a leading `Error:` for parsing purposes;
- attempts to parse the entire string as JSON;
- if the first parse returns a string, attempts to parse that string as JSON again;
- otherwise searches from the first `{` to the last `}` and parses that substring;
- extracts nested `error.type`, `error.message`, `error.code`, top-level `message`, or a string
  `error` field;
- returns the original message when no record-shaped JSON payload is found.

For nested error objects with both `type` and `message`, the output is `type: message`.

Source: `packages/web/src/components/chat/utils/error.ts`.

### JSON-string quotation behavior

For a message that is itself a JSON string such as:

```text
"Streaming response failed"
```

the first JSON parse returns the plain string `Streaming response failed`. The formatter then tries
to parse that plain string as JSON, receives `undefined`, finds no object substring, and returns the
original quoted input. This accounts for quotation marks visible in the supplied streaming-failure
screenshot.

OpenCode's desktop app currently contains substantially the same two-stage parser and exhibits the
same plain-JSON-string behavior in source.

### Provider-specific normalization

Buddy currently has two product-specific normalization patterns:

1. A Zen database message containing both `Failed query:` and `ip_rate_limit` becomes the localized
   message `The selected free model temporarily rate limited this network. Try again later, switch
   networks, or use another model.`
2. The exact message `Provider returned error` becomes the localized generic stream-failure message.
   The current English value is `Buddy's response was interrupted. Try again, or switch models if
   this keeps happening.`

When the message is the generic provider failure and `data.responseBody` contains structured JSON,
Buddy attempts to extract a more specific nested message from the response body.

All other strings pass through unchanged after the general JSON unwrapping described above.

Source: `packages/web/src/lib/upstream-provider-error.ts`.

### Directory/session-event formatter

`readSessionErrorMessage`, used for the directory dock and notifications, is separate from
`formatMessageError`. It chooses:

1. a direct non-empty string event error;
2. top-level `message`;
3. `data.message`;
4. `name`;
5. `"An error occurred"`.

It shares provider-specific normalization and generic response-body extraction, but it does not use
the assistant formatter's general embedded-JSON unwrapping. The durable card and directory dock can
therefore display different text for the same underlying error object.

Source: `packages/web/src/lib/directory-chat/chat-prompt-helpers.ts:127-165`.

### `MessageOutputLengthError` fallback

`MessageOutputLengthError` has no required `data.message`. For the generated runtime shape, the
assistant formatter falls back to the error name. The error card can consequently contain:

- heading: `ASSISTANT ERROR`;
- technical name: `MessageOutputLengthError`;
- message: `MessageOutputLengthError`.

This follows directly from the current contract and formatter fallback order.

## How one terminal failure becomes two boxes

For common provider/runtime terminal failures, the processor:

1. stores the normalized error on the assistant message;
2. publishes `session.error` containing that same error;
3. sets session status idle.

**Historical (2026-07-22):** Buddy then received two independently handled representations:

- `message.updated` stored the durable assistant error, from which the transcript projection created
  an `AssistantErrorCard`;
- `session.error` wrote the formatted string to `DirectoryChatState.error`, from which the main pane
  created the composer-level dock.

No shared presentation identifier connected the two. That duplication was the visible two-red-box
failure.

**Current:** `session.error` does not write the dock. Terminal copy is classified in
`chat-error-model.ts` and rendered by `assistant-error-card.tsx` from `assistantMessage.error`.
`DirectoryChatState.error` still exists and operational paths in `chat-actions.ts` still write it,
but directory-chat UI no longer renders that string as the old composer dock; the composer-adjacent
card is the classified `AssistantErrorCard`.

When two separate user turns both end with durable assistant errors, history contains two transcript
cards. If the latest `session.error` string remains in directory state, the page also shows the dock,
producing three visible red boxes.

## Recoverable events presented as terminal directory errors

### Automatic context overflow

With automatic compaction enabled, OpenCode's processor:

1. identifies `ContextOverflowError`;
2. sets `needsCompaction = true`;
3. publishes `session.error`;
4. returns `"compact"` to the prompt loop;
5. creates an automatic compaction and continues.

The error is not attached to the assistant message in this branch.

**Historical failure lesson:** Buddy's 2026-07-22 handler nevertheless marked the session not
running, applied idle, and wrote the context error into the directory dock. Later busy/status/message
events could clear it. The visible state could flash idle/error while the backend was entering
compaction.

**Current:** do not treat this event as a turn error. Notification-only handling in `use-chat-sync.ts`
avoids that flash. Runtime publication sites remain in vendored `processor.ts` / `prompt.ts` (line
numbers from the audit will have drifted).

### File and directory read fallback

While creating a user message, OpenCode can fail to read a referenced file or directory. It publishes
`session.error`, but also inserts synthetic text describing the failed read and continues building
the model input.

**Historical:** Buddy handled the event as idle plus a directory error even though the runtime
continued with fallback content.

**Current:** same publication still exists in vendored `prompt.ts`; Buddy must not map it to idle or
a red dock. At most a muted inline caveat on the user message remains an unshipped/product choice
documented in `proposed-design.md` §5.3.

Sources: `vendor/opencode/packages/opencode/src/session/prompt.ts` (file/directory read fallback
around user-message creation).

## Historical screenshot mapping (images not in this repository)

The five `codex-clipboard-*.png` filenames below were local Codex clipboard captures from the
2026-07-22 audit. They are **not** in the repo and cannot be re-opened from these names. Keep the
classifications as historical evidence of the old retry/card/dock layout; do not treat them as
current screenshots.

## Supplied screenshot mapping

### `codex-clipboard-e6a33673-bfd3-4fe4-a762-6c971d9880de.png`

Visible state:

- current activity label `Exploring`;
- red spinner card with `Internal server error`;
- `Retrying in 2s. Attempt #2.`;
- composer below.

Classification: transcript retry row. The message and retry timing originate in session status. A
500 `APIError` is retried even when the provider SDK marks it non-retryable, matching the current
OpenCode retry test and source policy.

### `codex-clipboard-f462ade5-bbf0-4288-8853-0bb5d849fcef.png`

Visible state:

- assistant prose and completed activity;
- an `ASSISTANT ERROR` card containing the quoted string `"Streaming response failed"`;
- a second plain red box above the composer containing the same quoted string.

Classification: one durable assistant-message error plus one directory error dock. The quotation
marks follow the plain-JSON-string parser behavior described above.

### `codex-clipboard-f4272a86-64f2-4d56-a24a-724fc535c3b5.png`

Visible state:

- current activity label `Climbing`;
- retry card containing `Error from provider (Console): Provider rate limit exceeded`;
- `Retrying in 14s. Attempt #4.`.

Classification: transcript retry row. The provider/runtime message is displayed substantially raw;
it does not match either of Buddy's two product-specific normalization patterns.

### `codex-clipboard-94d0f988-0093-49ac-9093-ab67ec0b2aed.png`

Visible state:

- reasoning and completed resource-preparation activity;
- retry card containing `Internal server error`;
- `Retrying in 2s. Attempt #2.`.

Classification: transcript retry row appended after the current turn's visible activity content.
Its position follows the projected row order.

### `codex-clipboard-8b3981b0-3ec9-450e-8fc1-497a795cc485.png`

Visible state:

- user message `what is this` followed by an assistant error card;
- user message `?` followed by another assistant error card;
- a plain `No provider available` box above the composer.

Classification: two historical turns with durable assistant-message errors, plus the latest
directory error dock. The assistant cards show the technical name `APIError` because Buddy hides only
`UnknownError` names.

## OpenCode desktop/app current behavior

OpenCode's desktop package hosts the UI from `vendor/opencode/packages/app`. The relevant architecture
is in the shared app rather than Electron main-process code.

### Transcript inputs

OpenCode's timeline constructor:

- identifies interruption from `MessageAbortedError` on assistant messages;
- obtains a durable non-abort error directly from assistant messages;
- adds a retry row only when the turn is active and session status is `retry`;
- adds an error row from the assistant error's `data.message`;
- does not use `session.error` to construct transcript rows.

Source: `vendor/opencode/packages/app/src/pages/session/timeline/rows.ts:44-50` and `:122-164`.

One detail differs from Buddy: OpenCode currently selects the first non-abort assistant error in a
turn with `.find`, while Buddy selects the last with `.findLast`.

### Session-state reducer

OpenCode's per-server session reducer has explicit cases for `session.status` and `message.updated`.
It stores retry/busy/idle state and durable message errors through those events. It has no
`session.error` case in this reducer.

Source: `vendor/opencode/packages/app/src/context/server-session.ts:781-805`.

### Notification subsystem

OpenCode listens to `session.error` in its notification subsystem. It:

- ignores child-session notifications;
- optionally plays an error sound;
- appends an in-app notification record;
- optionally sends an operating-system notification.

This consumer does not set session status, create a transcript card, or create a composer-level dock.
Because the event contract has no terminal/recoverable distinction, the notification listener can
still receive the recoverable and fallback-producing events described earlier.

Source: `vendor/opencode/packages/app/src/context/notification.tsx:354-397`.

### Retry component

OpenCode's retry component:

- displays a spinner, message, countdown, and attempt;
- truncates messages longer than 80 characters and exposes the full string in a tooltip;
- special-cases one Gemini quota message;
- renders the retry as an inline error-card variant;
- reads only retry status.

Source: `vendor/opencode/packages/session-ui/src/components/session-retry.tsx`.

### Structured retry actions

OpenCode separately consumes `session.status.action` for two OpenCode-hosted usage-limit reasons:

- `free_tier_limit`;
- `account_rate_limit`.

It presents throttled usage-exceeded dialogs with the action title, message, label, and link. The
dialog behavior is provider- and reason-specific and includes persisted suppression windows.

Source: `vendor/opencode/packages/app/src/pages/session/usage-exceeded-dialogs.tsx`.

### OpenCode error text

OpenCode's inline terminal error remains visually and semantically simple: it renders a raw error
card from `error.data.message`. Its JSON unwrapping implementation is substantially the same as
Buddy's. The architectural separation is clearer, but the user-facing wording remains largely
provider/runtime-controlled.

## Buddy and OpenCode comparison

The OpenCode-app column is still a useful baseline. The Buddy column is split: **now** vs **2026-07-22**.

| Concern | Buddy now | Buddy 2026-07-22 (historical) | OpenCode app |
| --- | --- | --- | --- |
| Durable terminal turn error source | `assistantMessage.error` via `chat-error-model.ts` | `assistantMessage.error` | `assistantMessage.error` |
| Retry source | `session.status.retry` + `buildRetryStateModel` | `session.status.retry` | `session.status.retry` |
| `session.error` in Buddy sync | Notification-only; no idle, no dock write | Marked not running, forced idle, filled dock | No reducer case |
| `session.error` notification use | In-app and optional OS notification | Same plus dock | In-app and optional OS notification |
| Composer-adjacent error | Classified `AssistantErrorCard` | Raw `DirectoryChatState.error` dock | No equivalent dock from `session.error` |
| Retry `status.action` | Preserved and rendered when present | Dropped in normalization | Used for selected usage-limit dialogs |
| Technical error name | Behind details; face is product copy | Shown except `UnknownError` | Inline row uses message text |

## Historical failure modes (2026-07-22) vs remaining work

These subsections preserve the audit's failure analysis. **Struck-as-current** means the client no
longer behaves this way. **Still open** means store/UI leftovers.

### Duplicate presentation (historical)

One runtime failure **used to** create both a durable transcript card and a directory dock because
`message.updated` and `session.error` were rendered independently. **Now** `session.error` does not
write that dock.

### Mixed scopes in one string (still open at the store)

`DirectoryChatState.error` can still be written by operational `setDirectoryError` callers
(`chat-actions.ts`, page controller). The old mixed-scope dock renderer is gone from
`directory-chat-main-pane.tsx`. Fully retiring the string is unshipped (`proposed-design.md` §5).

### Terminal assumption applied to a non-terminal event (historical)

Every parent-session `session.error` except abort **used to** be treated as idle plus visible error.
**Now** the event is notifications only; `session.status` owns lifecycle.

### Independent lifecycle and clearing (historical for `session.error`)

The durable assistant card still persists with message history. The `session.error` dock mirror is
gone. Unrelated `clearDirectoryError` still runs on busy/status and other actions for leftover
string state.

### Session-switch lifetime (historical dock)

The old directory dock was directory-scoped. That `session.error`-driven dock is gone.

### Raw provider/runtime language (partially shipped)

Classifier + product headlines now cover the mapped categories. Unmapped strings can still appear
in Details/raw. Historical: almost all messages were shown raw.

### Technical discriminants exposed (historical)

**Now** schema names are diagnostic, not the card face. Historical: all names except `UnknownError`
were on the card.

### Inconsistent formatter output (historical for dock vs card)

The `session.error` dock path no longer mirrors the card. Classification lives in `chat-error-model.ts`.

### Output-limit name duplication (historical)

**Now** `output-length` uses headline "Response was cut off at the model's length limit" in
`createAssistantErrorCardSpec`.

### Retry visually uses critical error styling (partially shipped)

Retry stages are modeled; quiet retries hide the notice. Remaining visual-token work is easel/design.

### Structured actions lost in Buddy (historical — shipped)

**Now** `normalizeSessionStatusValue` keeps `action`; `retryStage` returns `actionable`;
`SessionRetryNotice` renders `RetryActionCard`.

### Accessibility differs by renderer (partially open)

Assistant card still uses alert; retry uses status. The raw directory dock role gap is historical.

### Aborted turn suppresses other error cards

Keep as an audit finding unless later tests prove the timeline rule changed. Verify in
`chat-timeline-rows.ts` before treating as current.

## Existing test coverage

### Buddy web tests

`packages/web/test/chat-error-handling.test.tsx` currently verifies:

- a generic assistant error becomes an accessible alert;
- hidden internal auto-repair user messages remain hidden.

`packages/web/test/upstream-provider-error.test.ts` currently verifies:

- Zen IP rate-limit normalization in retry status;
- Zen IP rate-limit normalization in assistant errors;
- generic provider assistant-error normalization;
- extraction of a response-body message for a generic provider error;
- generic provider session-error normalization.

The current tests do not contain an exhaustive rendering matrix for all eight assistant-error
variants. They also do not directly cover:

- message-error plus matching `session.error` duplication;
- automatic context-overflow compaction events;
- file/directory read fallback events;
- session switching while a directory error is populated;
- the plain-JSON-string quotation case;
- retry structured actions in Buddy;
- direct retry-card rendering/countdown behavior;
- a turn containing both abort and non-abort errors;
- output-length fallback rendering;
- differing assistant-card and directory-dock formatting for one payload.

### OpenCode runtime tests observed during the audit

The vendored runtime contains tests confirming, among other cases:

- content-filter finishes are stored and emitted as session errors;
- context overflow is terminal when automatic compaction is disabled;
- context overflow is not handled by the ordinary retry policy;
- HTTP 500, 502, and 503 API failures are retried even when provider retryability is false;
- response-stream and header-timeout failures are retryable.

Relevant files:

- `vendor/opencode/packages/opencode/test/session/prompt.test.ts`
- `vendor/opencode/packages/opencode/test/session/retry.test.ts`
- `vendor/opencode/packages/opencode/test/session/message-v2.test.ts`

## Source map

### Contracts and runtime

- `packages/sdk/src/gen/types.gen.ts`
- `vendor/opencode/packages/schema/src/v1/session.ts`
- `vendor/opencode/packages/opencode/src/session/message-v2.ts`
- `vendor/opencode/packages/opencode/src/session/processor.ts`
- `vendor/opencode/packages/opencode/src/session/prompt.ts`
- `vendor/opencode/packages/opencode/src/session/retry.ts`

### Buddy state and event ingestion

- `packages/web/src/state/chat-types.ts`
- `packages/web/src/state/chat-error.ts`
- `packages/web/src/state/chat-store.ts`
- `packages/web/src/state/session-status.ts`
- `packages/web/src/state/chat-actions.ts`
- `packages/web/src/lib/directory-chat/use-chat-sync.ts`
- `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts`

### Buddy formatting and rendering

- `packages/web/src/components/chat/utils/error.ts`
- `packages/web/src/lib/upstream-provider-error.ts`
- `packages/web/src/lib/directory-chat/chat-prompt-helpers.ts`
- `packages/web/src/components/chat/chat-timeline-rows.ts`
- `packages/web/src/components/chat/chat-transcript.tsx`
- `packages/web/src/components/chat/assistant-error-card.tsx`
- `packages/web/src/components/chat/session-retry-notice.tsx`
- `packages/web/src/components/directory-chat/directory-chat-main-pane.tsx`

### OpenCode desktop/app baseline

- `vendor/opencode/packages/app/src/pages/session/timeline/rows.ts`
- `vendor/opencode/packages/app/src/pages/session/timeline/message-timeline.tsx`
- `vendor/opencode/packages/app/src/context/server-session.ts`
- `vendor/opencode/packages/app/src/context/notification.tsx`
- `vendor/opencode/packages/app/src/pages/session/usage-exceeded-dialogs.tsx`
- `vendor/opencode/packages/session-ui/src/components/session-retry.tsx`

### Tests

- `packages/web/test/chat-error-handling.test.tsx`
- `packages/web/test/upstream-provider-error.test.ts`
- `vendor/opencode/packages/opencode/test/session/prompt.test.ts`
- `vendor/opencode/packages/opencode/test/session/retry.test.ts`
- `vendor/opencode/packages/opencode/test/session/message-v2.test.ts`
