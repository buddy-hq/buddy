# Rotate-left icon usage

Eight controls in eight source files use this glyph. Its single registry definition brings the total to nine source files. Audit date: 2026-10-03.

Markdown uses RotateCcwIcon, backed by Hugeicons RotateLeft01Icon, to reset document text size. Four uses are production or developer controls; four are Easel prototypes.

## Every control

| Control | Source and render line | Actual action | Why the icon fits |
| --- | --- | --- | --- |
| Markdown: Reset document text size | `packages/web/src/components/bench/markdown/toolbar.tsx:135` | Calls onResetFontScale and restores the saved text scale to its default. Wiring is in markdown/page.tsx at lines 210 and 359; the preference reset is in state/markdown-bench-preferences.ts at lines 53–55. | Returns the text-size setting to its starting value. |
| Bench viewer: Reset zoom | `packages/web/src/components/bench/bench-viewer-shell.tsx:335` | Returns fit-content viewers to auto-fit; otherwise restores 100% zoom. Callback is at lines 656–669. | Returns the view scale to its default. |
| DevTools: Reset position | `packages/web/src/components/debug/buddy-devtools.tsx:2995` | Uses snapToAffordance and getDefaultDevToolsRect to restore panel placement. Callback is at lines 549–555. | Returns the panel to its default position. |
| PDF: Rotate left | `packages/web/src/components/readers/ui/pdf-preferences-panel.tsx:106` | Decrements page rotation. Accessible label is Rotate left. | Literal counterclockwise rotation. |
| Easel reader-layout prototype: Rotate left | `packages/web/src/components/debug/easel/reader-layout-consistency.tsx:1499` | Static prototype control with no handler. | Demonstrates the rotate-left affordance. |
| Easel flashcard review: Reset | `packages/web/src/components/debug/easel/flashcard-review-redesigns.tsx:814` | Stops autoplay and restores seeded review state; callback is at lines 764–770. | Returns the demo to its initial review state. |
| Easel flashcard journey: Restart | `packages/web/src/components/debug/easel/flashcard-deck-journey.tsx:1467` | Sets INITIAL_STATE. | Restarts the demo from its beginning. |
| Easel error notices: New failure / reset | `packages/web/src/components/debug/easel/error-banner-dismissal.tsx:340` | Increments the sample episode, remounting the local preview. | Replays a fresh sample failure. |

The reasons above follow the visible labels and callbacks. No comments documenting the original icon-choice rationale were found; reset-as-return-to-start is an inference from those actions.

## Definition and aliases

- `packages/web/src/icons/app-icons.tsx:117` imports RotateLeft01Icon as RotateLeft01IconData from @hugeicons/core-free-icons.
- `packages/web/src/icons/app-icons.tsx:434` exports RotateCcwIcon through createIcon with that data.
- Each of the eight control files imports this export. No additional aliases, reexports, direct glyph-data imports, or dynamic icon-atlas uses were found.
- The UI package has no export of this rotate-left glyph. RefreshCwIcon and the UI RefreshIcon use Refresh03. RotateCwIcon uses RotateRight01; Undo2Icon and Redo2Icon use Undo03 and Redo03.

## Audit scope

Workspace: /Users/prashantbhudwal/Code/buddies/hippo.

Searched current repository source, including hidden and untracked files, glyph aliases, registry namespaces, and vendor source. No additional uses were found in desktop, backend, scripts, or vendor code. Counts exclude dependencies, generated/build output, documentation, and historical patches; compiled Electron bundles repeat existing source uses.

Read-only audit by Luna Max, checked against an independent source search by the orchestrator. No icon changes were made for this inventory.
