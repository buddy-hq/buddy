# Chemistry rendering bug audit

Audited on 2026-07-13 after the single-renderer-ownership refactor.

## Current architecture

- SMILES, CXSMILES, reaction SMILES, and KET are rendered in the browser.
- Chemfig is rendered only by the backend through `/api/chemistry/chemfig/render`.
- The `render_chemistry` agent tool and chemistry object persistence have been removed.
- Chemistry remains fenced Markdown. The backend Chemfig cache is an implementation cache, not a user artifact.
- The generic `render_svg` tool can create an explicit standalone file on demand. Browser-owned formats are rendered by the same browser renderer used for fences; Chemfig stays on its backend renderer. The tool validates and atomically writes the returned SVG but does not create a chemistry object.

## Audit results

| ID | Status | Resolution |
| --- | --- | --- |
| BUG-001 | Fixed | The `node-tikzjax` patch now rejects a missing DVI-to-SVG result explicitly, and the backend maps that failure to a stable DVI conversion error. |
| BUG-002 | Fixed | Chemfig failures are classified by runtime initialization, TeX compilation, and DVI conversion stages. The UI gives stage-appropriate guidance. |
| BUG-003 | Fixed | Chemfig renderer identity, configuration, render keys, and caching are owned exclusively by the backend. |
| BUG-004 | Product guidance gap | Invalid chemistry sources are correctly rejected. Better authoring examples may reduce model-generated invalid input, but this is not a renderer defect. |
| BUG-006 | Product guidance gap | Format-specific authoring guidance can still be expanded. No runtime correctness issue was found. |
| BUG-007 | Expected behavior | Unsupported or malformed input produces an explicit render error instead of silently guessing a format. |
| BUG-008 | Obsolete as originally reported | The chemistry-specific tool and object lifecycle were deleted. `render_svg` returns only a filesystem path and optional warnings; it has no chemistry-object result to persist. |
| BUG-009 | Fixed | Browser-owned formats and backend-owned Chemfig now have disjoint dispatch paths. |
| BUG-010 | Fixed | The backend logs structured child-process diagnostics, including the failure stage, stack, and source hash, while returning safe user-facing errors. |
| BUG-011 | Fixed | Backend Chemfig error codes are preserved through the typed SDK adapter and render state. |
| BUG-012 | Expected behavior | Chemistry fences require the supported delimiter and metadata grammar; ambiguous syntax is left as ordinary Markdown. |
| BUG-013 | Expected behavior | The declared chemistry format determines the renderer. The client does not reinterpret content as another format. |
| BUG-015 | Obsolete by design | Fenced chemistry is intentionally transcript content rather than an automatically created Buddy object. |
| BUG-016 | Fixed | Raw child-process suggestions such as `showConsole` are logged locally and are not exposed as end-user guidance. |
| BUG-017 | Fixed | Browser render errors use neutral compatibility guidance; backend errors no longer claim that the source must be syntactically wrong. |
| BUG-018 | Mitigated capability risk | Model-generated chemistry quality remains an authoring concern, but a completed failed fence can now start one hidden repair turn. The agent evaluates revisions through the existing `render_svg` renderer feedback and is hard-limited to four calls. |
| BUG-019 | Expected and tested | An incomplete streaming fence remains Markdown until its closing delimiter arrives. |
| BUG-020 | Fixed in the replacement path | `render_svg` correlates each browser response by request id and SHA-256 of the exact source, validates the SVG on the backend, and atomically replaces the destination only after success. |
| BUG-021 | Fixed | Loading, ready, and error states share one fixed diagram viewport. |
| BUG-022 | Fixed | The lazy-loading fallback uses the same viewport dimensions as the renderer. |
| BUG-023 | Not reproduced | Only completed fences are extracted; append-only streaming preserves ordinary Markdown until completion. Regression coverage remains in place. |
| BUG-024 | Obsolete by design | Chemistry no longer has an object or Bench-presentation contract. Authoring is fence-based. |
| BUG-025 | Not confirmed | The heavy chemistry module remains intentionally lazy-loaded, and rendering begins only after component activation. The fixed shell prevents visible layout flicker. |
| BUG-026 | Fixed | Chemfig labels without an explicit SVG fill now inherit `currentColor`, so atom labels and black bonds remain readable on both light and dark transcript themes without recoloring explicit atom colors. |
| BUG-027 | Fixed | Chemistry diagrams no longer add a card background, border, rounded shell, or visible format label. Loading, ready, renderer-error, and lazy-module-error states retain the same fixed transparent viewport for stable transcript virtualization. |
| BUG-028 | Fixed | KET validation now requires the document reference structure instead of accepting arbitrary JSON. Unsupported CXSMILES S-group spellings fail with format-specific guidance, while coordinates and supported `n`/`gen` S-groups remain renderable. |
| BUG-029 | Fixed | Eligible failures in completed assistant chemistry fences are reported without forwarding the frontend error. After the originating session becomes idle, one hidden synthetic user turn asks the same agent/model to evaluate revisions with the existing `render_svg` tool. Reports are transcript-verified and deduplicated, recursive repairs are rejected, renderer calls are capped at four in persisted backend state, and the synthetic user message is hidden from the transcript. Explicitly classified backend infrastructure failures remain visible without starting a source-repair turn. |
| BUG-030 | Fixed | SVG repair turns now use the same project-scoped execution admission as ordinary prompts. Repeated reports return their persisted idempotent result, rejected prompts release admission, and a turn that ends without a validated render is exhausted instead of remaining permanently active. |
| BUG-031 | Fixed | Concurrent `render_svg` calls for one repair request are serialized by a persisted attempt id. Session settlement preserves an already in-flight successful render, while a later failure exhausts cleanly; stale running records are also terminated after a backend restart. |
| BUG-032 | Fixed | Browser renderer infrastructure failures, worker timeouts, cancellations, malformed renderer output, and busy responses have explicit non-repairable codes. Only classified source failures can start automatic repair. |
| BUG-033 | Fixed | Repair reports require an exact parsed fence/source match rather than a substring match, accept the same CommonMark indentation and line endings as the frontend parser, bound the raw request size, and deduplicate the same failed source independently of a client-supplied segment index. |
| BUG-034 | Fixed | Browser-render completion tombstones retain only a digest of the completion, are capped, and now schedule their own expiry cleanup so one-off workspace directories cannot remain in backend memory indefinitely. |
| BUG-035 | Fixed | Chemistry SVG cleanup removes quoted external CSS `url(...)` references, including URLs containing spaces, while retaining verified same-document fragments. |
| BUG-036 | Fixed | Standalone SVG writes and persisted repair records now use the same real-path-aware, version-checked atomic writer as the hardened project editor. Lexical and physical lock identities are coordinated, concurrent edits fail safely, and internal repair paths reject project escapes and symbolic-link redirects. |
| BUG-037 | Fixed | Browser render events contain only a request id; pending payloads are recovered through the typed list endpoint. Backend request/tombstone totals, frontend completion ledgers, active executions, and reconnect synchronizations are bounded or coalesced so source and SVG payloads are not retained after settlement. |
| BUG-038 | Fixed | SVG repair admission waits briefly on the project execution gate instead of racing the just-completed originating prompt. The wait queue is bounded, abortable, and handed off directly, while stable React callback dependencies prevent duplicate failure reporting during unrelated renders. |
| BUG-039 | Fixed | Chemistry and SVG completion routes bound the raw wire body before JSON parsing, rendered SVG is bounded by decoded UTF-8 bytes, and warnings, errors, and child-process diagnostics have explicit count/length limits. Shared bounded-body replay avoids divergent route implementations. |
| BUG-040 | Fixed | Persisted automatic-repair records remove the original source when they become terminal. Record creation and retention use an ordered retention/request/writer lock hierarchy; old terminal or stale-runtime records are pruned under count and byte caps without deleting active work. |
| BUG-041 | Fixed | Chemistry fences following an indented thematic break remain inside their CommonMark list container. Top-level thematic breaks still terminate list lookback, while indented breaks contribute their continuation indentation instead of causing the fence to be extracted as a separate block. |
| BUG-042 | Fixed | KET root references must resolve to an own object property in the parsed document. Prototype-chain names such as `__proto__` can no longer satisfy structural validation without a corresponding KET object. |
| BUG-043 | Fixed | Chemistry fences emitted by a hidden SVG repair assistant no longer receive another auto-repair context. Recursive reports were already rejected by the backend, but withholding the context at the exact assistant-message level also prevents redundant rejected requests after remounts without disabling unrelated fences in the same visible turn. |
| BUG-044 | Fixed | SVG auto-repair transcript verification now requires the reported raw fence to occur on standalone transcript lines and rejects a body containing an earlier valid closing delimiter. Fence-looking substrings that the frontend parser could not have extracted therefore cannot start a hidden repair turn. |
| BUG-045 | Fixed | CXSMILES authoring guidance no longer recommends MOL as a fallback for unsupported S-groups. MOL/CTAB formats are intentionally outside the product surface; the supported fallbacks are KET or plain SMILES. |
| BUG-046 | Fixed | Successful `render_svg` writes now publish the project-relative path expected by the hardened workspace watcher, so Bench and Explorer can refresh immediately. Destinations outside the notebook remain excluded from workspace-relative notifications. |

## Remaining follow-up

There are no known dual-ownership defects in the current chemistry renderer or its on-demand file-export path. The browser/backend handoff uses the existing OpenCode global event stream plus a pending-request recovery endpoint; it does not introduce a second event transport. Automatic repair also reuses that handoff and the existing `render_svg` tool rather than adding a validator or a second rendering path. Model output can still exhaust all four attempts, so authoring guidance and model quality remain separate concerns from renderer ownership.
