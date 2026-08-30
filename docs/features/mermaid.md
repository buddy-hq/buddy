## Product requirements

1. buddy renders mermaid diagrams inline inside an interactive card inside which user can move the diagram around, zoom in/out, like any other tldraw/excalidraw like canvas. 
2. the user can go into a full screen view of the diagram
3. user can download the image of the diagram. 
4. the diagrams rendered adapt to the theme
5. the diagrams are properly contrasted: no light on light or dark on dark issues.
6. the diagrams are auto repaired by ai.(one auto attempt, followeed by a button that sends the failed attempt and more context when user manually clicks it)
7. for smaller or errors with a pattern, the diagrams are repaired by a deterministic repair pipeline. 
8. the ```mermaid also undergo the same pipleine as the those renered by a tool.

The automatic AI repair item above is a product requirement, not a statement
that the feature is currently enabled. Automatic repair is contained at the
server boundary while the session-loop remediation is pending; the explicit
manual repair action remains available. See the
[Mermaid auto-repair incident](../ops/incidents/2026-08-15-mermaid-auto-repair-session-loop.md).

## Shipped architecture (current)

This page keeps the user-facing requirements above. The implementation has no
standalone `packages/mermaid` package; ownership is split between the Buddy
backend and the web renderer:

- `packages/buddy` owns diagram artifacts, source normalization and hashing,
  deterministic preflight, and repair state. The historical one-automatic-
  attempt flow is currently disabled at the server boundary while the
  session-loop remediation is pending; the explicit manual repair action
  remains available.
- `packages/web` owns browser rendering, theme signatures, SVG sanitization and
  contrast, pan/zoom, fullscreen, download, and render scheduling.
- Browser rendering is the only success authority. Backend parsing or
  validation must not be treated as a successful render, and artifact-only
  routes must not start an AI repair session.
- The ordered 14-step preflight is idempotent and does not call Mermaid. Keep
  its exact normalization, ER-label, flowchart-label, and subgraph-id repair
  behavior in [`preflight.ts`](../../packages/buddy/src/learning/features/diagrams/service/preflight.ts),
  rather than duplicating the algorithm in this overview.
- The backend owns the source/artifact portion of a render key; the frontend
  contributes theme, renderer, and configuration versions. Contrast adjustment
  uses candidate colors and target SVG groups, preserves `classDef`/`style`
  precedence over theme variables, and targets the WCAG 4.5 contrast ratio
  implemented in [`svg-contrast.ts`](../../packages/web/src/components/media/renderers/mermaid/lib/svg-contrast.ts).
- Rendering is scheduled with concurrency `1`; visible chat work has priority
  `0`, and offscreen shelf surfaces are not enqueued. The remaining unbounded,
  uncancellable queue is tracked as open issue L10-C05 in
  [`knownissues.md`](../reviews/knownissues.md).

The deleted `docs/artifacts/plans/mermaidv2.md` is historical phase-plan
material, not a current implementation contract. The auto-repair session-loop
incident remains the authority for that narrower failure mode.
