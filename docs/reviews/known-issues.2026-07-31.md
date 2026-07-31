# Known issues — 2026-07-31

Review scope: `ux-fixes` compared with `origin/main`.

## Generated-image reuse can consume different bytes than were authorized

Priority: P2; fix before merge.

Buddy verifies a generated image by hashing its contents, but then returns only the file path and
reopens that path when preparing the image request. If the file changes between those reads, Buddy
can send bytes that were not covered by the provenance check or a new permission prompt.

For users, this is a rare permission-integrity issue. Reading large reference images twice also
increases disk I/O and memory use, which can make image editing slower or less reliable near the
configured input limits.

Recommended fix: return and consume the verified bytes or an open file handle so authorization and
request construction use the same file contents.

Affected code:

- `packages/buddy/src/learning/features/image-generation/service/generated-image-authorization.ts`
- `packages/buddy/src/learning/features/image-generation/service/image-inputs.ts`
- `packages/buddy/src/learning/features/image-generation/tools/imagegen.ts`

## Rename API can produce a file the editor cannot reopen

Priority: P2.

The rename service validates that the source is editable but does not validate the destination
format. A request such as renaming `note.md` to `note.png` can succeed and return an editable-file
result, while the next editable-file read rejects the destination with HTTP 415.

The current Markdown title UI preserves `.md` or `.mdx`, so users are unlikely to encounter this
through normal title editing. It remains a correctness trap for future UI surfaces and SDK
consumers.

Recommended fix: validate that the destination remains a supported editable format before changing
the directory entry.

Affected code:

- `packages/buddy/src/project/project-file-editor-service.ts`

## Windows-reserved note names are accepted by title validation

Priority: P2.

The note-title validator rejects invalid path characters but accepts Windows device names such as
`CON`, `NUL`, `COM1`, and `LPT1`. These remain reserved after adding a Markdown extension, so the
rename reaches the filesystem and fails on Windows.

The original note remains safe, but Windows users receive a confusing rename failure for titles
that macOS accepts.

Recommended fix: reject Windows-reserved basenames in the shared title validation and add focused
cross-platform test cases.

Affected code:

- `packages/web/src/components/bench/markdown-bench-note-title.ts`

## Duplicate live HTML widgets can saturate the GPU process and make unrelated UI feel frozen

Priority: P1. Confirmed runtime performance defect; deferred for a dedicated fix.

Status: reproduced in the packaged Buddy Dev `0.0.56` application on macOS ARM64. This is a
runtime finding rather than a conclusion based only on the `ux-fixes` diff.

### User-visible symptoms

Opening a drawer, loading the Skills surface, or scrolling its rows can become extremely slow while
an animated HTML widget is visible in the same workspace. The symptom can look like skill discovery
or skill-file loading is slow, but the dominant bottleneck in the reproduced case was Electron's GPU
process being saturated by HTML widget rendering.

The reproduced workspace showed the same animated canvas game in two places at once:

- the active HTML widget on Bench; and
- the completed tool result in the chat transcript.

Both copies were live iframes. The Skills drawer was then composited over the continuously updating
widgets, so ordinary drawer scrolling competed with two canvas render loops.

### Reproduction

1. Present a `wide_16_9` HTML widget that draws an animated canvas with
   `requestAnimationFrame`.
2. Keep the completed inline widget card visible in the transcript.
3. Open the same widget on Bench, producing a second live iframe for the same object and revision.
4. Open the Skills drawer and scroll through the installed skills.
5. Inspect the Buddy renderer and GPU helper processes.

The concrete reproduction used a `1280x720` widget. The inline host kept that intrinsic iframe size
and visually reduced it with a CSS transform. On a Retina display, the widget itself capped its
canvas backing store at device-pixel ratio 2, producing a canvas as large as `2560x1440` before the
inline frame was scaled down for display.

### Measurements

Observed with the animated widget task active and the Skills drawer open:

- Electron GPU helper CPU: approximately `95%` to `109%`.
- Electron GPU helper memory reported by `top`: up to approximately `813 MB` during the sample.
- Main Buddy renderer CPU: approximately `3%` to `6%`.
- An eight-second sample of the main renderer found 6,322 of 6,477 main-thread samples idle,
  approximately `97.6%` idle.

After navigating to a task without the canvas widgets mounted:

- GPU helper CPU fell to approximately `1.4%` to `2.5%`.

After returning to the widget task:

- GPU helper CPU climbed through `54%`, `84%`, and `89%` in successive one-second samples.

This isolates the live widget rendering as the primary cause of the observed system load. It also
explains why faster host hardware did not make drawer interaction feel acceptably responsive: the
shared compositor was already occupied with unnecessary frames.

The skill paths were measured separately and were not the primary delay:

- the initial `GET /api/skills` completed in `53 ms`;
- subsequent catalog requests completed in `41 ms`, `42 ms`, `124 ms`, `159 ms`, and `321 ms`;
- the recent `game-engine` skill tool execution completed in `11 ms`; and
- other recent skill tool executions completed in approximately `11 ms` to `71 ms`.

The `13.3 s` value visible in the original reproduction was the game widget's fictional onboard
clock, not a skill-loading duration.

### Primary root causes

#### Buddy allows duplicate live runtimes for one widget

The completed HTML-widget tool result renders an inline `HtmlWidgetFrame`. Opening that same object
on Bench renders another iframe from the same runtime URL. There is no workspace-level ownership
rule limiting an object and revision to one active live iframe.

The duplicate runtimes also have independent DOM and JavaScript state. Besides wasting resources,
they can visibly diverge: interacting with the Bench copy does not advance the inline copy.

#### Parked or obscured widgets are not suspended

Bench has an active-surface signal that stops live-view polling, but the HTML widget iframe itself is
still rendered by `HtmlWidgetObjectBenchView`. Likewise, the inline widget stays mounted for as long
as its transcript row stays mounted. The host does not suspend, detach, or replace the iframe when
another surface owns the widget or when the widget is no longer useful to the user.

Browser `document.visibilitychange` is insufficient because both iframes belong to the visible
document even when one is obscured by a drawer or is a redundant representation of the Bench
target.

#### Inline scaling reduces presentation size, not runtime cost

`HtmlWidgetInlineFrame` creates the iframe at the preset's intrinsic width and height and then scales
it with `transform: scale(...)`. The widget continues to lay out and paint the full intrinsic
viewport. This is especially expensive for animated canvases on high-density displays and means a
small inline card can cost almost as much as the full widget.

#### The reproduced widget redraws forever

The generated game calls `update()`, `draw()`, and `requestAnimationFrame(frame)` unconditionally on
every frame. Its pause state only makes `update()` return early; it does not stop `draw()` or stop
scheduling frames. The loop also continues on the start screen and after the destination is reached.

Individual widgets should avoid this behavior, but Buddy must defend itself against arbitrary or
agent-authored widgets rather than relying exclusively on every widget implementing an efficient
lifecycle.

### Secondary Skills drawer costs

These were not sufficient to explain the measured GPU saturation, but they make the symptom worse
and should be addressed with the widget lifecycle fix:

- The drawer renders all 30 installed rows and five available rows at once even though a shared
  `RightWorkspaceVirtualList` implementation already exists.
- Every mounted row includes an interactive control and may include an image. The reproduction had
  twenty library icons, all `512x512` WebP assets. Native image lazy loading defers some requests but
  does not reduce the mounted React and accessibility trees.
- The catalog query uses `staleTime: 0`, so focus and remount behavior can refetch the full catalog
  despite mutations already performing explicit invalidation.
- The full catalog response includes the complete content of every installed `SKILL.md`; the local
  installation contained approximately `398 KB` of skill documents even though the drawer only
  needs identity, presentation, source, and permission metadata.
- The Skills drawer creates its own inner scroll container, while durable scrolling is attached to
  the shell's outer container. This should be corrected when virtualization establishes a single,
  explicit scroll parent.

### Immediate workaround

Until the host lifecycle is fixed, close or navigate away from continuously animated HTML widgets
before opening large drawers. Avoid keeping the same live widget visible on both Bench and in the
transcript. This is only a workaround; users should not need to manage compositor load manually.

Disabling hardware acceleration is not the recommended solution. It would move more rendering work
to software paths and hide, rather than repair, the duplicate-runtime defect.

### Recommended fix

Implement the following in order.

1. Establish a single-live-runtime invariant for HTML widgets. Within one directory workspace, only
   one surface may own a live iframe for a given object and revision. When Bench owns the widget, the
   completed inline result should become a dormant receipt or preview with an “Open on Bench” action.
2. Make Bench activity control iframe lifecycle, not only query polling. Parked, collapsed, inactive,
   or superseded HTML widget surfaces must detach or unmount their runtime iframe.
3. Add an explicit widget lifecycle protocol over `postMessage`, including at least active,
   inactive, and teardown signals. Buddy-authored widget templates should stop scheduling animation
   frames while inactive. Because third-party widgets may ignore the protocol, host-level iframe
   suspension remains the authoritative fallback.
4. Avoid full-resolution live inline rendering when the intrinsic viewport must be substantially
   scaled down. Prefer a dormant preview or captured thumbnail. If a live inline runtime remains
   necessary, give it an explicit reduced-cost presentation mode rather than relying only on a CSS
   transform.
5. Virtualize the flattened Skills list with stable domain keys, the real inner scroll element,
   fixed row estimates, and sufficient overscan to preserve smooth switch and button interaction.
6. Give the skills catalog a nonzero freshness window, disable focus refetch where appropriate, and
   continue using explicit invalidation after install, remove, update, and permission mutations.
7. Split the catalog's drawer metadata from full skill documents so listing skills does not parse,
   serialize, transfer, and retain content the drawer never displays. Serve list-sized icon variants
   instead of decoding `512x512` assets for approximately 52-pixel marks.

### Acceptance criteria

- Opening one widget on Bench leaves at most one live iframe for that object and revision.
- A parked, inactive, covered, or superseded widget stops producing animation frames without relying
  on the widget's own code.
- With an animated widget presented and Skills open, the GPU helper returns near idle when the widget
  is inactive and does not sustain approximately one full CPU core.
- The inline transcript representation remains useful and accessible after becoming dormant.
- Opening or focusing the Skills drawer with a warm cache does not issue a redundant catalog request.
- The Skills drawer mounts only visible rows plus overscan and preserves toggles, install actions,
  search densities, sticky section semantics, and scroll restoration.
- Performance coverage includes a deliberately hostile test widget whose animation loop does not
  voluntarily pause.

Affected code:

- `packages/web/src/components/media/renderers/html-widget-frame.tsx`
- `packages/web/src/components/media/renderers/html-media.tsx`
- `packages/web/src/components/chat/tools/render/html-widget/index.tsx`
- `packages/web/src/components/bench/surfaces/object-bench-surface.tsx`
- `packages/web/src/lib/bench-surface-keep-alive.ts`
- `packages/web/src/components/directory-chat/right-workspace-skills-drawer.tsx`
- `packages/web/src/components/directory-chat/right-workspace-drawer-ui.tsx`
- `packages/web/src/state/skills-catalog-query.ts`
- `packages/buddy/src/learning/skill-management/service/catalog.ts`

## Validation completed during review

- Focused Buddy and web tests: 123 passed.
- `bun lint`: passed with existing warnings.
- `bun typecheck`: passed.
