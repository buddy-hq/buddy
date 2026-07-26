# Full-Text Ingestion

## Status

This document describes the full-text ingestion design implemented on 24 July 2026. It is the
authoritative design record for deciding whether a prepared resource's complete text may be added
to a live model session.

The neighboring features own different parts of the reading path:

- [Prepare Resource](../prepare-resource/design.md) owns extraction and resource-pack creation.
- [Reading Mode](../reading-mode/design.md) owns the learner-facing reader and reading context.
- `ingest_full_text` owns the final live-context admission decision for a prepared full-text file.

Open issues are tracked in [known-issues.md](./known-issues.md).

The 26 July 2026 native-PDF overflow and its complete causal chain are recorded in
[Native PDF Double-Delivery Overflow Postmortem](./incident-2026-07-26-native-pdf-overflow.md).

## Objective

Whole-resource reading should remain available when it safely fits, without trusting a provider's
published context metadata enough to risk a context-overflow and compaction loop.

The design has five complementary layers:

1. Improve active model metadata when an OpenAI OAuth account exposes account-specific limits.
2. Estimate prepared text from its ASCII characters and non-ASCII UTF-8 bytes with a safety margin.
3. Enforce a provider-independent, tool-local input-window ceiling before full text enters the
   transcript.
4. Admit native PDF model input only when each PDF has at most 30 pages and one incoming user
   message contains at most 50 admitted native PDF pages in total.
5. Prevent `ingest_full_text` from emitting a prepared PDF that message evidence shows was already
   delivered natively.

The account metadata improves model counters and normal compaction behavior. The tool ceiling is the
safety boundary for full-text ingestion. The native delivery controls own the earlier boundary
before OpenCode reads the PDF into a provider request. The feature remains safe when account
metadata is missing, slow, stale, or unavailable.

## Incident That Drove The Design

The triggering session had materially different limits from two sources:

| Source | Context | Input |
| --- | ---: | ---: |
| Generic model catalog | 1,050,000 | 922,000 |
| OpenAI account model response | 272,000 raw | 258,400 effective at 95% |

At the time of ingestion:

- the live session used approximately 21,490 tokens;
- the prepared book was estimated at 544,472 tokens;
- the old admission check trusted the generic 922,000-token input limit;
- the check therefore admitted text that could not fit in the account's real window.

The provider rejected the next request with `context_length_exceeded`. The vendored runtime then
compacted and replayed the original user prompt and attachment context. Because the same reading
instructions and oversized resource were still present, the agent could make the same ingestion
choice again. A deterministic full-text decision could therefore become a deterministic
ingestion/compaction loop.

This exposed three separate concerns:

1. Generic provider metadata can differ from the limits of the connected account.
2. One very large tool result needs its own conservative admission policy even when model metadata
   appears valid.
3. Generic overflow replay can repeat a triggering workflow.

The implemented change addresses the first two at their Buddy-owned boundaries. It intentionally
does not patch vendored replay behavior.

## Final Admission Policy

### Effective input window

Full-text ingestion uses:

```text
tool_input_window = min(model.input_window ?? model.context_window, 250000)
```

`input_window` is preferred because the operation fills the next model request. Output capacity is
a generation ceiling and is not available prompt space.

The 250,000-token ceiling is local to `ingest_full_text`. It does not change the active model's
global context limit, provider behavior, composer counter, or runtime compaction threshold. A model
with a smaller input window keeps that smaller limit.

### Post-ingestion reserve

The tool reserves space for system instructions, current conversation, tool metadata, citations,
and follow-up reading:

```text
reserve = clamp(tool_input_window * 0.25, 48000, 96000)
```

The 48,000-token floor protects smaller-window sessions from becoming immediately unusable. The
96,000-token cap prevents large-context models from reserving hundreds of thousands of tokens that
would provide little additional reading value.

### Live usage

The tool calculates two session-usage signals:

- the latest non-zero assistant token total reported by the provider;
- a local token estimate of the serialized visible message history.

It uses the larger value:

```text
live_usage_estimate = max(latest_assistant_total, message_history_estimate)
```

This uses authoritative provider usage when available while retaining a conservative fallback
before useful token totals have been reported.

### Full-text estimate

Resource preparation estimates both full-text and chunk sizes with a fast UTF-8-aware heuristic:

```text
base_estimate =
  ASCII_characters / 4
  + non_ASCII_UTF8_bytes / 2

text_estimate = ceil(base_estimate + base_estimate * 0.10)
```

The ASCII path remains permissive for ordinary prose. The byte-weighted non-ASCII path avoids the
unsafe assumption that every JavaScript string character costs one quarter of a token, which
materially understated the incident PDF's corrupted glyph extraction. The scan is linear and does
not reparse the source, invoke OCR, call a model, or load a provider-specific tokenizer.

New resource packs persist this estimate in the full-text filename and frontmatter, and
`prepare_resource` returns it as `full_text_est_tokens`. At ingestion time, the tool scans the actual
prepared body again and uses:

```text
full_text_estimated_tokens =
  max(pack_frontmatter_estimate, registry_estimate, fresh_body_estimate)
```

The fresh scan protects existing packs created with the previous four-characters-per-token
heuristic. Taking the maximum also prevents edited or inconsistent pack metadata from lowering the
admission estimate.

### Final check

The complete decision is:

```text
remaining_after_ingestion =
  tool_input_window - live_usage_estimate - full_text_estimated_tokens

ingest only when remaining_after_ingestion >= reserve
```

At the 250,000-token ceiling, the reserve is 62,500 tokens:

- an otherwise empty session may ingest at most 187,500 full-text tokens;
- the incident session, with 21,490 live tokens, may ingest at most 166,010 full-text tokens;
- the 544,472-token book is rejected before its body is emitted into the tool result.

The equality boundary is intentional: a document that leaves exactly the required reserve fits; one
estimated token beyond it falls back.

## Native PDF Delivery Policy

The backend prompt transform probes every PDF that the client proposes for direct model delivery in
the incoming user message. It retains the provider file part only when:

```text
pdf_pages <= 30
admitted_native_pdf_pages_in_message + pdf_pages <= 50
```

Admission follows part order within that message. A PDF that would exceed either bound becomes
`resource-only`; a later smaller PDF in the same message may still use remaining aggregate
capacity. Unknown, unreadable, encrypted, and zero-page PDFs also fail closed to `resource-only`.

The aggregate bound is deliberately per incoming message, not session-wide. Native PDFs from
earlier turns can remain in live model history until normal compaction, but they do not reduce a
later message's admission budget. Repeated PDF attachments can therefore grow the conversation
until it compacts normally; preventing all eventual context growth is not a goal of this gate.

The client cannot bypass the gate with supplied page-count or delivery metadata. The backend
normalizes native-resource records from the uploaded file, probes the PDF itself, removes rejected
file parts before OpenCode reads them, and persists the actual delivery decision in the message
metadata. A raw PDF file part without matching normalized resource metadata is rejected.

These page limits are product safety bounds rather than token estimates. OpenAI native PDF
processing includes both extracted text and page images, so byte size and extracted-word count do
not predict provider context usage reliably.

### Duplicate-ingestion fallback

Preparation remains mandatory for both delivery modes because the pack is the durable citation,
navigation, and scoped-reading path. When persisted message metadata records
`delivery=model-and-resource` for the same prepared PDF, `ingest_full_text` returns:

- `completed=false`;
- `reason=native_pdf_already_in_context`;
- `fallback=scoped_reading`;
- the prepared pack and full-text paths;
- no `<full_text>` body.

This is enforced from message evidence and resource source identity, not only from prompt wording.

## Scoped-Reading Fallback

Insufficient headroom is a completed tool outcome, not a tool exception. The result:

- sets `completed=false`;
- sets `reason=context_too_full`;
- sets `fallback=scoped_reading`;
- includes the resource, pack, model, and budget diagnostics;
- does not include a `<full_text>` body;
- directs the agent to continue from the table of contents, chunks, pages, or focused full-text
  sections.

The reading skill performs a preliminary version of the same capped-window calculation. The tool
remains authoritative because only it has the final live message history at execution time.

This fallback preserves progress. A book that is too large for one request is still readable through
its prepared resource pack; the agent does not need to fail the learner's task or repeatedly attempt
the same oversized ingestion.

## OpenAI OAuth Account Model Overlay

For an OpenAI provider backed by OAuth, Buddy makes a bounded request to the account model endpoint.
For listed models that also exist in the generic provider catalog, it overlays:

```text
effective_context =
  floor((context_window ?? max_context_window) *
        effective_context_window_percent / 100)

model.limit.context = effective_context
model.limit.input = effective_context
```

All other model fields remain those of the generic provider model. Hidden account models are
ignored, models absent from the generic catalog are not introduced, and API-key-backed OpenAI
providers remain unchanged.

The overlay improves the normal model counter and compaction threshold. It is not the full-text
safety boundary:

- account lookup has a five-second deadline;
- failure or timeout returns the generic provider models;
- the tool-local 250,000-token ceiling still applies after either result.

### Authentication consistency

Catalog resolution reads the current stored OAuth credentials instead of resolving against a
provider-hook snapshot. Token refresh already re-reads storage before persisting refreshed
credentials. Catalog resolution then revalidates the refresh-token identity before using the
result.

If the user reconnects or switches accounts during a slow refresh:

- credentials for the old account are not written over the new account;
- no model request is made with the abandoned account result;
- the provider falls back to its generic model metadata for that resolution.

### Timeout consistency

The five-second provider-hook deadline aborts the underlying account model request. An
`AbortError` is a neutral caller timeout and is not stored in the account service's fifteen-minute
model-failure backoff.

A later availability read may therefore start a fresh request immediately. Real endpoint,
validation, and authentication failures retain the normal backoff behavior.

## Review Follow-Ups Resolved In This Change

| Review issue | Failure before the fix | Resolution |
| ---: | --- | --- |
| 1 | Catalog resolution reused the provider hook's initial auth snapshot. That defeated the token-refresh helper's storage re-read and could let credentials for an old account overwrite a newly connected account. | Resolve from current storage, preserve the refresh helper's compare-before-write behavior, and revalidate account identity before requesting models. |
| 2 | The provider hook's five-second abort flowed through the ordinary model failure path and activated a fifteen-minute retry backoff. The model availability surface could show an error after a deliberate caller timeout. | Treat `AbortError` as a neutral cancellation, clear the in-flight refresh normally, and allow the next reader to retry immediately. |

Both paths have focused regressions in
[`openai-codex-account.test.ts`](../../../packages/buddy/test/opencode-runtime/openai-codex-account.test.ts).
Review issues 3 and 4 remain deliberately open in
[known-issues.md](./known-issues.md).

## Decisions Considered

### Remove whole-text ingestion

Rejected. Whole-resource context is valuable for books, papers, and cross-document questions when
the resource genuinely fits. Removing the tool would force every resource into less coherent
chunk-by-chunk reading.

### Use a fixed 100,000-token document limit

Rejected. It would avoid the incident but unnecessarily exclude useful resources on models that can
safely carry more. A bounded input window plus live usage and reserve gives a larger safe range
without trusting million-token metadata.

### Trust account-specific model metadata alone

Rejected as the safety strategy. Account metadata is more accurate for OpenAI OAuth sessions, but
it is an optional network response and provider contracts can change. It improves global behavior;
it cannot be the only guard before emitting a very large tool result.

### Clamp every model globally

Rejected. A global 250,000-token clamp would alter compaction and counters for unrelated workflows,
hide real model capacity, and still need special handling for models with smaller limits. The
uncertainty belongs to this unusually large ingestion operation.

### Track hidden limits separately for every provider

Rejected for the current change. Provider-specific safety tables would duplicate external policy,
age poorly, and make behavior harder to predict. The tool ceiling provides a common baseline while
provider overlays can improve fidelity where trustworthy account data exists.

### Add an ingestion replay guard or circuit breaker

Rejected for now. Once the tool refuses the oversized text, this known deterministic trigger no
longer reaches provider overflow. A generic replay guard would add session state and recovery rules
without evidence that it is needed for other overflow sources.

### Patch vendored compaction replay

Rejected. The observed replay is a generic runtime recovery behavior, and Buddy does not patch
vendored runtime code for this feature. Changing it would affect every tool and overflow scenario.
The narrow Buddy-owned fix prevents `ingest_full_text` from creating the known failure condition.

## Invariants

- Full text is never emitted when the estimated post-ingestion remainder is below the reserve.
- Full-text admission never uses an estimate below a fresh scan of the actual prepared body.
- The budget never exceeds 250,000 input tokens and never raises a smaller model limit.
- Live session usage is subtracted before document admission.
- A budget rejection returns a usable scoped-reading route and no full-text body.
- Account-specific OpenAI metadata is optional; its absence cannot disable provider fallback.
- OpenAI API-key model behavior is not changed by the OAuth account overlay.
- An account change during refresh cannot be overwritten by the abandoned refresh result.
- A caller timeout does not create a persistent account-model failure.
- One incoming user message never admits more than 30 pages per PDF or 50 native PDF pages in total.
- An unreadable or unprobeable PDF is resource-only.
- Client-provided native-delivery metadata is not authoritative.
- A natively delivered PDF cannot be emitted again through `ingest_full_text`.
- Vendor code and generic compaction replay behavior remain unchanged.

## Key Files

- Tool implementation:
  [`ingest-full-text.ts`](../../../packages/buddy/src/learning/features/reading/tools/ingest-full-text.ts)
- Tool-facing description:
  [`ingest-full-text.md`](../../../packages/buddy/src/learning/features/reading/tools/ingest-full-text.md)
- Reading policy:
  [`SKILL.md`](../../../packages/buddy/src/learning/features/reading/skills/reading/SKILL.md)
- Native PDF admission:
  [`native-pdf-delivery.ts`](../../../packages/buddy/src/learning/prompt/native-pdf-delivery.ts)
- Native-resource delivery metadata:
  [`native-resource-metadata.ts`](../../../packages/buddy/src/learning/prompt/native-resource-metadata.ts)
- Native-resource prompt normalization:
  [`native-resource-attachments.ts`](../../../packages/buddy/src/learning/prompt/native-resource-attachments.ts)
- OpenAI account service:
  [`openai-codex-account.ts`](../../../packages/buddy/src/opencode-runtime/plugins/openai-codex-account.ts)
- OpenAI provider overlay:
  [`openai-codex-provider.ts`](../../../packages/buddy/src/opencode-runtime/plugins/openai-codex-provider.ts)
- Runtime hook registration:
  [`buddy-runtime-plugin.ts`](../../../packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts)
- Tool behavior tests:
  [`ingest-full-text-plugin.test.ts`](../../../packages/buddy/test/learning/ingest-full-text-plugin.test.ts)
- Native PDF prompt tests:
  [`native-resource-prompt.test.ts`](../../../packages/buddy/test/learning/native-resource-prompt.test.ts)
- Account consistency tests:
  [`openai-codex-account.test.ts`](../../../packages/buddy/test/opencode-runtime/openai-codex-account.test.ts)
- Provider overlay tests:
  [`openai-codex-provider.test.ts`](../../../packages/buddy/test/opencode-runtime/openai-codex-provider.test.ts)

## Non-Goals

- Guaranteeing that provider token accounting exactly matches Buddy's text estimator.
- Making every resource fit in one model request.
- Changing generic compaction or replay semantics.
- Introducing account tiers, subscription names, or hidden provider limits into the reading tool.
- Treating account metadata availability as a prerequisite for using OpenAI.
