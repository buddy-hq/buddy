# Native PDF Double-Delivery Overflow Postmortem

Date: 2026-07-26

Investigated: 2026-07-27

Status: root cause confirmed; remediation approved

## Summary

A learner attached a 160-page PDF and asked Buddy to help them understand the
book. The prepared full text was only estimated at 52,435 tokens, but the
session compacted immediately after `ingest_full_text`.

The conversation was not a roughly 52,000-token conversation. Before
`ingest_full_text` ran, OpenAI had already reported more than 210,000 tokens for
the request containing the native PDF. Buddy then emitted the prepared text for
the same PDF into the next model request. The combined request exceeded the
provider's usable context window, the provider returned a context overflow, and
OpenCode reacted by automatically compacting the session.

Four independent weaknesses aligned:

1. PDF attachments used `model-and-resource` delivery, so the complete PDF was
   sent directly to the model while also being prepared as a Buddy resource.
2. The reading workflow subsequently called `ingest_full_text`, representing
   the same document in model context a second time.
3. The Context Fix implementation that would have rejected this ingestion was
   still uncommitted in its worktree. Merging the `context-fix` branch did not
   transfer those working-tree changes.
4. Resource-pack token estimates used a fixed four-characters-per-token ratio.
   Garbled non-ASCII PDF extraction made the 52,435-token estimate materially
   lower than the provider's later token accounting.

The immediate overflow required the first three conditions. The estimator
error did not by itself cause the initial compaction, but it reduced the safety
of the ingestion policy and must be retained as a separate follow-up.

## User-Visible Impact

- Buddy compacted before answering the learner's first request.
- The transcript made a 40,000-word book appear to consume an implausibly large
  fraction of a roughly 250,000-token model window.
- The automatic continuation said the provider limit had been exceeded by
  large media attachments and that media had been removed.
- The learner had to tell Buddy that the prepared resource was still available
  before the workflow continued.
- The same PDF was processed twice through different paths, increasing latency,
  input usage, and the chance of overflow without adding corresponding value.

## Incident Identifiers

- Buddy session:
  `ses_0605ebed4ffehponQCmT51wxXS`
- Session title:
  `Understanding Purple Cow by Seth Godin`
- Model:
  `openai/gpt-5.6-luna`
- Resource object:
  `01KYFT2XYW2407QTPDN28HBX2Q`
- Source:
  `Purple_Cow__Transform_Your_.pdf - Seth Godin--ZCyLXboYgC.pdf`

The source PDF was:

- 903,631 bytes;
- 160 pages;
- not encrypted.

The prepared full-text record reported:

- 209,738 characters;
- 52,435 estimated tokens.

## Evidence Sources

The diagnosis used:

- the exported session trace captured on 26 July 2026;
- the live development OpenCode SQLite database;
- the prepared resource pack and source PDF metadata;
- the current Buddy attachment submission code;
- the vendored OpenCode file-part and compaction paths;
- the uncommitted `context-fix` worktree.

No conclusion depends only on the UI counter or on converting the learner's
word count into tokens.

## Timeline

Times below are local to the incident machine.

| Time | Event |
| --- | --- |
| 23:42:53 | The learner submitted the PDF and asked Buddy to help them understand the book. The user turn contained both native-resource metadata and a complete PDF file part. |
| 23:43:00 | Buddy loaded the reading skill. The first assistant step reported 210,039 input tokens and 210,083 total tokens. |
| 23:43:05 | `prepare_resource` completed and created resource object `01KYFT2XYW2407QTPDN28HBX2Q`. |
| 23:43:13 | `ingest_full_text` emitted the prepared body. Its budget recorded 212,034 live tokens, a 52,435-token document estimate, a generic 922,000-token input window, and a generic 1,050,000-token context window. |
| 23:43:18 | OpenCode started the next assistant request. It produced no token usage and no finish reason because the provider rejected the request before a normal response completed. |
| 23:43:20 | OpenCode created an automatic compaction marker with `overflow=true`. |
| 23:43:22 | The compaction summary recorded that the complete extracted text had been ingested and repeated the 52,435-token estimate. |
| 23:43:28 | OpenCode inserted a synthetic continuation explaining that large media had exceeded the provider limit and had been removed from context. |
| 23:44:20 | The learner replied that the document was available in resources. |
| 23:44:27 | Buddy called `ingest_full_text` again after compaction, now with only 18,919 live tokens reported before the tool call. |
| 23:44:32 | The provider completed the response with 178,691 uncached input tokens, 19,968 cached input tokens, and 198,755 total tokens. The session did not compact again. |

## End-To-End Delivery Path

### 1. PDF classification selected two delivery paths

The workspace file policy classified PDF as:

```text
format=pdf
delivery=model-and-resource
```

Other native resource formats such as EPUB, DOCX, PPTX, and spreadsheets were
already `resource-only`.

### 2. The composer emitted two parts for the same PDF

For a ready `model-and-resource` attachment, the web prompt builder emitted:

1. a `native-resource-attachment` metadata part; and
2. a model `file` part pointing at the uploaded PDF.

The metadata part caused Buddy to add the preparation reminder. The file part
caused OpenCode to send the complete PDF to the model.

### 3. Buddy preserved both parts

The Buddy prompt pipeline validated the native-resource metadata, built the
turn prelude, and kept the file part in the transformed prompt. It did not run
a page-count, token, current-context, or aggregate attachment-budget check.

### 4. OpenCode read the whole file

OpenCode resolved the `file:` URL by reading the complete PDF, base64-encoding
it, and storing a PDF file part. Model-message conversion retained non-text file
parts, and the native request adapter converted the PDF into provider media
input.

There was no content-aware admission decision between the filesystem read and
the provider request.

### 5. The reading workflow prepared and ingested the same document

The user prelude correctly required `prepare_resource` for the durable resource
path. After preparation, the reading policy selected whole-full-text mode and
called `ingest_full_text`.

The workflow did not distinguish:

```text
PDF is already present as native model input
```

from:

```text
PDF exists only as a prepared resource
```

Consequently, durable preparation was followed by duplicate live-context
delivery.

## Token Accounting

### Native PDF request

The first assistant step reported:

```text
input=210039
output=19
reasoning=25
total=210083
```

A post-compaction request without the native PDF used roughly 18,000 to 20,000
total tokens before full-text output. This shows that the 160-page native PDF,
not ordinary Buddy instructions alone, accounted for the large initial prompt.

Using the later baseline only as an approximation:

```text
native PDF contribution ≈ 210039 - 19000
                        ≈ 191000 tokens
```

This is approximately 1,200 provider-accounted tokens per page for this
specific PDF. It is incident evidence, not a universal PDF-token formula.

### Duplicate full-text decision

The old ingestion budget recorded:

```text
generic input window        = 922000
live usage estimate         = 212034
prepared text estimate      = 52435
required reserve            = 96000
reported remaining after    = 657531
```

Those numbers made ingestion appear safe because the tool trusted generic
million-token catalog metadata.

Against the previously observed 258,400-token effective OpenAI OAuth window,
the same preflight would have been:

```text
212034 + 52435 = 264469 tokens
264469 - 258400 = 6069 tokens over the effective window
```

That sum excludes any additional request framing and output allowance. The
provider overflow is therefore consistent with the persisted usage.

### Prepared-text estimate drift

After compaction removed the native PDF, the second full-text request completed
with:

```text
uncached input = 178691
cached input   = 19968
total          = 198755
```

The resource pack had estimated only 52,435 tokens. The extracted body contains
substantial garbled non-ASCII text, while the estimator is:

```text
estimated_tokens = ceil(UTF-16 string length / 4)
```

That heuristic assumes prose whose token density is close to four characters
per token. It is not conservative for mojibake, symbol-heavy text, many writing
systems, or other token-dense content.

The provider request contains more than the document body, so 178,691 cannot be
treated as an exact tokenizer result for the file alone. It nevertheless proves
that the 52,435 estimate was not a safe approximation for this extracted text.

## Root-Cause Tree

### Primary root cause: duplicate live-context delivery

The same PDF entered the model through both:

```text
native PDF media input
```

and:

```text
ingest_full_text tool output
```

Either representation was sufficient for whole-document access. Sending both
made their token costs additive.

### Primary root cause: no native attachment admission gate

Buddy admitted native PDFs using filesystem constraints rather than model
context constraints.

The existing limits were:

- at most eight native resources per prompt;
- at most 64 MiB per uploaded resource.

Those limits protect application memory, transport, and extraction work. They
do not protect model context. The incident PDF was less than 1 MiB and still
created a roughly 210,000-token first request.

### Primary root cause: the Context Fix was not integrated

The completed Context Fix existed only as modified and untracked files in the
`context-fix` worktree. Its branch reference pointed at commits already present
in the current history.

Git merges commit objects, not another worktree's unstaged or untracked files.
Merging the branch therefore did not transfer:

- the 250,000-token tool-local input-window ceiling;
- the OpenAI OAuth account-model overlay;
- their tests;
- the full-text-ingestion design documents.

In the incident session, the running tool still saw:

```text
input_window=922000
context_window=1050000
```

With the Context Fix actually integrated, the tool-local calculation would
have used a 250,000-token maximum:

```text
remaining before ingestion = 250000 - 212034 = 37966
remaining after ingestion  = 37966 - 52435 = -14469
required reserve           = 62500
```

The tool would have returned scoped reading without emitting the full-text body.

### Contributing cause: non-conservative token estimation

The fixed four-characters-per-token estimator materially understated the
provider cost of this corrupted extraction. The estimator did not cause the
native PDF to be sent and did not explain the first 210,039-token request, but
it made the full-text preflight more optimistic than intended.

### Reactive mechanism: provider-overflow compaction

The compaction marker was:

```text
auto=true
overflow=true
```

The zero-token assistant attempt immediately before it had no finish reason.
This was not Buddy proactively compacting a 52,000-token conversation. The
provider rejected an oversized request, and OpenCode reacted by compacting.

## What Was Ruled Out

### Not a 40,000-word book filling the model by itself

The document's word count does not explain the first request. The provider had
already accounted for more than 210,000 tokens before the extracted text was
emitted.

### Not a duplicate frontend submission

The initial user turn was submitted once. The duplicate document
representation was created by the intentional `model-and-resource` plus
`ingest_full_text` workflow, not by the composer posting the prompt twice.

### Not arbitrary early proactive compaction

The persisted overflow marker and empty failed assistant attempt show a
provider-size rejection. OpenCode's compaction was recovery after that error.

### Not solved solely by correcting the composer counter

Accurate OpenAI account limits improve the counter and normal compaction, but a
native PDF can consume unpredictable provider tokens before Buddy receives
usage. Multiple PDFs can overflow the first request even if
`ingest_full_text` never runs.

## Remediation

### 1. Integrate the existing Context Fix

Commit and merge the complete Context Fix so full-text admission uses:

```text
tool_input_window =
  min(model.input_window ?? model.context_window, 250000)
```

Retain its live-usage calculation, reserve, scoped-reading fallback, OpenAI
account-model overlay, and regression coverage.

### 2. Gate native PDF delivery

Use a deliberately simple hybrid policy:

- at most 30 pages per PDF for native model delivery;
- at most 50 native-PDF pages combined in one incoming user message;
- an unknown, unreadable, encrypted, over-per-file, or over-aggregate PDF is
  `resource-only`;
- backend validation is authoritative;
- frontend classification may mirror the result for immediate feedback.

These are product safety bounds, not claims about exact provider tokenization.
They preserve native processing for articles and ordinary papers while routing
books through the prepared-resource path.

The aggregate bound resets for each incoming user message. Previously admitted
PDFs can remain in live history and contribute to normal context growth until
compaction; the gate is not a session-wide attachment quota.

### 3. Prevent duplicate full-text ingestion

When a PDF was delivered natively in the session, durable preparation may still
run, but `ingest_full_text` must not emit that resource's entire text again.

The tool should return a clear completed fallback explaining that the resource
is already present as native model input and that the prepared pack remains
available for citations, navigation, and later scoped reading.

This must be enforced by runtime state or message evidence, not only by prompt
wording.

### 4. Harden the estimator independently

Replace the fixed character-ratio estimate with a fast UTF-8-aware heuristic:

```text
estimate =
  (ASCII characters / 4 + non-ASCII UTF-8 bytes / 2)
  + 10% safety margin
```

Resource preparation uses the shared estimator for full text and chunks and
returns the resulting `full_text_est_tokens`. `ingest_full_text` also scans the
actual prepared body and takes the maximum of the stored and fresh estimates,
so packs created before this remediation cannot bypass it with stale metadata.

This is a conservative admission heuristic, not authoritative provider
tokenization. It keeps ordinary English permissive while accounting for
garbled PDF extraction, non-Latin writing systems, and symbol-heavy text
without adding PDF reparsing, OCR, or a provider-specific tokenizer to the hot
path.

For the exact 209,738-character incident body, the new heuristic returns
188,955 tokens instead of 52,435. That is conservative relative to the later
provider request's 178,691 uncached input tokens, which also included request
content beyond the document body.

## Why The Remediation Is Split

Each control owns a different failure boundary:

| Control | Prevents |
| --- | --- |
| OpenAI account overlay | Misleading OAuth model counters and late normal compaction |
| 250,000-token `ingest_full_text` ceiling | Very large tool output based on generic model metadata |
| Native PDF page gates | Oversized PDFs reaching the provider before tool preflight |
| Native-delivery duplicate guard | The same PDF being represented twice in live context |
| Token-estimator hardening | Optimistic admission for token-dense extracted text |

No one control substitutes for all the others.

## Success Criteria

- A PDF at or below 30 pages may retain native model delivery.
- Two or more PDFs may retain native delivery only when their combined page
  count is at most 50.
- Larger or unprobeable PDFs are prepared as resources without a model file
  part.
- A natively delivered PDF can be prepared but cannot subsequently emit its
  complete text through `ingest_full_text`.
- The 160-page incident PDF reaches the resource pipeline without entering the
  initial provider request.
- A 52,435-token estimate cannot be admitted against a 212,034-token live
  session under the 250,000-token tool ceiling.
- The corrupted 209,738-character extraction is re-estimated from UTF-8 content
  instead of trusting its stale 52,435-token pack metadata.
- OpenAI OAuth sessions use account-specific effective limits when available
  and safely retain generic metadata when enrichment fails.
- No vendored OpenCode patch is required.

## Verification Plan

- Prompt-builder tests for PDF delivery below, at, and above 30 pages.
- Per-message aggregate tests at 50 pages and one page beyond.
- Multi-file tests proving per-file and aggregate limits are both enforced.
- Backend tests proving client-supplied delivery metadata cannot bypass the
  gate.
- Tool tests proving a natively delivered resource does not emit
  `<full_text>`.
- Estimator tests covering ordinary ASCII and token-dense non-ASCII text.
- A tool test proving stale pack metadata cannot bypass a fresh-body estimate.
- Existing Context Fix boundary, OAuth fallback, timeout, and authentication
  race tests.
- Root `bun lint` and root `bun typecheck`.

## Lessons

- Filesystem size is not a model-context budget.
- A durable resource path and a native model path must not silently duplicate
  the same content.
- Git branch integration must verify committed content, not branch names.
- Provider usage is the best incident evidence available after a native media
  request.
- A character-ratio estimate is a heuristic and must fail conservatively at
  safety boundaries.
- Compaction labeled `overflow=true` is evidence of provider rejection, not
  proof that proactive compaction ran too early.

## Related Documentation

- [Full-Text Ingestion Design](./design.md)
- [Full-Text Ingestion Known Issues](./known-issues.md)
- [Prepare Resource](../prepare-resource/design.md)
- [Reading Mode](../reading-mode/design.md)
