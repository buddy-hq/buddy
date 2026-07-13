# Combined pre-launch bug triage

> [!NOTE]
> These statuses include the 2026-07-14 hardening reassessment. Rejected Buddy-owned runtime
> mechanisms are reopened below. The evidence and disposition log is
> [Hardening pass reassessment](./hardening-reassessment.md).

Audit date: 2026-07-13
Scope: All 10 launch-risk discovery files
Triage status: 9 launch blockers resolved; 7 launch blockers open

## Purpose

This file puts every current finding in one decision-oriented view. It deliberately separates launch-blocking product failures from security hardening, deliberate policy, and failure-injection resilience work.

The discovery priority (`P0`/`P1`/`P2`) is not the same as a launch verdict. A security issue can be severe without being a launch blocker under the product definition below.

## Triage definitions

- **Blocker:** An ordinary supported workflow can make Buddy unusable, operate on the wrong notebook, or lose/corrupt durable work without requiring an attacker, a deliberately induced crash, or an unusual platform fault.
- **User-facing:** A directly visible product defect, but narrower, recoverable, or insufficient to block launch by itself.
- **Security:** An authority, privacy, content-execution, credential, or supply-chain boundary issue. These require a security/product decision, but are not counted as user-facing launch blockers here.
- **Resilience:** Requires a crash, power loss, process overlap, port/process interference, hostile/exceptional input, or another failure condition whose real frequency still needs measurement.
- **Intentional:** Known deliberate product or release policy, not a bug to fix in this campaign.

## Decision summary

| Primary triage | Count | Launch meaning |
|---|---:|---|
| Resolved launch blockers | 9 | Fixed or explicitly removed from launch scope after reassessment |
| Open launch blockers | 7 | Six rejected hardening implementations were reopened; `L08-C06` was already open |
| User-facing, not blockers | 16 | Product defects worth fixing, but not launch-stopping by this definition |
| Security/boundary | 19 | Security or product-boundary review; not counted as user-facing blockers |
| Resilience/edge/operations | 22 | Retain only after reachability/frequency verification |
| Intentional/closed policy | 2 | Do not fix unless the product decision changes |
| **Total** | **75** | Seven blockers remain open; non-blockers retain their existing candidate/verification states |

`L01-C01` (platform signing/notarization) is explicitly treated as deliberate policy and excluded from the blocker count. The raw-HTML, HTML-widget, EPUB-script, calculator-authority, credential, and similar findings remain in the security lane rather than being mislabeled as user-facing blockers.

## Resolved launch blockers

These findings matched the launch-blocker definition and survived the hardening reassessment. `L04-C01` remains here only so the original queue is traceable; it is not included in the resolved count after the policy decision.

| Done | ID | Resolution |
|---|---|---|
| [x] | `L03-C06` | Fixed: notebook presence no longer attests onboarding completion; incomplete setup always resumes onboarding. |
| [x] | `L04-C01` | **Closed as not required:** repository policy explicitly allows breaking changes and does not require backward-compatible migration from the legacy runtime root. |
| [x] | `L04-C05` | Fixed: conflicting query/header scopes return `400`; equivalent scopes resolve to one canonical directory. |
| [x] | `L04-C06` | Fixed: Buddy writers serialize by lexical and real target identity, stage atomically, and revalidate the content version immediately before replacement. |
| [x] | `L07-C01` | Fixed: config read/merge/write executes inside the resolved config-file lock, including nested paths to the same notebook config. |
| [x] | `L09-C01` | Fixed: lesson workspace operations are serialized per session and lesson, checkpoint, and metadata replacements are atomic. |
| [x] | `L09-C06` | Fixed: learner-global read-modify-write operations and index rebuilds share one cross-process mutation lock, including same-memory updates. |
| [x] | `L09-C07` | Fixed: consolidation validates a staged generation, rejects stale bases, and journals publication so an interrupted two-file replacement rolls forward before the next read. |
| [x] | `L09-C08` | Fixed: a goal commit archives only the prior active set for the same scope and context. |
| [x] | `L09-C09` | Fixed: flashcard reviews and question attempts use request-bound submission IDs, durable transactions and learner-memory outboxes, stable ingestion event IDs, and reconciliation of unfinished ingestion. |

## Open launch blockers

| ID | Why open | Later work |
|---|---|---|
| `L02-C03` | The custom Buddy desktop registry was discarded because vendored OpenCode already owns the Electron window lifecycle. | Port/adapt the vendor `window-registry.ts`, `windows.ts`, and `index.ts` flow, then run packaged macOS/Windows verification. |
| `L03-C02` | The novel Buddy backend supervisor was discarded; vendor desktop owns the sidecar lifecycle and does not currently implement the stronger recovery policy. | Make recovery an explicit product decision, compare the current vendor desktop, and implement separately only if Buddy intentionally diverges. |
| `L06-C03` | Notebook-wide turn admission duplicated the vendored session runner and broke independent conversations. | Fix/adopt same-session admission at the vendored prompt/run-state owner; add no Buddy gate. |
| `L06-C04` | The generic abort wrapper could hang while still failing to cancel the durable operation. | Make Buddy-owned tools cooperatively observe `Tool.Context.abort` at their own safe mutation boundaries. |
| `L06-C07` | Disabling rewind in Buddy routes removed vendor behavior without correcting snapshot attribution. | Add conflict/ownership handling at the vendored snapshot/revert owner; preserve vendor behavior meanwhile. |
| `L08-C06` | The restored standards SQL tool can materialize unbounded query work before applying its row cap. | Bound query execution without removing or weakening the capability. |
| `L10-C04` | Early resource ceilings exist, but deadlines, cancellation, actual inflated-byte accounting, justified concurrency, and empirical limit validation are missing. | Add those controls at the Buddy resource/parser owners; do not restore the rejected global queue. |

## Complete finding index

### [LAUNCH-01 — Release packaging, installation, and first startup](./launch-01-release-startup.bugs.md)

| ID | Triage | Audit status | Finding |
|---|---|---|---|
| `L01-C01` | Intentional | Candidate | Release artifacts are not platform-trusted; signing/notarization is a deliberate release decision. |
| `L01-C02` | User-facing | Candidate | Startup feedback omits existing-database upgrades and early backend bootstrap. |
| `L01-C03` | Resilience | Candidate | Backend port allocation releases the port before the backend binds. |

### [LAUNCH-02 — Electron renderer, preload, and native IPC authority](./launch-02-electron-ipc.bugs.md)

| ID | Triage | Audit status | Finding |
|---|---|---|---|
| `L02-C01` | Security | Candidate | Model-authored raw HTML can navigate the privileged app window to a remote origin. |
| `L02-C02` | Security | Candidate | Renderer-controlled store names escape Electron user data. |
| `L02-C03` | Blocker | Open | Window ownership is a single stale pointer despite supporting New Window. |

### [LAUNCH-03 — Backend exposure, credentials, OAuth, onboarding, and first response](./launch-03-backend-auth-transport.bugs.md)

| ID | Triage | Audit status | Finding |
|---|---|---|---|
| `L03-C01` | Security | Candidate | Standalone server fails open when credentials are absent or incomplete. |
| `L03-C02` | Blocker | Open | Embedded backend death after startup is only logged. |
| `L03-C03` | Security | Candidate | Remote Basic-auth secrets are embedded in asset URLs and Bench context. |
| `L03-C04` | User-facing | Candidate | OAuth cancellation can still complete and store credentials after cancellation. |
| `L03-C05` | User-facing | Candidate | One callback-port collision poisons later browser OAuth retries until restart. |
| `L03-C06` | Blocker | Fixed | Partial notebook creation makes an incomplete onboarding run look complete after restart. |
| `L03-C07` | User-facing | Candidate | Starter-chat retries are not atomic with session creation or idempotent prompt acceptance. |

### [LAUNCH-04 — Durable storage, workspace/file identity, migrations, and API scope](./launch-04-storage-migrations.bugs.md)

| ID | Triage | Audit status | Finding |
|---|---|---|---|
| `L04-C01` | Intentional | Rejected | Legacy runtime-root migration is outside the current backward-compatibility policy. |
| `L04-C02` | Resilience | Candidate | Provider authentication persistence is unlocked and non-atomic. |
| `L04-C03` | Resilience | Candidate | Database migrations use only a process-local lock. |
| `L04-C04` | User-facing | Candidate | Percent-looking notebook names are decoded into a different filesystem identity. |
| `L04-C05` | Blocker | Fixed | Query scope silently overrides a directory-scoped client across projects. |
| `L04-C06` | Blocker | Fixed | Project text saves use an unlocked, non-atomic check-then-write. |
| `L04-C07` | User-facing | Candidate | Workspace raw-file responses ignore HTTP byte ranges. |
| `L04-C08` | Security | Candidate | Raw notebook files are served inline with active MIME authority. |
| `L04-C09` | Security | Candidate | Open-project authorization uses a process-local registry cache indefinitely. |
| `L04-C10` | Security | Candidate | Closing a notebook leaves directory-scoped query data reusable. |
| `L04-C11` | Resilience | Candidate | Directory injection drops valid native `Headers` from the typed SDK. |

### [LAUNCH-05 — Desktop update, signature, install, and recovery lifecycle](./launch-05-updates-recovery.bugs.md)

| ID | Triage | Audit status | Finding |
|---|---|---|---|
| `L05-C01` | Resilience | Candidate | macOS update replacement deletes the working app before replacement succeeds. |
| `L05-C02` | Resilience | Candidate | Helper process creation is mistaken for installer readiness. |
| `L05-C03` | Resilience | Candidate | Startup recovery can become an invisible, unbounded check/download. |
| `L05-C04` | User-facing | Candidate | The macOS updater buffers multiple full copies of the release archive. |
| `L05-C05` | User-facing | Candidate | Install failure leaves authoritative update state stuck at `installing`. |
| `L05-C06` | Resilience | Candidate | Interrupted installer `running` state is ignored indefinitely. |
| `L05-C07` | Resilience | Candidate | The standard release workflow cannot publish a non-empty recovery policy. |
| `L05-C08` | Resilience | Candidate | Windows quits before asynchronous NSIS launch failure is knowable. |
| `L05-C09` | Resilience | Candidate | Backend shutdown has no terminal failure path during install. |

### [LAUNCH-06 — Session lifecycle, event streaming, transcript state, and runtime isolation](./launch-06-session-events-runtime.bugs.md)

| ID | Triage | Audit status | Finding |
|---|---|---|---|
| `L06-C01` | Security | Verified | Abort can cross the authorized notebook boundary by session ID. |
| `L06-C02` | Resilience | Verified | Async prompt success is acknowledged before durable admission. |
| `L06-C03` | Blocker | Open | Concurrent prompts and compaction markers can be persisted but never drained. |
| `L06-C04` | Blocker | Open | Aborting a Buddy tool does not stop its underlying durable mutation. |
| `L06-C05` | Resilience | Verified | A hard restart can strand a session behind an incomplete assistant message. |
| `L06-C06` | Resilience | Verified | Slow event subscribers have unbounded backend queues. |
| `L06-C07` | Blocker | Open | Session patch attribution can capture and later erase concurrent work. |
| `L06-C08` | Resilience | Verified | Revert and unrevert report success after partial filesystem failure. |
| `L06-C09` | Resilience | Verified | Buddy runtime plugin bootstrap fails open to an unguarded reduced runtime. |

### [LAUNCH-07 — Capability/config compilation, permissions, MCP, and skills](./launch-07-capabilities-config-permissions-mcp-skills.bugs.md)

| ID | Triage | Audit status | Finding |
|---|---|---|---|
| `L07-C01` | Blocker | Fixed | Concurrent notebook config patches can silently discard each other. |
| `L07-C02` | Resilience | Candidate | Config and instruction writes are direct, non-atomic replacements. |
| `L07-C03` | Security | Candidate | Notebook `AGENTS.md` follows a symlink outside the allowed notebook. |
| `L07-C04` | Security | Candidate | Dynamic-tool grant and permission recomputation use racing whole-ruleset writes. |
| `L07-C05` | User-facing | Candidate | Parallel skill mutations can leave installed trees untracked or permissions lost. |
| `L07-C06` | User-facing | Candidate | An occupied MCP OAuth callback port is treated as Buddy's callback server. |
| `L07-C07` | Resilience | Candidate | MCP disconnect and Windows shutdown do not terminate descendant processes. |
| `L07-C08` | User-facing | Candidate | “Allow always” approvals are discarded by ordinary config changes. |

### [LAUNCH-08 — Advanced-math and standards execution/data runtimes](./launch-08-math-standards-runtimes.bugs.md)

| ID | Triage | Audit status | Finding |
|---|---|---|---|
| `L08-C01` | Security | Candidate | The Python calculator is unrestricted same-user code execution behind a tool-wide approval. |
| `L08-C02` | Security | Candidate | Calculator output, memory, artifacts, and descendant processes are unbounded. |
| `L08-C03` | Security | Candidate | Downloaded executable/runtime artifacts are authenticated only by co-hosted checksums. |
| `L08-C04` | Security | Candidate | Runtime downloads and extraction have no trustworthy resource or containment limits. |
| `L08-C05` | Resilience | Candidate | Advanced-math install/remove is process-local and replacement has no rollback. |
| `L08-C06` | Blocker | Open | The standards SQL row cap is applied only after SQLite materializes the full result; the SQL tool is restored and this budget still needs a non-removal fix. |
| `L08-C07` | User-facing | Candidate | Standards removal/replacement ignores live SQLite handles. |
| `L08-C08` | User-facing | Candidate | Advanced-math self-check does not test the advertised runtime. |

### [LAUNCH-09 — Learning workspace, managed objects, memory, curriculum, and assessment state](./launch-09-learning-objects-memory-assessment.bugs.md)

| ID | Triage | Audit status | Finding |
|---|---|---|---|
| `L09-C01` | Blocker | Fixed | Lesson-workspace revision checks do not serialize saves, restores, or multi-file commits. |
| `L09-C02` | Resilience | Candidate | A crash during managed-object replacement strands the only good copy as staging data. |
| `L09-C03` | Resilience | Candidate | Managed-object deletion can race with writers and resurrect deleted content. |
| `L09-C04` | Security | Candidate | Disabled learner-memory consent is bypassed by forced extraction and direct search routes. |
| `L09-C05` | Security | Candidate | Hard delete and reset leave consolidated memories that immediately resurface. |
| `L09-C06` | Blocker | Fixed | Learner-global memory mutations are uncoordinated read-modify-write operations. |
| `L09-C07` | Blocker | Fixed | Consolidation edits canonical memory files in place without validating or rolling back. |
| `L09-C08` | Blocker | Fixed | Committing one curriculum goal set archives every unrelated active goal set. |
| `L09-C09` | Blocker | Fixed | Review and question-attempt retries can durably apply the same answer twice. |

### [LAUNCH-10 — Active content, resources, Bench, whiteboard, and Obsidian](./launch-10-active-content-resources-bench.bugs.md)

| ID | Triage | Audit status | Finding |
|---|---|---|---|
| `L10-C01` | Security | Candidate | Sandboxed HTML widgets can read the authenticated Buddy API. |
| `L10-C02` | Security | Candidate | `prepare_resource` bypasses the external-directory permission boundary. |
| `L10-C03` | Security | Candidate | EPUB scripts execute in same-origin scripted Foliate frames. |
| `L10-C04` | Blocker | Partially fixed / open | Resource preparation has no aggregate input, expansion, work, or cancellation budget. |
| `L10-C05` | User-facing | Candidate | Mermaid's global render queue is unbounded and stale work cannot be cancelled. |
| `L10-C06` | Resilience | Candidate | Whiteboard state and session identity are protected only by process-local locks. |
| `L10-C07` | User-facing | Candidate | Closing the app can silently discard the last debounced whiteboard edit. |
| `L10-C08` | User-facing | Candidate | Obsidian's case-folded path index can resolve or invalidate the wrong note. |

## Next decision gate

Seven launch blockers remain. Resolve them through the owner-specific later work above; do not close
them with parallel Buddy runtime mechanisms. After they are resolved, choose the next lane:

1. Verify and prioritize the 16 user-facing non-blockers, or
2. review the 19 security/boundary findings against explicit product decisions, or
3. measure the 22 resilience/operations candidates.

Do not silently convert deliberate capability choices—including notarization policy—into user-facing launch blockers.
