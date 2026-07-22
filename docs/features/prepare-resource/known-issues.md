# Prepare Resource Known Issues

## Status And Scope

This is the issue inventory for the complete desktop file path, not only SheetJS:

```text
drop/select -> notebook upload -> prompt handoff -> prepare_resource -> managed object
-> extractor -> staged resource pack -> manifest -> agent consumption
```

Judgments are based on the implementation audited on 22 July 2026 and Buddy's stated macOS and
Windows launch path.

Status labels:

- **Pre-launch correctness**: a normal recovery path can lie, duplicate work, or never terminate.
- **Release verification**: implementation may be correct, but a promised packaged platform is not
  proven.
- **Conditional compatibility**: blocking only when the product promises the affected filesystem or
  environment.
- **Post-launch hardening**: important containment for extreme load, accumulation, or uncommon
  failures; not evidence that ordinary documents fail continually.
- **Accepted design**: deliberate behavior that should not be “fixed” by making preparation eager.

## Launch Judgment

Most findings are not happy-path blockers. The current path should handle ordinary, valid documents,
and malformed or over-budget content usually fails only its resource. The high-value pre-launch work
is much smaller than a rewrite.

| ID | Issue | Judgment |
| --- | --- | --- |
| PR-001 | Outer preparation errors can leave a resource permanently `preparing` | Pre-launch correctness |
| PR-002 | Repeating `prepare_resource` creates a new object/job | Pre-launch correctness for agent-led retries |
| PR-003 | LiteParse/Tesseract has no hard execution boundary | Pre-launch liveness if scanned PDF/OCR is launch-critical or hangs have been observed |
| PR-004 | Packaged Windows path has not been executed end to end | Release verification |
| PR-005 | Upload publication requires hard-link support | Conditional compatibility |
| PR-006 | Upload copy lacks a backend deadline and byte-counted cancellation | Post-launch hardening, elevated for cloud files |
| PR-007 | Only spreadsheet preparation has a bounded scheduler | Post-launch hardening |
| PR-008 | Backend utility death is not restarted | Post-launch resilience |
| PR-009 | Rebuild promotion removes the old pack before new rename | Post-launch recovery hardening |
| PR-010 | Page/chunk/artifact writes use unbounded `Promise.all` fan-out | Post-launch load hardening |
| PR-011 | No aggregate pack/notebook byte quota or complete garbage collection | Post-launch storage hardening |
| PR-012 | Spreadsheet queue wait and total RSS are not bounded | Post-launch load hardening |
| PR-013 | Error output lacks a stable stage/code/retryability contract | Pre-launch UX hardening; small and high return |
| PR-014 | Path containment is lexical and upload records are not durable identities | Defense in depth in the current single-user model |

## Blast Radius By Failure

| Failure | Current blast radius | Existing containment |
| --- | --- | --- |
| Unsupported, corrupt, or over-budget document | One resource | Extractor catch writes error/unsupported pack metadata |
| SheetJS worker throw, protocol failure, or five-minute timeout | One spreadsheet resource | Worker termination, staged output, per-resource error handling |
| Spreadsheet queue full | The newly submitted spreadsheet job | Queue rejects after 32 waiting jobs; other formats continue |
| One OCR call never returns | At least one resource indefinitely; CPU/native memory can affect the shared backend | Automatic OCR is limited to at most 10 selected pages, but there is no wall-clock stop |
| Native parser crash or host OOM | Entire backend utility process | Renderer/main process remain separate, but every local API/session stops |
| Disk full during upload | One upload initially; the full notebook or host may then be unable to write | Partial cleanup is attempted; 64 MiB source cap exists |
| Disk full or file lock during pack finalization | Usually one resource, potentially stuck `preparing` | Generation staging exists; outer failure is currently swallowed |
| Hard links unsupported in notebook filesystem | Every native upload in that notebook | None; no publish fallback |
| Repeated agent call | Duplicate objects, copies, extraction, aliases, and disk use | Deduplication applies only to the same object ID in one process |
| Backend utility exits | All uploads, sessions, tools, and preparation in the app | Exit is logged; app relaunch is required |
| Thousands of page/chunk writes | Shared disk/descriptor pressure and delayed unrelated work | Counts are bounded, but write concurrency is not |

## PR-001: Outer Preparation Failure Can Remain `preparing`

### Status

Pre-launch correctness issue.

### Current behavior

[`buildResourcePack`](../../../packages/buddy/src/resource-packs/service.ts) catches parser, budget,
chunking, and ordinary pack-write errors and tries to write an error metadata file. That path is
agent-explainable.

The outer object preparation path performs additional work after and around that catch:

- source validation;
- staging-directory setup and cleanup;
- reading staged metadata;
- statting the managed source;
- removing the previous pack;
- renaming the staged pack;
- writing the object manifest;
- rebuilding the alias index.

Failures from this layer reach the scheduler in
[`resource-registry-service.ts`](../../../packages/buddy/src/resources/resource-registry-service.ts),
which currently does:

```ts
prepareResourceObjectInternal(input).catch(() => undefined)
```

The manifest may therefore remain `preparing` after work has already failed.

### User-visible failure

The first tool call waits up to 120 seconds and truthfully says “still preparing.” Every later check
can say the same thing forever. The agent has no error message to explain and cannot distinguish slow
OCR from a disk or finalization failure.

### Required behavior

Every caught outer error should best-effort finalize the matching generation as `error`, preserve a
human-readable message, and log any failure to persist that terminal state. A generation check must
prevent an old failed task from overwriting a newer rebuild.

Disk exhaustion can make any persistence impossible. A later stale-`preparing` reconciliation rule
is still needed for that irreducible case.

## PR-002: Preparation Is Not Idempotent By Source Upload

### Status

Pre-launch correctness issue for the intended agent-led recovery model.

### Current behavior

The prompt says to call `prepare_resource` exactly once. The tool accepts a source path and each call
invokes `addResource`, which allocates a new object ID, alias, managed source copy, and background
preparation.

The UI has a 10-character `uploadID`, and the published upload path contains it, but the submitted
prompt part discards the first-class field. In-process deduplication is keyed by object ID, so it
cannot join two registrations for the same upload.

### Why it matters

The agent is specifically expected to reason about failures and retry. A retry instruction that
duplicates the resource is not a safe recovery primitive. It also creates invisible storage growth
and ambiguous aliases.

### Required behavior

Treat preparation as an ensure/check operation for one durable source identity:

```text
no object      -> create object and start preparation
preparing      -> check or wait for the same object
ready          -> return the existing object
unsupported    -> return the existing terminal result
error          -> return the existing error
retry=true     -> start a new generation on the same object
```

The smallest implementation can use the canonical uploaded source path as the durable key because
the random upload ID is already embedded in that path and object manifests persist the original
source reference. An explicit upload-ID index can replace it later if upload paths become mutable.

## PR-003: OCR Has No Killable Execution Boundary

### Status

Pre-launch liveness recommendation when OCR is part of the promised critical path. The issue is
concrete if Tesseract hangs have already been observed.

### Current behavior

LiteParse exposes no Buddy cancellation or progress hook around `parser.parse`. Buddy invokes it in
the shared backend path. The 120-second tool wait only stops polling; it does not stop OCR or mark it
failed. Even the maximum 600-second wait is only observational.

Selective OCR limits automatic OCR to 10 pages. This prevents a scanned 500-page book from
automatically turning into a 500-page OCR run, but a native call on one of those 10 pages can still
hang.

### Why a simple timeout race is incorrect

Wrapping `parser.parse` in `Promise.race` would let Buddy change the manifest to `error` while the
unobservable native work continued consuming CPU or memory. A retry could then start a second copy
of the same runaway work. That is worse containment, not a hard timeout.

### Required behavior

Run the complete PDF/LiteParse extraction in a terminable worker or child-process boundary. Apply a
separate active-execution deadline there, terminate the boundary on expiry, and persist
`stage=extract`, `code=ocr_timeout`, and `retryable=true`. Keep the normal 120-second tool wait
unchanged and non-terminal.

The initial deadline should be deliberately generous and benchmarked on low-end Windows and macOS
hardware. The minimal plan proposes 15 minutes as a provisional starting policy for the current
maximum 10-page automatic OCR pass, not as a permanent quality threshold.

## PR-004: Packaged Windows Execution Is Unproven

### Status

Release verification issue.

### Current evidence

The production backend build, Electron build, direct worker smoke, and packaged macOS arm64 ASAR
smoke have prepared a real XLSX successfully. The packaged smoke tests the worker location and
staged-output protocol rather than checking only that a sidecar file exists.

Windows packaging and runtime have been reviewed statically but not executed in this audit.

### Required release gate

Run a packaged Windows build through:

- valid PDF, DOCX, PPTX, and XLSX upload/preparation;
- malformed XLSX returning an explainable resource error;
- an over-64-MiB upload returning a clear UI error;
- repeat/check/retry behavior after idempotency is added;
- a OneDrive-backed source;
- file locking or Defender scanning during upload and promotion;
- a deep path and a disk-full simulation.

This is not evidence of a known Windows bug. It is missing evidence on a promised platform.

## PR-005: Upload Publication Is Hard-Link Only

### Status

Conditional compatibility issue.

### Current behavior

The partial and final names live in the same `uploads` directory, and publication calls `link()`.
APFS and NTFS normally support hard links. exFAT/FAT, some network shares, cloud-backed filesystems,
and restricted configurations may not.

On such a notebook, every native upload fails after the first copy succeeds.

### Launch judgment

- If Buddy supports only managed/local notebooks on APFS and NTFS at launch, this can follow.
- If arbitrary opened folders, external drives, or network/cloud notebooks are promised, this is a
  compatibility blocker.

### Intended fix

Retain the hard-link fast path. On a known unsupported-link error, copy the completed partial to the
random final name with exclusive no-overwrite semantics, then remove the partial. Preserve collision
retry and cleanup behavior.

## PR-006: Upload Copy Is Not Deadline-Bounded Or Truly Cancelled

### Status

Post-launch hardening, elevated for OneDrive/iCloud placeholders and removable/network media.

### Current behavior

The backend checks 64 MiB before and after `copyFile`. It does not receive the request's abort signal,
does not count bytes while copying, and has no deadline. Removing a chip aborts the browser request,
but an already-running filesystem copy may continue and publish an orphan.

A source that grows during copying can exceed the budget before the post-copy rejection. A cloud
placeholder can stall a copy for an OS-controlled duration.

### Intended fix

Use a backend copy semaphore and a byte-counted stream or equivalent cancellable copy. Enforce the
64-MiB ceiling while bytes are written, propagate abort, and add a platform-tuned deadline. Clean up
both partial and any fallback final name after interruption.

## PR-007: There Is No Global Native Preparation Scheduler

### Status

Post-launch load hardening.

### Current behavior

SheetJS has its own one-or-two-worker lane. PDF, EPUB, DOCX, PPTX, HTML, and text extraction do not
share a global preparation budget. Distinct objects can begin those preparations concurrently in
the backend utility process.

### Failure mode

Several heavy documents can compete for CPU, memory, temporary disk, and filesystem writes. This is
mostly a load/performance issue until it triggers host OOM or backend termination.

### Intended fix

Introduce one global scheduler with format weights or at least `light` and `heavy` lanes. Queue time
must be visible separately from execution time. Do not make the user wait before message generation;
the agent should observe `stage=queued` through the existing tool flow.

## PR-008: Backend Utility Death Requires App Relaunch

### Status

Post-launch resilience hardening unless stress tests demonstrate ordinary documents can kill it.

### Current behavior

Electron observes and logs utility-process termination but does not restart the backend. The main and
renderer processes may survive, yet all sessions, APIs, uploads, and preparation stop.

### Intended fix

Add bounded restart with health verification and a circuit breaker. On restart, reconcile objects
left `preparing` and stale staging directories before accepting retries. Avoid an infinite crash
loop on a consistently bad source.

## PR-009: Pack Promotion Is Not Rebuild-Transactional

### Status

Post-launch recovery hardening.

### Current behavior

The new generation is staged, but promotion removes the current pack before renaming the staging
pack. A crash or Windows file lock between those operations can lose a previously usable pack.

Initial imports have no prior ready pack to lose, so the larger risk is rebuild/retry behavior.

### Intended fix

Use a backup/swap sequence like the managed-object store: rename current to backup, rename staging to
current, restore backup on failure, and delete backup only after manifest finalization succeeds.

## PR-010: Derived Writes Have Unbounded Fan-Out

### Status

Post-launch load hardening.

### Current behavior

The pack budget permits up to 5,000 page files and 10,000 chunk files. Storage writes pages, chunks,
artifact removals, and artifact additions with separate unbounded `Promise.all` calls.

### Failure mode

A legal extraction can create thousands of simultaneous filesystem promises, causing descriptor,
memory, antivirus, or I/O pressure. Windows scanning and cloud-backed notebooks amplify this.

### Intended fix

Use a shared bounded write mapper, initially 8–16 active writes, and measure on APFS, NTFS, OneDrive,
iCloud, and exFAT.

## PR-011: Storage Growth Is Not Product-Bounded

### Status

Post-launch storage hardening.

### Current behavior

Limits apply to individual source and text fields, but not to total pack bytes or notebook storage.
One source can occupy:

- up to 64 MiB in `uploads`;
- another managed source copy up to 64 MiB;
- staging during object and pack publication;
- full text, duplicated page/chunk representations, CSV artifacts, and cover data.

There is no free-space preflight, per-notebook quota, automatic upload deletion after managed-copy
commit, or comprehensive startup sweep for abandoned object/pack staging.

### Intended fix

Add aggregate pack accounting, a free-space safety margin, upload ownership/lifecycle, stale partial
sweeps, and a product-level notebook quota. A 256-MiB derived-pack ceiling, 512-MiB free-space margin,
and 4-GiB notebook quota are reasonable starting hypotheses, not validated product constants.

## PR-012: Spreadsheet Queue Wait And Total RSS Are Unbounded

### Status

Post-launch load hardening.

### Current behavior

The SheetJS worker lane allows 32 waiting jobs. The five-minute timeout begins only after a worker
starts, so the final queued job can wait far longer than five minutes.

Worker V8 heap limits exclude buffers, native/external allocations, staged-output rehydration in the
parent, and aggregate process RSS. A one-million-string-cell stress workbook completed in the audit
at about 504 MiB peak RSS, close enough to show that the 512-MiB old-generation limit is not a total
memory ceiling.

### Intended fix

Reduce the queue, add a queue deadline, expose `stage=queued`, and measure whole-process RSS. Use an
OS process only if telemetry shows the thread boundary cannot contain real workloads adequately.

## PR-013: Failure Output Has No Stable Stage/Code Contract

### Status

Small, high-return UX hardening recommended with PR-001.

### Current behavior

The tool exposes status and warning strings. Ordinary error messages are often useful, but callers
cannot reliably distinguish validation, queue, extraction, timeout, promotion, permission, or disk
failures, nor whether retry is sensible.

### Intended contract

Terminal and non-terminal results should include:

```text
status
stage = validate | queued | copy | extract | persist
code
message
retryable
started_at
updated_at
timed_out  # caller wait only
```

The agent remains responsible for explaining the result in context. Structured fields make that
explanation accurate without making parsing eager.

## PR-014: Source Containment Is Path-Based, Not Upload-Record-Based

### Status

Defense in depth for Buddy's current single-user, single-machine trust model.

### Current behavior

Prompt validation resolves a path, checks lexical containment under `uploads`, verifies extension,
and stats a file. It does not resolve a durable upload record or reject every possible symlink/race
replacement. The upload ID is not persisted as an explicit prompt/tool identity.

### Intended path

Use the canonical uploaded source reference as the immediate idempotency key. If the app later gains
multi-user, remote, or stronger adversarial boundaries, persist signed/opaque upload records and
resolve those server-side instead of accepting client-supplied absolute paths.

## Completed Hardening In This Audit

The following work is already present and should not be listed as open SheetJS regressions:

- SheetJS parsing moved off the backend event loop into a bundled worker sidecar.
- Spreadsheet archive validation runs in the worker and reuses the loaded bytes.
- Worker concurrency is bounded to one or two active jobs with 32 waiting jobs.
- Active spreadsheet execution has a five-minute timeout and V8 generation limits.
- Large full-text and CSV results are staged to files instead of structured-cloned through the
  worker message port.
- Generic and spreadsheet-specific archive budgets are distinct, allowing the advertised
  one-million-cell XLSX ceiling without weakening generic Office archive limits.
- Production packaging includes the worker sidecar.
- A production smoke generates and prepares a real XLSX through the built backend.
- A packaged macOS arm64 ASAR smoke exercised that real worker path successfully.
- Text/Markdown model attachments now retain structured identity, render as chips, remain visible to
  the model, and restore as attachments on message revert/edit.

Audit evidence at the time of the SheetJS pass:

- 22 focused backend tests and 17 focused web tests passed;
- root typecheck and lint passed;
- backend and Electron production builds passed;
- a 100,000 by 10 string workbook with one million populated cells completed locally in about 2.8
  seconds and peaked around 504 MiB RSS;
- Windows runtime/package execution was not performed.
