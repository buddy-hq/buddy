# Prepare Resource Minimal Hardening Plan

## Recommendation

Keep preparation agent-led. Do not eagerly parse every attachment before the assistant can start.

The smallest high-return change is to make the existing tool re-entrant and truthful:

1. persist outer preparation failures instead of swallowing them;
2. make `prepare_resource` ensure/check one resource by uploaded source identity;
3. expose stable stage, code, message, and retryability fields;
4. keep the 120-second wait non-terminal;
5. put OCR behind a killable execution boundary before adding a hard OCR deadline;
6. execute the packaged Windows acceptance path.

Items 1–3 are the minimum correctness patch. They do not add pre-message latency and do not remove
the agent's ability to reason, wait, explain, retry, or choose a fallback.

## What Not To Change

- Do not prepare native resources during the upload HTTP request.
- Do not wait for parsing before posting the user's message.
- Do not turn the 120-second `prepare_resource` wait into a parser failure deadline.
- Do not mark OCR failed while the same in-process native call continues running.
- Do not replace agent explanations with generic deterministic UI errors after Send.
- Do not move every extractor into a new service as part of the first patch.

The ownership boundary should remain:

| Owner | Responsibility |
| --- | --- |
| UI | Desktop path resolution, upload/copy status, and pre-send failure messages |
| Agent | When to prepare, how long to wait, how to explain, whether to retry, and what fallback to use |
| Backend | Durable identity, one job, bounded execution, accurate state, and safe persistence |

## Patch 1: Terminalize Outer Failures

### Goal

Once a preparation has stopped executing, `preparing` must not remain the only durable explanation.

### Implementation

Add a small shared preparation-error contract, for example:

```ts
type ResourcePreparationStage = "validate" | "queued" | "copy" | "extract" | "persist"

type ResourcePreparationError = {
  stage: ResourcePreparationStage
  code: string
  message: string
  retryable: boolean
  at: string
}
```

Store it as an optional resource-summary field. Existing `warnings` should still include the message
for compatibility with current agent output.

Replace the silent outer catch in `prepareResourceObject` with a best-effort terminalizer:

```text
prepareResourceObjectInternal throws
  -> read current object manifest
  -> verify generationID still matches the failed task
  -> write status=error and extractionStatus=error
  -> persist structured preparationError and warning
  -> log the original error and any failure to write the terminal manifest
  -> remove the in-flight entry
```

Wrap major boundaries or pass an explicit stage so the terminalizer does not guess whether the
failure came from validation, extraction, or persistence. Start with a small error-code map:

| Condition | Stage/code | Retry guidance |
| --- | --- | --- |
| `ENOSPC` | `persist/disk_full` | Retry after freeing space |
| `EACCES` or `EPERM` | relevant stage + `permission_denied` | Retry after permissions/path change |
| `EBUSY` or sharing violation | `persist/file_busy` | Retryable, especially on Windows |
| worker deadline | `extract/parser_timeout` or `extract/ocr_timeout` | Retryable once the worker is terminated |
| invalid source/signature | `validate/invalid_source` | Not retryable without another source |
| budget exception | `extract/budget_exceeded` | Not retryable with the same source/settings |
| unknown error | current stage + `internal_error` | Retry once; stop after repeated failure |

If the disk is so full that the error manifest cannot be written, no filesystem design can promise a
durable terminal state. Add a later reconciliation rule: a `preparing` manifest older than the
maximum execution window and absent from the in-flight map becomes a recovered error on startup or
next lookup.

### Tests

- Inject a failure before extraction and assert terminal `error`.
- Inject a failure after staged pack creation but before promotion and assert terminal `error`.
- Inject a manifest-write failure and assert the error is logged without an unhandled rejection.
- Start generation A, start generation B, fail A, and prove A cannot overwrite B.
- Simulate stale `preparing` after restart and prove reconciliation is explicit.

## Patch 2: Make Preparation An Ensure/Check Operation

### Goal

Repeated agent calls must return or retry the same logical resource instead of allocating duplicates.

### Minimal durable identity

For the current upload path, the canonical uploaded source path is sufficient:

- it is under `<notebook>/uploads`;
- its random final filename embeds the 10-character upload ID;
- the first object manifest persists it as the immutable original source reference;
- it remains stable across app restart.

This avoids adding a second registry in the first patch. Keep `uploadID` in the prompt/tool metadata
for observability later, but use the canonical original source reference for durable lookup now.

### Implementation

Add an `ensureResourceForSource` operation:

```text
normalize and validate sourcePath
  -> acquire an in-process keyed lock for directory + canonical source
  -> scan/index resource manifests for the same original source reference
  -> if absent, create one object and start generation 1
  -> if present, return that object without creating another
```

The keyed lock closes the concurrent double-create race. The persisted manifest lookup closes the
restart race. If scan cost becomes measurable, add a derived source-identity index later; do not make
the index the only source of truth.

Extend `prepare_resource` with `retry` defaulting to `false`:

| Existing state | `retry=false` | `retry=true` |
| --- | --- | --- |
| none | Create and start | Create and start |
| `preparing` | Join/check same generation | Do not start concurrent duplicate work |
| `ready` | Return existing result | Rebuild only if explicitly supported by product UX |
| `unsupported` | Return existing result | Rebuild same object |
| `error` | Return existing error | Start a new generation on the same object |
| `stale` | Return stale result | Refresh managed source and rebuild same object |

Change the prompt prelude from “call exactly once” to “call with the exact source path; repeated
calls check the same resource, and use `retry=true` only after a terminal retryable failure.”

The tool can still accept arbitrary workspace sources. Those sources use the same canonical-path
identity. If a source changes, the existing stale/rebuild semantics apply.

### Tests

- Two sequential calls for one upload return one object ID.
- Two concurrent first calls return one object ID and one managed copy.
- A check during `preparing` joins the same generation.
- A check after `ready` does not rebuild.
- A check after `error` returns the same structured error.
- `retry=true` increments generation on the same object and does not create a second alias.
- Restart/reload still resolves the same object from its persisted original source reference.
- Windows path normalization and casing behavior are covered on a Windows runner.

## Patch 3: Preserve Fast Wait Semantics And Improve Results

### Wait versus execution

Keep the current values:

```text
poll interval:       500 ms
default caller wait: 120 s
maximum caller wait: 600 s
```

These values control how long the agent tool call waits. They do not declare the parser dead.

Return a stable result shape for both terminal and non-terminal outcomes:

```text
object_id
source_identity
status
stage
code
message
retryable
started_at
updated_at
timed_out
next_step
```

Example after the normal two-minute wait:

```text
status=preparing
stage=extract
code=in_progress
message=OCR is still running in the background.
retryable=false
timed_out=true
next_step=check_the_same_resource_later
```

Example after a real killable OCR deadline:

```text
status=error
stage=extract
code=ocr_timeout
message=OCR exceeded Buddy's execution limit and was stopped.
retryable=true
timed_out=false
next_step=retry_the_same_resource_or_use_native_text
```

Example for finalization failure:

```text
status=error
stage=persist
code=disk_full
message=Buddy ran out of disk space while saving the prepared document.
retryable=true
timed_out=false
next_step=free_space_then_retry_the_same_resource
```

This preserves the intended UX: generation starts quickly, the first tool call can report ongoing
work, and the agent later has enough detail to explain a real failure accurately.

## Patch 4: Add A Real OCR Execution Deadline

### Why this is separate

LiteParse/Tesseract does not expose progress or cancellation. A timeout is only real if Buddy can
terminate the execution boundary. A timeout around the current in-process promise is not acceptable.

### Smallest correct boundary

Extract a `PdfExtractionRunner` behind the existing extractor API. Implement the first runner with a
dedicated Node worker using the already-proven SheetJS sidecar pattern:

- one bundled worker entry;
- compact request containing source path, mode, and private staging directory;
- staged full text, page text, cover, and metadata rather than a large structured clone;
- one active PDF worker initially;
- a bounded pending queue;
- an active-execution watchdog;
- cleanup in `finally` and stale-temp cleanup on a later run/startup;
- typed timeout/exit/protocol errors.

Before accepting a worker thread as the boundary, prove that `worker.terminate()` completes promptly
while the test worker is stuck in the same kind of native call. If the LiteParse native path does not
terminate within a small grace period, keep the runner interface and use an OS child process instead.
The process boundary is more invasive but is the only reliable hard stop in that case.

### Initial limits

Use named policy constants and benchmark them on representative low-end hardware:

| Policy | Provisional value | Reason |
| --- | ---: | --- |
| Active PDF workers | 1 | Avoid concurrent OCR pressure in the shared app |
| Waiting PDF jobs | 4 | Keep backlog bounded without rejecting ordinary multi-file prompts |
| PDF queue wait | 120 seconds | Return an explicit queued result rather than wait invisibly |
| Active targeted-OCR deadline | 15 minutes | Longer than the 10-minute maximum tool wait; generous for the current 10-page OCR cap |
| Termination grace | 5 seconds | Detect a worker boundary that is not actually killable |

Fifteen minutes is a starting safety boundary, not a claim that all valid OCR must finish within that
time. Record actual duration, page count, input size, platform, architecture, and termination outcome
locally so the limit can be tuned from evidence.

### Error handling

On deadline:

1. stop accepting output from that generation;
2. terminate the worker/process;
3. wait for the termination grace;
4. remove staged output;
5. throw a typed `ocr_timeout` error;
6. let the normal resource error path finalize the same object generation;
7. return that durable error on the next check.

Do not automatically retry OCR. The agent should decide whether to retry once, use native-only text,
split the document, or explain the limitation.

### Tests and release proof

- A fake worker that never responds reaches durable `ocr_timeout` and is terminated.
- Caller wait expires before execution deadline without cancelling the worker.
- Checking again returns the same object/generation.
- Retry starts exactly one new generation.
- Targeted OCR of 1, 5, and 10 pages succeeds below the deadline on representative PDFs.
- Packaged macOS arm64 and Windows x64 builds execute the real bundled PDF worker.
- Backend shutdown cleans up or kills the PDF boundary.

## Patch 5: Small Platform Compatibility Win

If arbitrary notebook locations are in launch scope, add the hard-link fallback in the same release:

```text
try hard-link partial -> random final name
  EEXIST -> choose another random name
  unsupported-link error -> copy partial -> final with exclusive/no-overwrite flag
  success -> unlink partial
  any failure -> remove partial and any incomplete final
```

Do not fall back on every error. Permission denial, disk full, invalid paths, and file locks should
remain specific failures instead of triggering duplicate I/O blindly.

Then run the packaged Windows acceptance matrix from
[known issues](./known-issues.md#pr-004-packaged-windows-execution-is-unproven).

## Work That Can Follow

The first correctness patch does not need to include:

- a global scheduler for every extractor;
- process isolation for every parser;
- backend automatic restart;
- transactional backup/swap promotion;
- bounded page/chunk write fan-out;
- a total pack byte cap;
- free-space preflight and notebook quota;
- full upload garbage collection;
- a source-identity database index;
- a multi-user security model.

These remain important and are tracked in [known issues](./known-issues.md), but bundling all of them
into the first change would increase regression risk without improving the central agent-led UX.

## Additional Limits To Introduce Later

These are recommended starting hypotheses, ordered by confidence. They should be named constants,
tested at boundaries, and tuned with local benchmark data.

| Limit | Starting policy | Confidence |
| --- | --- | --- |
| Pack filesystem write concurrency | 8–16 | High |
| Global active heavy preparations | 1 below 8 GiB RAM, otherwise 2 | Medium |
| Global queued heavy preparations | 8 | Medium |
| Global queue deadline | 120 seconds | Medium |
| Upload copy deadline | 5 minutes, with byte progress | Medium; cloud files need testing |
| Aggregate derived pack | 256 MiB | Medium-low |
| Required free-space headroom | 512 MiB before preparation | Medium-low |
| Per-notebook managed resource storage | 4 GiB initially | Low until product usage is measured |

The OCR execution deadline is different: because an unobservable hang has no natural completion
signal, some killable hard boundary is required even if the exact duration changes.

## Delivery Order

| Order | Change | Invasiveness | Return |
| --- | --- | --- | --- |
| 1 | Terminalize outer errors and expose structured error data | Small | Removes permanent unexplained `preparing` for recoverable failures |
| 2 | Ensure/check by canonical uploaded source and add `retry` | Small-to-medium | Makes the agent-led flow safely re-entrant and prevents duplicate objects |
| 3 | Packaged Windows acceptance run | Verification only, plus fixes found | Closes the largest platform unknown |
| 4 | Killable PDF runner and OCR deadline | Medium | Contains the one class of work Buddy cannot currently observe or stop |
| 5 | Hard-link publication fallback when required by launch scope | Small | Restores uploads on unsupported notebook filesystems |
| 6 | Global scheduling, bounded writes, quotas, restart/reconciliation | Medium-to-large | Protects extreme load and long-term operation |

If only one code patch can land immediately, do items 1 and 2 together. They directly improve the
agent's error explanations and retries while preserving the current fast, nondeterministic policy
path.
