# Native PDF Double-Delivery Overflow Postmortem

Date: 2026-07-26
Status: root cause confirmed; remediation integrated

## Summary

A learner attached a 160-page PDF (Seth Godin's *Purple Cow*, 903 KB). The prepared text was estimated at 52,435 tokens, but the session compacted immediately upon calling `ingest_full_text`.

Before `ingest_full_text` ran, OpenAI had already accounted for 210,039 tokens for the request containing the native PDF. Emitting the prepared full text into the next request caused a provider context overflow (`context_length_exceeded`), triggering automatic compaction.

## User-Visible Impact

- Buddy compacted before answering the learner's first question.
- Large media attachments were dropped from context by compaction.
- The learner had to manually prompt Buddy that the resource was still available in the library.
- Redundant dual processing wasted tokens and increased latency.

## Incident Identifiers

- Session ID: `ses_0605ebed4ffehponQCmT51wxXS`
- Model: `openai/gpt-5.6-luna`
- Resource Object: `01KYFT2XYW2407QTPDN28HBX2Q` (160 pages, 903 KB)
- Initial request: 210,039 input tokens (native PDF alone ≈ 191,000 tokens / ~1,200 tokens/page).

## Four Systemic Weaknesses

1. **Dual Delivery**: PDF attachments were classified as `model-and-resource`, sending the complete binary PDF directly to the provider while also triggering resource preparation.
2. **Duplicate Ingestion**: `ingest_full_text` emitted the complete extracted text into model context without checking whether the PDF was already present natively.
3. **Context Fix Uncommitted in Worktree**: A previous fix implementing the 250,000-token tool ceiling was unstaged in a separate worktree; merging the branch reference did not carry uncommitted files. The running tool trusted generic 922,000-token input metadata.
4. **Non-Conservative Token Estimator**: The legacy `ceil(characters / 4)` heuristic produced 52,435 tokens on garbled non-ASCII extracted PDF text, compared to ~189,000 tokens under UTF-8 byte weighting.

## Evidence and Timeline

The diagnosis was cross-checked against the exported session trace, the live
OpenCode SQLite database, prepared resource and source-PDF metadata, Buddy's
attachment submission code, vendored OpenCode file/compaction paths, and the
uncommitted `context-fix` worktree. No conclusion depends only on the UI
counter or on converting the learner's word count into tokens.

| Time (local) | Evidence |
| --- | --- |
| 23:42:53 | The user turn contained both native-resource metadata and a complete PDF file part. |
| 23:43:00 | The first assistant step reported `210,039` input tokens (`210,083` total). |
| 23:43:05 | `prepare_resource` created resource object `01KYFT2XYW2407QTPDN28HBX2Q`. |
| 23:43:13 | `ingest_full_text` recorded `212,034` live tokens and a `52,435`-token estimate. |
| 23:43:18–23:43:20 | The provider rejected the next request; OpenCode recorded an automatic compaction marker with `overflow=true`. |
| 23:44:27 | A post-compaction retry ingested the text with only about `18,919` live tokens first and completed normally. |

## Quantitative Evidence

The first usage report was:

```text
input=210039  output=19  reasoning=25  total=210083
```

Using the later 18,000–20,000-token baseline, the native PDF contributed
approximately `191,000` provider-accounted tokens, or about 1,200 per page
for this PDF. That is incident evidence, not a universal PDF-token formula.

The old ingestion preflight trusted generic model metadata:

```text
generic input window = 922000
live usage           = 212034
prepared estimate    = 52435
required reserve     = 96000
```

Against the observed 258,400-token effective OpenAI window, the same request
would be `212034 + 52435 = 264469`, or 6,069 tokens over the window before
additional framing and output allowance. After compaction, the successful
request reported `178,691` uncached input, `19,968` cached input, and `198,755`
total. The body estimate therefore was not a safe approximation, although the
provider total also included non-document prompt content.

The corrective heuristic is deliberately conservative:

```text
estimate = (ASCII characters / 4 + non-ASCII UTF-8 bytes / 2) * 1.10
```

For the 209,738-character incident extraction this is approximately 188,955
tokens, versus the stale 52,435-token pack estimate.

## Root-Cause and Remediation Boundaries

- The native PDF and the prepared full text were each sufficient for whole-document access; their additive delivery was the direct overflow mechanism.
- Existing limits (eight native resources and 64 MiB per resource) protected transport and memory, not provider context. The missing gate must use 30 pages per PDF and 50 aggregate native-PDF pages per incoming message; unknown, encrypted, unreadable, or over-limit files are `resource-only`.
- The `ingest_full_text` duplicate guard may still prepare a natively delivered PDF, but must return a scoped fallback instead of emitting its complete body. This is runtime evidence/state, not prompt wording alone.
- The 250,000-token tool ceiling, OpenAI account-model overlay, duplicate guard, page gate, and UTF-8 estimator are separate controls; no one substitutes for the others.

## Ruled-Out Explanations

- The book's word count alone did not fill the context; provider usage was already above 210,000 tokens before the extracted body was emitted.
- The frontend did not submit the initial user turn twice. The duplicate representation came from the intentional `model-and-resource` plus `ingest_full_text` workflow.
- `overflow=true` and the empty failed assistant attempt identify provider rejection followed by recovery compaction, not arbitrary proactive compaction.
- Correcting the composer counter alone is insufficient: native PDFs can consume unpredictable provider tokens before Buddy receives usage, and multiple PDFs can overflow the first request without `ingest_full_text`.

## Success Criteria and Verification

The incident is considered remediated when: native delivery is allowed only at
the per-file/aggregate page bounds; larger or unprobeable PDFs remain
resource-only; a native PDF cannot be emitted again by `ingest_full_text`; the
incident file is kept out of the initial provider request; stale pack metadata
cannot bypass a fresh-body estimate; and OpenAI OAuth sessions use account
limits when available without failing closed on enrichment errors.
The remediation stays in Buddy-owned attachment/resource code and does not
require a vendored OpenCode patch.

Regression coverage must include below/at/above-30-page and at/over-50-page
prompt-builder cases, backend rejection of client-supplied delivery metadata,
duplicate-ingestion fallback, ASCII and token-dense non-ASCII estimator cases,
stale-pack/fresh-body comparison, and the existing context-boundary, OAuth
fallback, timeout, and authentication-race tests.

## Remediation

| Boundary | Control | Mechanism |
| --- | --- | --- |
| Provider metadata | OpenAI OAuth Overlay | Overlays account-specific limits (e.g. 258,400 effective tokens). |
| Tool ceiling | 250k Hard Cap | `tool_input_window = min(model_input, 250000)` with 48k–96k dynamic reserve. |
| Attachment gate | Per-Message Page Limits | Max 30 pages/PDF, max 50 pages/message for native delivery; otherwise `resource-only`. |
| Ingestion guard | Duplicate Check | `ingest_full_text` returns `reason=native_pdf_already_in_context` if delivered natively. |
| Token estimation | UTF-8 Byte Heuristic | `ceil((ASCII/4 + non_ASCII_bytes/2) * 1.10)` plus fresh body scan. |

## Lessons

- Filesystem size is not a model context budget.
- Durable resource preparation and native model delivery must not duplicate content in live context.
- Branch integration must verify committed files, not branch names.
- Token estimators must account for non-ASCII byte density and fail conservatively.
- Compaction with `overflow=true` indicates provider rejection, not premature proactive compaction.

## Related Documentation

- [Full-Text Ingestion Design](./design.md)
- [Full-Text Ingestion Known Issues](./known-issues.md)
- [Prepare Resource](../prepare-resource/design.md)
- [Reading Mode](../reading-mode/design.md)
