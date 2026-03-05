# UI/UX Polish Status

This tracks the current implementation pass against the issue headings in `docs/ui-ux-polish-audit.md`.

- Scope: low-risk live UI fixes only
- Rule used here: only fully closed issues are marked `✅`
- Partial improvements are still marked `❌` and called out in the reason column
- Issue IDs intentionally match the original audit, including duplicates

Implemented in this pass:

- a clearer "Permissions" label in the skills UI
- clearer "Set as default" provider action copy
- better goals and curriculum empty states
- more specific chat loading copy
- archive confirmation before destructive action
- consistent "New thread" wording in the live chat flow
- visible loading copy in the skills screen
- visible loading copy for file search mentions
- more specific pending labels in the MCP dialog
- friendlier MCP error mapping for common connection/auth/timeout failures
- standardized live MCP and provider action verbs around clearer labels
- added non-color thread status shapes plus screen-reader status text
- added field-level validation messages and ARIA error associations in the MCP form
- finished the remaining live `project` to `notebook` terminology cleanup
- added touch drag support to resize handles
- surfaced skills-route action failures with user-visible error toasts

Verification:

- `bun x tsc -p packages/web/tsconfig.app.json --noEmit`

Label definitions:

- `frontend`: can be resolved entirely in the client/UI layer
- `backend`: needs a backend-only change to resolve cleanly
- `fullstack`: needs both UI and backend changes, or the best fix depends on a stronger backend contract

## Completed

| ID | Mark | Label | Issue | File / Scope | Reason |
| --- | --- | --- | --- | --- | --- |
| 1.2 | ✅ | frontend | Inconsistent action verbs | `packages/web/src/components/settings-modal.tsx`, `packages/web/src/components/mcp-dialog.tsx` | Standardized the live provider and MCP actions around clearer verbs like `Add`, `Connect`, `Edit connection`, `Edit details`, and `Set as default`. |
| 1.3 | ✅ | frontend | "Policy" label is vague | `packages/web/src/components/skills/skills-page.tsx` | Renamed the live skills action from `Policy` to `Permissions`. |
| 1.4 | ✅ | frontend | "Use for models" is unclear | `packages/web/src/components/settings-modal.tsx` | Renamed the live provider action to `Set as default`. |
| 2.1 | ✅ | frontend | Goals inspector empty state | `packages/web/src/components/layout/chat-right-sidebar.tsx` | Replaced the terse empty state with explanatory copy and a clear next step. |
| 2.2 | ✅ | frontend | Curriculum empty state | `packages/web/src/components/layout/chat-right-sidebar.tsx` | Replaced the terse empty state with explanatory copy and a clear next step. |
| 2.4 | ✅ | frontend | Loading state is vague | `packages/web/src/routes/$directory.chat.tsx` | Changed the live chat loading copy to `Loading conversation history...`. |
| 4.1 | ✅ | frontend | Color-only status indicators | `packages/web/src/components/layout/chat-left-sidebar.tsx` | Added distinct live, unread, and idle indicators plus screen-reader text so thread state no longer relies on color alone. |
| 4.6 | ✅ | frontend | Missing form labels | `packages/web/src/components/mcp-dialog.tsx` | Added field-level validation messages with `aria-invalid`, `aria-describedby`, and `aria-errormessage` wiring on the MCP form inputs. |
| 5.1 | ✅ | frontend | No confirmation on archive | `packages/web/src/components/layout/chat-left-sidebar.tsx` | Added a confirmation dialog before archiving a thread. |
| 7.2 | ✅ | frontend | "New thread" vs "New chat" inconsistency | `packages/web/src/state/chat-store.ts`, `packages/web/src/routes/$directory.chat.tsx`, `packages/web/src/components/prompt/prompt-composer.tsx` | Standardized the live chat flow to `New thread`; remaining `New chat` references are in unused sidebar code. |
| 9.1 | ✅ | frontend | Silent loading in skills page | `packages/web/src/components/skills/skills-page.tsx` | Added visible `Loading skills...` copy while the screen is loading. |
| 9.2 | ✅ | frontend | "Updating..." is vague | `packages/web/src/components/mcp-dialog.tsx` | Replaced it with action-specific pending copy (`Connecting...`, `Disconnecting...`, `Signing in...`). |
| 9.3 | ✅ | frontend | No loading state for file search | `packages/web/src/components/prompt/prompt-composer.tsx` | Added a visible `Searching files...` state in the mention picker. |
| 12.2 | ✅ | frontend | Terminology still inconsistent | `packages/web/src/lib/directory-picker.ts`, `packages/web/src/state/chat-actions.ts`, multiple live copy surfaces | Standardized the remaining live `project` wording to `notebook` across the current UI path and user-facing errors. |
| 13.2 | ✅ | frontend | No touch support for resize handles | `packages/web/src/components/layout/resize-handle.tsx` | Added touch drag handling alongside mouse drag handling, including scroll suppression while resizing. |
| 14.1 | ✅ | frontend | Silent error swallowing | `packages/web/src/routes/skills.tsx` | Replaced silent catches in the skills route with user-visible error toasts for open, new thread, select, archive, and rename failures. |
| 20.1 | ✅ | frontend | More "project" references found (duplicate) | `packages/web/src/lib/directory-picker.ts`, `packages/web/src/state/chat-actions.ts`, multiple live copy surfaces | Duplicate of 12.2; the live terminology cleanup is now complete and the remaining cited examples are in unused sidebar code. |

## Undone

### Frontend

#### Should do

| ID | Mark | Label | Issue | File / Scope | Reason |
| --- | --- | --- | --- | --- | --- |
| 2.3 | ❌ | frontend | Skills library empty state | `packages/web/src/components/skills/skills-page.tsx` | Deferred because this pass prioritized primary chat surfaces first; this is lower-impact copy polish and can be handled in a later content sweep. |
| 3.4 | ❌ | frontend | Form validation too technical | `packages/web/src/components/mcp-dialog.tsx` | Deferred because better validation here needs redesigned helper text and examples, not just swapping error strings. |
| 4.2 | ❌ | frontend | Icon-only buttons lack discoverability | `packages/web/src/components/layout/chat-left-sidebar.tsx` | Deferred because the control already has an immediate tooltip and aria-label; adding visible text is a layout choice, not a clear low-risk fix. |
| 4.3 | ❌ | frontend | Hardcoded colors breaking theme | `packages/web/src/components/layout/chat-left-sidebar.tsx` | Deferred because replacing these values cleanly requires a wider theme-token cleanup, and the app is still forced dark today. |
| 5.2 | ❌ | frontend | Settings doesn't auto-save | `packages/web/src/components/settings-modal.tsx` | Deferred because changing save semantics affects user expectations and data-loss behavior; that needs a deliberate product decision, not a quick tweak. |
| 5.4 | ❌ | frontend | No visual feedback on new session | `packages/web/src/routes/$directory.chat.tsx`, `packages/web/src/components/layout/chat-left-sidebar.tsx` | Deferred because adding pending state here touches async thread-creation behavior and interaction timing, which I kept out of this conservative pass. |
| 6.1 | ❌ | frontend | Inconsistent border usage | multiple live UI files | Deferred because visual consistency work only makes sense as a coordinated cross-surface sweep, not piecemeal edits in a few files. |
| 6.2 | ❌ | frontend | Inconsistent button sizes | multiple live UI files | Deferred for the same reason: sizing token cleanup should be done as a system pass so hierarchy stays coherent. |
| 6.3 | ❌ | frontend | Inconsistent spacing in lists | `packages/web/src/components/mcp-dialog.tsx`, `packages/web/src/components/settings-modal.tsx` | Deferred because list spacing/layout normalization requires component-level design cleanup, not isolated spacing tweaks. |
| 7.1 | ❌ | frontend | "Accept Step" and "Restore Step" ambiguous | `packages/web/src/components/teaching/teaching-editor-panel.tsx` | Deferred because teaching terminology should be reviewed together, not renamed in isolation while that workflow is still secondary. |
| 8.1 | ❌ | frontend | Validation only on submit | `packages/web/src/components/mcp-dialog.tsx`, `packages/web/src/components/skills/skills-page.tsx` | Deferred because real-time validation needs additional form state, debounce behavior, and interaction design, not a low-risk patch. |
| 8.2 | ❌ | frontend | Generic validation messages | `packages/web/src/components/mcp-dialog.tsx` | Deferred because stronger validation copy should be redesigned alongside the validation rules and helper text, not as isolated string changes. |
| 9.4 | ❌ | frontend | Teaching workspace static loading text | `packages/web/src/routes/$directory.chat.tsx` | Deferred because making this materially better likely needs a spinner/progress pattern, not just another one-line copy swap. |
| 10.4 | ❌ | frontend | Sidebar organization dropdown lacks visual feedback | `packages/web/src/components/layout/chat-left-sidebar.tsx` | Deferred because reflecting current mode in the closed trigger changes the control design and should be part of a broader nav polish pass. |
| 13.1 | ❌ | frontend | Theme locked to dark mode only | `packages/web/src/app.tsx` | Deferred because enabling theme choice is an app-wide styling decision and should be done as a coordinated theme project, not a single-file change. |
| 15.1 | ❌ | frontend | Missing keyboard shortcuts help | `packages/web/src/components/prompt/prompt-composer.tsx`, `packages/web/src/components/layout/chat-left-sidebar.tsx` | Deferred because shortcut help needs a discoverable help surface and information architecture decision, not just extra text. |

#### Defer for now

| ID | Mark | Label | Issue | File / Scope | Reason |
| --- | --- | --- | --- | --- | --- |
| 1.1 | ❌ | frontend | "MCP" is technical jargon | `packages/web/src/routes/$directory.chat.tsx`, `packages/web/src/components/mcp-dialog.tsx`, `packages/web/src/components/prompt/prompt-composer.tsx` | Left as `MCP` by product preference; the current UI intentionally keeps the MCP label visible instead of switching to `Tools`. |
| 4.4 | ❌ | frontend | Low contrast on custom colors | `packages/web/src/components/layout/chat-left-sidebar.tsx` | Not changed because there is no measured contrast failure to target yet; color changes should follow an actual contrast audit rather than guesswork. |
| 4.5 | ❌ | frontend | Missing focus management in modals | `packages/ui/src/components/ui/dialog.tsx`, dialog consumers | No change because the underlying issue is invalid: the shared Radix dialog already provides the expected focus management behavior. |
| 10.1 | ❌ | frontend | Skills page has no clear back button | `packages/web/src/routes/skills.tsx` | No change because the current layout already exposes persistent sidebar navigation, so adding a second back affordance would duplicate navigation. |
| 10.2 | ❌ | frontend | Root route redirects without loading state | `packages/web/src/routes/index.tsx` | No change because the claimed issue is already resolved in code: the redirect already uses `replace`. |
| 10.3 | ❌ | frontend | No breadcrumb in settings modal | `packages/web/src/components/settings-modal.tsx` | No change because the claimed issue is already resolved in code: notebook context is already visible in the modal. |
| 11.1 | ❌ | frontend | Settings and Help buttons do nothing | `packages/web/src/components/layout/sidebar-project.tsx` | No change because this file is in an unused sidebar path, so editing it would not affect the live product. |
| 12.1 | ❌ | frontend | Session ID visible in sidebar | `packages/web/src/components/layout/sidebar-items.tsx` | No change because this file is in an unused sidebar path, so editing it would not affect the live product. |
| 15.2 | ❌ | frontend | URL encoding may confuse users | `packages/web/src/lib/directory-token.ts`, route structure | Deferred because changing route token format affects routing and bookmark/link stability beyond simple UI polish. |
| 16.1 | ❌ | frontend | Settings and Help buttons do nothing (duplicate) | `packages/web/src/components/layout/sidebar-project.tsx` | Duplicate of 11.1; still not addressed because this file is dead code in the current app path. |
| 17.1 | ❌ | frontend | Debug logs throughout sync system | `packages/web/src/state/chat-sync.ts` | No change because this is technical debt and observability cleanup, not a user-facing UI polish fix. |
| 18.1 | ❌ | frontend | Teaching mode has no UI entry point | `packages/web/src/routes/$directory.chat.tsx` | No change because the underlying issue is invalid: the current route already exposes a live teaching entry point. |
| 19.1 | ❌ | frontend | Markdown theme hardcoded to dark | `packages/web/src/lib/markdown-parser.ts` | Deferred because theme-aware markdown is best handled after any future theme-system work; changing it now has little user value while the app is forced dark. |
| 21.1 | ❌ | frontend | Vendored SDK references in code | `packages/web/src/lib/opencode-client.ts` | No change because this is architecture debt and naming cleanup, not part of the UI/UX implementation scope. |

### Backend

| ID | Mark | Label | Issue | File / Scope | Reason |
| --- | --- | --- | --- | --- | --- |
| none | ❌ | backend | No backend-only items in this audit | audit scope | The current UI/UX audit does not contain any issues that are best solved with a backend-only change. |

### Fullstack

| ID | Mark | Label | Issue | File / Scope | Reason |
| --- | --- | --- | --- | --- | --- |
| 3.1 | ❌ | fullstack | Raw API errors in MCP dialog | `packages/web/src/components/mcp-dialog.tsx` | Added friendly mapping for common connection/auth/timeout failures, but unmatched backend errors still pass through; a complete fix needs stable backend error categories. |
| 3.2 | ❌ | fullstack | Raw error in settings modal | `packages/web/src/components/settings-modal.tsx` | Deferred because fixing this properly needs a shared error-normalization path for settings responses, not another one-off string mapping. |
| 3.3 | ❌ | fullstack | Teaching panel error display | `packages/web/src/components/teaching/teaching-editor-panel.tsx` | Deferred because teaching mode is a secondary surface and a complete fix likely needs better backend error shaping as well as UI translation. |
| 5.3 | ❌ | fullstack | Teaching workspace conflict resolution abrupt | `packages/web/src/components/teaching/teaching-editor-panel.tsx` | Deferred because a real fix likely needs richer conflict data or diff support as well as stronger UI, which is larger than this low-risk pass. |
