# Full-Text Ingestion Known Issues

## Status And Scope

This file tracks intentional limits and open issues retained from implementation reviews. The open
issues are deliberately not fixed in the current change.

| Review source | ID | Item | Status |
| --- | --- | --- | --- |
| Earlier review 3 | FTI-003 | Missing effective-window percentage defaults to 100% | Open |
| Earlier review 4 | FTI-004 | Scoped-reading reminder omits the model-switch retry case | Open |
| Current review 1 | FTI-D001 | Native PDF aggregate admission is per incoming message | Intentional |
| Current review 2 | FTI-005 | PDF validation can inspect a different path from the URL sent to the model | Open, non-blocking |
| Current review 3 | FTI-006 | Native-delivery metadata does not account for current PDF model support | Open, non-blocking |
| Current review 4 | FTI-007 | Token-aware estimates can exceed character-based chunk thresholds | Open, non-blocking |

## FTI-D001: Native PDF Admission Is Deliberately Per Message

### Decision

The native PDF limits apply independently to each incoming user message:

- at most 30 pages per PDF;
- at most 50 admitted native PDF pages combined in that message.

The aggregate counter intentionally starts from zero for the next user message. Native PDFs retained
from earlier conversation history do not reduce a later message's admission budget.

### Rationale

The gate prevents one attachment submission from immediately recreating the incident caused by a
160-page PDF. It is not a session-wide context quota and is not intended to prevent normal context
growth indefinitely.

Previously admitted PDFs can remain in live model history until normal compaction. A learner who
repeatedly attaches PDFs across multiple turns can therefore eventually fill the context and cause
the session to compact. That is accepted behavior: later documents are not rejected merely because
the learner used native PDFs earlier in the conversation.

## FTI-003: Missing Effective Percentage Defaults To 100%

### Current behavior

The OpenAI account overlay calculates an effective context limit from
`effective_context_window_percent`. When the account response omits that field, Buddy currently
uses 100%.

The expected OpenAI Codex effective-window convention is 95%, so an omitted field can make the
active model appear larger than its effective window.

### Why the incident is still protected

This does not change the original 272,000-token ingestion result:

```text
min(272000 at 100%, 250000 tool cap) = 250000
min(258400 at 95%, 250000 tool cap) = 250000
```

The full-text hard cap therefore completely masks this metadata difference for that ingestion
decision.

### Remaining behavior

The cap does not make the metadata issue universally irrelevant:

- the model's global counter and compaction threshold use the overestimated account limit;
- a model whose raw and effective windows are below 250,000 is not masked by the tool cap;
- non-ingestion workflows do not use the tool-local ceiling.

For example, a 200,000-token raw window with a 95% effective percentage should resolve to 190,000.
Defaulting an omitted field to 100% would give `ingest_full_text` and global compaction 10,000 tokens
of capacity that the effective limit may not provide.

### Follow-up decision

Confirm the endpoint contract for an omitted percentage. Then either:

- default the missing value to the provider's documented effective percentage; or
- decline to overlay context/input limits when the endpoint did not provide enough information.

The behavior and tests should be changed together.

## FTI-004: Scoped-Reading Reminder Omits The Model-Switch Retry Case

### Current behavior

When full text does not fit, the tool reminder says not to retry unless live context usage or the
resource's full-text size materially decreases.

A switch from a smaller model to a model with a materially larger usable input window can also make
the same resource fit, but the reminder does not name that condition.

### Scope

This matters when the original model's usable input window is below the 250,000-token tool cap. For
example, moving from a 100,000-token input model to a 200,000-token input model can create useful
headroom.

It does not help when both models already reach the 250,000-token ceiling. Switching from one
larger-context model to another cannot raise this tool's budget above the cap.

### User-visible behavior

The fallback remains safe and scoped reading still works. The issue is that the instruction can
discourage a valid retry after the active model changes, so the agent may stay in scoped-reading
mode even though whole-text ingestion has become possible.

### Follow-up

Teach the fallback reminder that a retry is also valid after a materially larger active input
window becomes available below the tool cap. Update the tool output, reading skill, documentation,
and boundary tests together.

## FTI-005: PDF Validation Path Can Differ From The Sent URL

### Current behavior

When a PDF file part contains both `source.path` and `url`, native PDF admission validates and probes
`source.path`. OpenCode later reads or sends `url`. The gate does not currently prove that both
fields identify the same file.

### Scope

Buddy's normal composer creates both fields from the same completed upload, so ordinary attachment
submissions do not encounter this mismatch. It requires a malformed or hand-crafted request, or an
upstream defect that causes the two fields to diverge.

### User-visible behavior

If the fields diverge, Buddy can approve a small uploaded PDF while the model receives a different
or larger PDF. That can bypass the page limit, send the wrong document, or cause an avoidable
provider overflow and compaction.

### Follow-up

Resolve admission from the URL that OpenCode will consume and require it to match the normalized
completed-upload path exactly. Reject mismatched, remote, or otherwise unsupported URLs before the
file part reaches OpenCode.

## FTI-006: Native Delivery Does Not Account For Current Model PDF Support

### Current behavior

Persisted `delivery=model-and-resource` metadata prevents `ingest_full_text` from inserting the
prepared text again. That decision is made before checking whether the current model supports PDF
input.

### Scope

This matters when a learner initially selects a model without PDF support or switches to one after
the PDF was attached. Models that support PDF input retain the intended duplicate-ingestion
protection.

### User-visible behavior

On a model without PDF support, OpenCode replaces the native PDF with an unsupported-input error
while Buddy still declines whole-text ingestion. The prepared pack remains available for scoped
reading, so the learner can continue, but whole-document reading may be slower or less complete.

### Follow-up

Include current model PDF capability in the duplicate-ingestion decision. Preserve the native
fallback only when the active model can actually consume the retained PDF.

## FTI-007: Token Estimates Can Exceed Character-Based Chunk Thresholds

### Current behavior

Resource text is now estimated with a safety margin and additional weight for non-ASCII UTF-8
bytes. Chunk splitting still uses the older fixed four-characters-per-token window and does not
recheck the estimated token count of each resulting chunk.

An ASCII chunk at the 40,000-character non-chapter boundary is now estimated at 11,000 tokens even
though its recorded threshold is 10,000. Token-dense non-ASCII chunks can exceed the threshold by
more.

### Scope

This does not bypass the full-text ingestion safety check, which recalculates the estimate of the
entire prepared body. It affects the predictability and size of individual files used by the
scoped-reading path.

### User-visible behavior

Large or token-dense chunks can consume more context than their threshold suggests, making scoped
reading slower or increasing the chance of a truncated or context-limited read.

### Follow-up

Make chunk splitting use the same estimator as chunk admission, then recheck and recursively split
every emitted part until its estimated token count is within the applicable threshold.
