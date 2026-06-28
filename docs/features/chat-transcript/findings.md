# Chat Transcript Rendering P1 Fix Brief

Date: 2026-06-28

Status: parked for implementation. This document captures the current P1 transcript-rendering findings so the next implementation pass can resume from the verified diagnosis instead of rediscovering or drifting.

Reference lock:

- Use the current standalone OpenCode checkout at `/Users/prashantbhudwal/code/opencode`.
- Do not use `vendor/opencode` as the reference for this pass.
- Do not solve these issues by adding local patchwork, timing hacks, broad remount guards, or new generic rendered-DOM caches.
- Preserve Buddy-specific inline objects, tool cards, media, Mermaid, math, and sanitization behavior.

## Current highest-priority conclusion

The next fix should target the core Markdown projection path, not artifact shells.

Buddy still rebuilds too much of the rendered response when a streaming text part becomes final. That causes child renderers to look unstable even when those child renderers are individually correct.

Target direction:

1. Preserve the last fully rendered streaming projection while the final parse/render is pending.
2. Swap or morph to the final projection only when the replacement is ready.
3. Use stable logical block identity for growing blocks.
4. Align the approach with OpenCode’s latest/pending Markdown projection pattern.

Do not start with Mermaid cards, media cards, or artifact animations. Those can amplify the problem, but the core collapse/rebuild path is the root P1.

## Verifier transcript recheck

The `transcript_stress_verifier` subagent completed a read-only verification pass and made no file changes.

Verifier summary:

| Finding | Verdict |
| --- | --- |
| Large virtualized tail remounts repeatedly | Partially confirmed; only under specific `>12k` / no-Mermaid / no-reference conditions |
| End-of-turn rebuilds most Markdown | Confirmed, high impact |
| First completed Mermaid remounts prior Markdown | Confirmed |
| References force whole-response parsing per token | Confirmed |
| Tables/lists repeatedly restructure | Mostly normal tail-local behavior |
| `present_media` initially becomes file rows | Mostly false; only when persisted availability is stale |
| Mermaid loading/render errors collapse shells | Mostly false; only persistence/replacement states collapse |
| Math repeatedly flickers independently | Non-issue; affected mainly by higher-level remounts |
| Code repeatedly flickers independently | Non-issue during streaming; finalization still remounts it |
| Motion cleanup is faithful | Approved |
| Broken-image fix addresses the reported loop | Confirmed |

The verifier’s key addition was that normal completion is the most damaging remaining path: Buddy temporarily reduces the rendered response to its first block while asynchronously rebuilding the final version. That can blank most of the response, retry images, recreate KaTeX, and retokenize code.

## P1 findings to fix

### P1-A: Streaming-to-final Markdown collapse/rebuild

Confirmed high impact.

Observed behavior:

- During streaming, Buddy renders multiple incremental blocks.
- When the text part becomes final, the projection collapses to one full block.
- React immediately unmounts later streamed blocks.
- The first block then asynchronously parses/morphs the full response.
- The user can see a large blank area, broken images retrying, code retokenizing, and KaTeX being recreated.

Why this matters:

- It explains why code and math appear to flicker even if the code/math renderers are not independently unstable.
- It also explains “stop was pressed but it kept rendering” reports when the queued async final parse/highlight work continues after the visible stream stops.

OpenCode-aligned target:

- Preserve the previous rendered projection as `latest`.
- Build the replacement as pending work.
- Do not reconcile the visible React tree down to a smaller intermediate shape.
- Commit the new projection only when it can render coherently.

Regression tests needed:

- A streaming response with multiple Markdown blocks does not blank below block 0 when finalized.
- Existing image nodes are not destroyed during finalization.
- Existing code block containers are not destroyed during finalization before replacement is ready.
- Existing math placeholders/rendered nodes do not disappear during finalization.

### P1-B: Virtualized Markdown tail keys use content-derived identity

Partially confirmed, but still important for long active responses.

Runtime conditions:

- Text is at least roughly 12,000 characters.
- No detected reference definition.
- No completed Mermaid segment.
- `preferEagerRender` is false or undefined.
- Splitting yields more than one block.

Observed behavior:

- Some growing tail block keys include the block content checksum.
- Every append can create a new key for the same logical tail block.
- Active blocks remount and reparse.
- Inactive blocks can momentarily render as estimated-height placeholders until IntersectionObserver catches up.

OpenCode-aligned target:

- Use stable owner/cache/index/mode identity for logical blocks.
- Do not use growing text content as the React key for the live tail.
- Keep activation sticky for a logical block once it has become active.

Regression tests needed:

- Appending text to a long virtualized Markdown tail preserves the same logical block node/key.
- An already-active tail block does not revert to an inactive placeholder on content growth.

### P1-C: First completed Mermaid remounts the prior Markdown tree

Confirmed.

Observed behavior:

- Before the first closed Mermaid fence, the response uses the ordinary Markdown path.
- When the first Mermaid fence closes, the root switches to the segmented Markdown/Mermaid path.
- All prior Markdown remounts once.

Why this matters:

- Prior images, code, and math can reload/reparse even though their content did not change.
- This is separate from Mermaid shell stability. The shell can be fixed while the root-mode switch still causes remounts.

Target:

- Avoid a whole-root renderer mode switch after the first Mermaid block closes.
- Keep prior Markdown block identity stable across the transition.
- Mermaid-aware segmentation must be incremental or stable enough not to invalidate already-rendered ordinary Markdown.

Regression tests needed:

- Text and image before the first Mermaid fence preserve DOM identity when the fence closes.
- Code/math before the first Mermaid fence do not remount when the Mermaid segment becomes semantic.

### P1-D: References force whole-response live parsing and can break across Mermaid segments

Confirmed.

Observed behavior:

- Reference definitions collapse streaming projection into one live block.
- Every later token reparses and morphs the entire response.
- A reference use before a Mermaid block and its definition after the Mermaid block can be parsed in separate HTML segments, so the earlier reference remains literal.

Why this matters:

- This is both a performance problem and a correctness problem.
- Footnotes are especially bad because they trigger the expensive reference path even though current Marked setup does not render them as footnotes.

Target:

- Unify reference detection between the parser and the virtualizer.
- Preserve document-global reference definitions across Mermaid-aware segmentation.
- Do not trigger whole-response work for unsupported footnotes.

Regression tests needed:

- Reference definitions with indentation and no whitespace after the colon behave the same in parser and virtualizer detection.
- A reference before Mermaid with definition after Mermaid resolves correctly.
- Footnote syntax does not force whole-response parsing unless actual footnote rendering support exists.

## P2 / follow-up findings

### Mermaid segmentation rescans the whole growing response

Confirmed medium-high performance issue.

Once any possible Mermaid opening exists, the segment parser scans the full response on each text change. Across a very large stream, this becomes quadratic work.

Target:

- Incrementally project Mermaid segments.
- Preserve large ordinary Markdown virtualization inside segmented responses.

### Grouped `render_mermaid` eagerly queues all diagrams

Confirmed medium-high latency issue.

Consecutive Mermaid tool calls are grouped, and every thumbnail/hidden full card can schedule rendering. With 20 diagrams, this can queue all diagrams even when only one is selected.

Target:

- Render the selected full view first.
- Lazily render thumbnails and non-selected views.
- Avoid hidden panels activating as visible work.

### Inline Markdown Mermaid object persistence can run twice

Confirmed low-medium load issue.

The first activation can persist the same Mermaid object twice because the effect reruns after `objectID` is set.

Target:

- Remove the duplicate request dependency.
- Keep persistence, replaced, and error states inside the fixed shell when possible.

## Findings that should not drive the next pass

These were verified as non-root causes or lower-risk amplifiers:

- Tables/lists usually only restructure the live tail. They are not causing whole-response oscillation by themselves.
- `present_media` does not normally start as file rows; structural changes usually happen only when persisted availability is stale or a deferred heavy tool activates.
- Mermaid loading/render-error states generally stay inside fixed shells. Collapses are limited to persistence/replacement states.
- Math is not repeatedly flickering independently. It is mainly affected by higher-level remounts and finalization.
- Code is stable during steady streaming. It is mainly affected by finalization remounts.
- The artifact motion cleanup is faithful and should remain. Removing mount/layout animation from virtualized artifact wrappers was correct.
- The broken Markdown image fix addresses the specific per-token broken-image disappear/reappear loop, but it does not protect against higher-level remounts.

## Already covered by current unstaged work

These changes exist in the current unstaged target and should be preserved unless later evidence contradicts them:

- Static artifact/tool wrappers instead of mount/layout animation replay.
- No height animation for tool error panels and completed/error bodies.
- Mermaid inline view avoids transition-based reveal and uses a stable fixed shell.
- Markdown broken images preserve the existing `<img>` node when `src`, `alt`, and `title` are unchanged.
- Markdown live fallback no longer destroys already-rendered block contents before async parsing catches up.

## Implementation guardrails

- Keep the staged refactor separate from the current unstaged target.
- Do not edit generated files.
- Do not patch `vendor/opencode`.
- Do not use broad viewport-wide geometry repair as the fix for Markdown remounting.
- Do not introduce a generic rendered-DOM cache for inline artifacts.
- Prefer row/block-local identity and latest/pending projection state.
- Run focused `packages/web` tests for changed runtime behavior.
- Before considering code work complete, run root `bun lint` and root `bun typecheck`.
- Do not run `bun fmt` until the user approves.

## Next implementation sequence

1. Inspect the current Buddy Markdown projection/finalization path and the current standalone OpenCode Markdown latest/pending projection.
2. Implement latest/pending projection for Buddy Markdown so finalization cannot visibly collapse to block 0.
3. Replace content-derived live tail keys with stable logical block identity.
4. Add regression tests for finalization, broken images, code, math, and long virtualized tails.
5. Only then address Mermaid/reference segmentation and grouped Mermaid scheduling.
