# Buddy UI/UX Polish Audit

**Date:** March 3, 2026  
**Scope:** packages/web/src  
**Status:** Pending Evaluation

---

## Executive Summary

This document catalogs UI/UX polish issues identified during a comprehensive walkthrough of the Buddy web application. Issues are organized by category and prioritized by impact on user experience.

**Total Issues Found:** 37  
**High Priority:** 12 issues  
**Medium Priority:** 15 issues  
**Low Priority:** 10 issues

---

## 1. Inconsistent UI Patterns & Terminology

### 1.1 "MCP" is Technical Jargon

**Location:** `$directory.chat.tsx:1541-1552`
**Current:** Button shows "MCP" or "MCP 2/3" or "MCP error"
**Problem:** Users don't know what MCP (Model Context Protocol) means. This is technical terminology that creates confusion.
**Impact:** High - Every user sees this button
**Suggested Fix:** Change to "Tools" or "Extensions" with MCP as secondary label or tooltip

### 1.2 Inconsistent Action Verbs

**Location:** Multiple files
**Current:** Mix of "Add", "Connect", "Authorize" for similar actions

- `mcp-dialog.tsx:514`: "Add MCP"
- `mcp-dialog.tsx:577`: "Edit"
- `settings-modal.tsx`: "Connect provider"
  **Problem:** Users can't predict what each action does
  **Impact:** Medium
  **Suggested Fix:** Standardize: "Add" for new items, "Connect" for external services, "Enable" for toggles

### 1.3 "Policy" Label is Vague

**Location:** `skills-page.tsx:138-140`
**Current:** Button labeled "Policy" for permission actions
**Problem:** Users don't understand what "Policy" means without clicking
**Impact:** Medium
**Suggested Fix:** Use "Permissions" or show current state "Access: Ask first"

### 1.4 "Use for models" is Unclear

**Location:** `settings-modal.tsx:337-345`
**Current:** Button "Use for models" when provider not selected
**Problem:** Unclear scope - all models? Just this notebook?
**Impact:** Medium
**Suggested Fix:** "Set as default provider" or "Use this provider"

---

## 2. Missing or Confusing Empty States

### 2.1 Goals Inspector Empty State

**Location:** `chat-right-sidebar.tsx:159`
**Current:** `"No goals found for this notebook yet."`
**Problem:** No explanation of what goals are or how to create them
**Impact:** High - Dead end for users
**Suggested Fix:**

```
"No learning goals set yet. Goals help Buddy track your progress.
Ask Buddy to create a study plan to get started."
```

### 2.2 Curriculum Empty State

**Location:** `chat-right-sidebar.tsx:194`
**Current:** `"No curriculum found for this notebook yet."`
**Problem:** No context about what curriculum does
**Impact:** High - Feature appears broken
**Suggested Fix:**

```
"No curriculum created yet. A curriculum guides your learning path.
Ask Buddy to create one for this project."
```

### 2.3 Skills Library Empty State

**Location:** `skills-page.tsx:573-577`
**Current:** `"No library skills matched your search."`
**Problem:** Too terse, no guidance
**Impact:** Medium
**Suggested Fix:** Add guidance on how skills are discovered or link to documentation

### 2.4 Loading State is Vague

**Location:** `$directory.chat.tsx:1617`
**Current:** `"Loading notebook chat..."`
**Problem:** Users don't know what's being loaded or how long to wait
**Impact:** Medium
**Suggested Fix:** Add specificity: "Loading conversation history..." or use skeleton UI

---

## 3. Error Handling Exposes Technical Details

### 3.1 Raw API Errors in MCP Dialog

**Location:** `mcp-dialog.tsx:410-414, 461, 490-491`
**Current:** `setError(stringifyError(statusResult.reason))`
**Problem:** Technical errors like "ECONNREFUSED", JSON parse errors exposed to users
**Impact:** High - Confuses non-technical users
**Suggested Fix:** Map error types:

- Connection errors → "Could not connect to MCP server. Please check the URL and try again."
- Auth errors → "Authentication failed. Please verify your credentials."
- Timeout → "Connection timed out. The server may be busy."

### 3.2 Raw Error in Settings Modal

**Location:** `settings-modal.tsx:126`
**Current:** `if (settings.status.error) return settings.status.error`
**Problem:** Backend error messages may contain technical jargon
**Impact:** Medium
**Suggested Fix:** Add error message mapping layer

### 3.3 Teaching Panel Error Display

**Location:** `teaching-editor-panel.tsx:307-309`
**Current:** Raw `saveError` string displayed
**Problem:** Could be technical error message
**Impact:** Low (teaching mode may be dev-only)
**Suggested Fix:** Parse and translate common errors

### 3.4 Form Validation Too Technical

**Location:** `mcp-dialog.tsx:203-226`
**Current:** `"Environment must be a JSON object with string values."`
**Problem:** Users who aren't developers may not understand "JSON object"
**Impact:** Medium
**Suggested Fix:** Provide examples and friendlier messages with visual format hints

---

## 4. Accessibility Issues

### 4.1 Color-Only Status Indicators

**Location:** `chat-left-sidebar.tsx:398-400`, `sidebar-items.tsx:47-49`
**Current:** Status dots using only color:

- Amber = busy
- Emerald = idle
- Sky = unread
  **Problem:** Colorblind users cannot distinguish (WCAG 1.4.1 violation)
  **Impact:** High - Excludes colorblind users
  **Suggested Fix:** Add icons:
- Busy: Spinner or pulse icon
- Idle: Static dot
- Unread: Envelope or dot icon

### 4.2 Icon-Only Buttons Lack Discoverability

**Location:** `chat-left-sidebar.tsx:227-234` (Add notebook button)
**Current:** Only `aria-label` and `title`, no visible text
**Problem:** Not discoverable without hovering
**Impact:** Medium
**Suggested Fix:** Add text labels or ensure tooltips appear immediately on hover

### 4.3 Hardcoded Colors Breaking Theme

**Location:** `chat-left-sidebar.tsx:208, 223, 240, etc.`
**Current:** Multiple hardcoded colors:

- `bg-[#0b0b0d]`
- `hover:bg-[#151821]`
- `hover:bg-[#1a1d24]`
  **Problem:** Breaks theming, hard to maintain
  **Impact:** Low (technical debt)
  **Suggested Fix:** Use theme variables consistently

### 4.4 Low Contrast on Custom Colors

**Location:** `chat-left-sidebar.tsx:208`
**Current:** `bg-[#0b0b0d]` with `text-muted-foreground`
**Problem:** May not meet WCAG AA contrast ratios
**Impact:** Medium
**Suggested Fix:** Verify contrast ratios and use semantic tokens

### 4.5 Missing Focus Management in Modals

**Location:** `settings-modal.tsx`, `mcp-dialog.tsx`, `connect-provider-dialog.tsx`
**Current:** No focus trap or initial focus management
**Problem:** Keyboard users may navigate outside modal or lose focus
**Impact:** Medium
**Suggested Fix:** Implement focus trap and set initial focus

### 4.6 Missing Form Labels

**Location:** `mcp-dialog.tsx:664-678, 685-703`
**Current:** Labels exist but lack `aria-describedby` for errors
**Problem:** Screen readers can't associate errors with fields
**Impact:** Medium
**Suggested Fix:** Add `aria-invalid`, `aria-errormessage`, `aria-describedby`

---

## 5. User Flow Friction Points

### 5.1 No Confirmation on Archive

**Location:** `chat-left-sidebar.tsx:455-461`
**Current:** Archive action happens immediately
**Problem:** Users may accidentally archive important conversations
**Impact:** High - Data loss risk
**Suggested Fix:** Add confirmation dialog or undo option (toast with "Undo" button)

### 5.2 Settings Doesn't Auto-Save

**Location:** `settings-modal.tsx:433-439`
**Current:** Users must click "Save changes" button
**Problem:** Users may forget to save and lose changes
**Impact:** Medium
**Suggested Fix:**

- Option A: Auto-save on change
- Option B: Show "Unsaved changes" indicator with "Discard changes?" confirmation

### 5.3 Teaching Workspace Conflict Resolution Abrupt

**Location:** `teaching-editor-panel.tsx:294-303`
**Current:** Two buttons "Load external changes" and "Force overwrite" with minimal context
**Problem:** Users don't understand implications
**Impact:** Low (teaching mode)
**Suggested Fix:** Add detailed explanation or show diff preview

### 5.4 No Visual Feedback on New Session

**Location:** `chat-left-sidebar.tsx:362-365`
**Current:** Click navigates immediately
**Problem:** If delay exists, users think click didn't register
**Impact:** Low
**Suggested Fix:** Add optimistic UI update or loading state

---

## 6. Visual Inconsistencies

### 6.1 Inconsistent Border Usage

**Location:** Throughout codebase
**Current:**

- `chat.tsx:92`: `rounded-xl border bg-card p-4`
- `settings-modal.tsx:157`: `border-r border-border/60`
- `chat-left-sidebar.tsx:208`: No explicit border
  **Problem:** Visual inconsistency
  **Impact:** Low (polish)
  **Suggested Fix:** Standardize on `border-border/60` or full opacity

### 6.2 Inconsistent Button Sizes

**Location:** Various files
**Current:** Mix of `size="sm"`, `size="xs"`, `size="icon-xs"`
**Problem:** Unclear visual hierarchy
**Impact:** Low
**Suggested Fix:** Establish guidelines: primary = sm, secondary = xs, icon = icon-sm

### 6.3 Inconsistent Spacing in Lists

**Location:** `mcp-dialog.tsx:506-517` vs `settings-modal.tsx:312-365`
**Current:** Different visual treatments for similar list UIs
**Problem:** UI feels unpolished
**Impact:** Low
**Suggested Fix:** Create reusable card/list components

---

## 7. Button/Action Labels That Are Unclear

### 7.1 "Accept Step" and "Restore Step" Ambiguous

**Location:** `teaching-editor-panel.tsx:274-291`
**Current:**

- "Accept Step" - "Mark the current lesson state as accepted"
- "Restore Step" - "Restore the lesson file to the last accepted state"
  **Problem:** Labels don't convey meaning without tooltips
  **Impact:** Low (teaching mode)
  **Suggested Fix:** "Save Checkpoint" and "Revert to Checkpoint"

### 7.2 "New thread" vs "New chat" Inconsistency

**Location:** Various
**Current:** Sidebar shows "New thread" but other places use "New chat"
**Problem:** Terminology inconsistency
**Impact:** Low
**Suggested Fix:** Standardize on one term

---

## 8. Form Validation Issues

### 8.1 Validation Only on Submit

**Location:** `mcp-dialog.tsx`, `skills-page.tsx`
**Current:** Errors only shown when clicking save
**Problem:** Frustrating feedback loop
**Impact:** Medium
**Suggested Fix:** Real-time validation with debouncing

### 8.2 Generic Validation Messages

**Location:** `mcp-dialog.tsx`
**Current:** "Name is required", "Timeout must be a positive integer"
**Problem:** Doesn't guide on acceptable values
**Impact:** Low
**Suggested Fix:** Add constraints: "Name must be unique, letters/numbers/hyphens only"

---

## 9. Loading State Issues

### 9.1 Silent Loading in Skills Page

**Location:** `skills-page.tsx:507-525`
**Current:** Shows skeleton cards but no text
**Problem:** Users don't know what's loading
**Impact:** Low
**Suggested Fix:** Add "Loading your skills..." text

### 9.2 "Updating..." is Vague

**Location:** `mcp-dialog.tsx:557`
**Current:** `"Updating..."`
**Problem:** Doesn't specify what update is happening
**Impact:** Low
**Suggested Fix:** "Connecting...", "Disconnecting...", "Saving..."

### 9.3 No Loading State for File Search

**Location:** `prompt-composer.tsx:531-557`
**Current:** Search happens in background
**Problem:** If slow, users think feature isn't working
**Impact:** Low
**Suggested Fix:** Add "Searching..." spinner in dropdown

### 9.4 Teaching Workspace Static Loading Text

**Location:** `$directory.chat.tsx:1745-1747`
**Current:** `"Preparing lesson workspace..."` with no progress
**Problem:** No indication if stuck or working
**Impact:** Low (teaching mode)
**Suggested Fix:** Add animated spinner or progress steps

---

## 10. Navigation Issues

### 10.1 Skills Page Has No Clear Back Button

**Location:** `skills.tsx`
**Current:** "Open curriculum" button goes to chat but not obvious
**Problem:** Users may get stuck on skills page
**Impact:** Medium
**Suggested Fix:** Add prominent "Back to Chat" or "Return to Notebook" button

### 10.2 Root Route Redirects Without Loading State

**Location:** `index.tsx:11-13`
**Current:** Immediate redirect to `/chat`
**Problem:** Blank page if delay, extra history entry
**Impact:** Low
**Suggested Fix:** Add brief loading state or use replace navigation

### 10.3 No Breadcrumb in Settings Modal

**Location:** `settings-modal.tsx`
**Current:** Users navigate tabs but lose context
**Problem:** Unclear which notebook's settings are being edited
**Impact:** Low
**Suggested Fix:** Add header: "Settings for [Notebook Name]"

### 10.4 Sidebar Organization Dropdown Lacks Visual Feedback

**Location:** `chat-left-sidebar.tsx:236-287`
**Current:** Trigger button doesn't show current mode
**Problem:** Users can't see current organization without opening menu
**Impact:** Low
**Suggested Fix:** Add icon or indicator on trigger button

---

## Summary Table

| Category             | Count | High Priority Issues                    |
| -------------------- | ----- | --------------------------------------- |
| Terminology & Jargon | 4     | MCP button, inconsistent verbs          |
| Empty States         | 4     | Goals, curriculum need CTAs             |
| Error Handling       | 4     | Technical errors exposed                |
| Accessibility        | 6     | Color-only indicators, focus management |
| User Flow            | 4     | Archive confirmation, auto-save         |
| Visual               | 4     | Hardcoded colors, inconsistent spacing  |
| Button Labels        | 3     | Accept Step, Policy, Use for models     |
| Form Validation      | 2     | Real-time validation                    |
| Loading States       | 4     | Specificity needed                      |
| Navigation           | 4     | Back button, breadcrumbs                |

**Total: 37 issues**

---

## Recommended Implementation Order

### Phase 1: Critical (High Impact, Low Effort)

1. Rename "MCP" button to "Tools"
2. Add confirmation for archive action
3. Improve goals/curriculum empty states with CTAs
4. Map technical errors to friendly messages

### Phase 2: Important (Medium Impact)

5. Add icons to status indicators (accessibility)
6. Standardize action verbs (Add/Connect/Enable)
7. Add "Back to Chat" button on skills page
8. Fix "Policy" label to "Permissions"

### Phase 3: Polish (Low Impact)

9. Replace hardcoded colors with theme variables
10. Add real-time form validation
11. Improve loading state messages
12. Add breadcrumbs to settings

---

## Files Involved

**Primary Files:**

- `packages/web/src/routes/$directory.chat.tsx`
- `packages/web/src/components/settings-modal.tsx`
- `packages/web/src/components/layout/chat-left-sidebar.tsx`
- `packages/web/src/components/layout/chat-right-sidebar.tsx`
- `packages/web/src/components/skills/skills-page.tsx`
- `packages/web/src/components/mcp-dialog.tsx`
- `packages/web/src/components/teaching/teaching-editor-panel.tsx`
- `packages/web/src/components/prompt/prompt-composer.tsx`

**Secondary Files:**

- `packages/web/src/routes/chat.tsx`
- `packages/web/src/routes/index.tsx`
- `packages/web/src/routes/skills.tsx`
- `packages/web/src/components/layout/sidebar-items.tsx`
- `packages/web/src/components/layout/sidebar-workspace.tsx`

---

# Additional Findings - Second Pass (March 3, 2026)

**Scope:** Deeper inspection of components, hooks, and edge cases  
**New Issues Found:** 9 issues not covered in initial audit

---

## 11. Non-Functional UI Elements (Critical)

### 11.1 Settings and Help Buttons Do Nothing

**Location:** `sidebar-project.tsx:35-50`
**Current:**

```tsx
<button type="button" title="Settings" aria-label="Settings">
  <SettingsIcon className="size-3.5 mx-auto" />
</button>
<button type="button" title="Help" aria-label="Help">
  <HelpIcon className="size-3.5 mx-auto" />
</button>
```

**Problem:** Both buttons have no `onClick` handlers - they're dead UI elements that confuse users
**Impact:** High - Users click expecting functionality
**Suggested Fix:** Either implement the features or remove the buttons until ready

---

## 12. Technical Details Still Exposed

### 12.1 Session ID Visible in Sidebar

**Location:** `sidebar-items.tsx:53`
**Current:** `{props.session.id.slice(0, 10)}`
**Problem:** Shows internal session ID (first 10 chars) which users don't need to see
**Impact:** Medium - Creates visual clutter, exposes internals
**Suggested Fix:** Remove or replace with meaningful metadata (message count, etc.)

### 12.2 Terminology Still Inconsistent

**Locations:**

- `sidebar-workspace.tsx:81`: "Close project" → should be "Close notebook"
- `sidebar-project.tsx:28`: "Open project" tooltip → should be "Open notebook"
- `directory-picker.ts:37,58`: Dialog title "Open project" → should be "Open notebook"
- `chat-left-sidebar.tsx`: "New thread" vs `sidebar-items.tsx:73`: "New chat"
  **Problem:** Mixed terminology after initial standardization pass
  **Impact:** Medium - Continued cognitive load
  **Suggested Fix:** Complete the standardization across all components

---

## 13. Theme and Accessibility Issues

### 13.1 Theme Locked to Dark Mode Only

**Location:** `app.tsx:29`
**Current:** `<ThemeProvider forcedTheme="dark" enableSystem={false}>`
**Problem:** No user preference support, no system preference detection
**Impact:** Medium - Accessibility and user preference issue
**Suggested Fix:** Remove `forcedTheme` and `enableSystem={false}`, allow theme switching

### 13.2 No Touch Support for Resize Handles

**Location:** `resize-handle.tsx`
**Current:** Only handles `mouseMove`/`mouseUp` events
**Problem:** Breaks on tablets and touch devices
**Impact:** Medium - Mobile/tablet users can't resize panels
**Suggested Fix:** Add `touchMove`/`touchEnd` event handlers

---

## 14. Error Handling Issues

### 14.1 Silent Error Swallowing

**Location:** `skills.tsx:75-77, 89-91, 105-107, 118-120, 147-149`
**Current:**

```tsx
} catch {
  // project actions manage their own error state
}
```

**Problem:** Errors caught and silently ignored. Comment says errors are managed but none shown to user.
**Impact:** High - Users get no feedback if actions fail
**Suggested Fix:** Add error toast notifications or inline error display

---

## 15. User Experience Gaps

### 15.1 Missing Keyboard Shortcuts Help

**Location:** `prompt-composer.tsx` (has shortcuts), `chat-left-sidebar.tsx` (has shortcuts)
**Current:** Keyboard shortcuts exist (Escape, arrows, Enter) but:

- No help menu
- No documentation
- Users must discover by trial
  **Problem:** Power features are hidden
  **Impact:** Low - But hurts power user productivity
  **Suggested Fix:** Add "?" help button or keyboard shortcut overlay (Cmd+?)

### 15.2 URL Encoding May Confuse Users

**Location:** URL routing
**Current:** `/$directory/chat` where directory is base64-encoded path
**Problem:** Users see cryptic URLs like `/%2FUsers%2F...` when sharing/bookmarking
**Impact:** Low - Cosmetic issue
**Suggested Fix:** Consider friendlier URL structure or accept that it's internal

---

## Summary Table - Second Pass

| Category           | Count | Priority Issues                      |
| ------------------ | ----- | ------------------------------------ |
| Non-functional UI  | 1     | Settings/Help buttons do nothing     |
| Technical exposure | 2     | Session ID visible, terminology gaps |
| Accessibility      | 2     | Dark mode only, no touch support     |
| Error handling     | 1     | Silent error swallowing              |
| UX gaps            | 2     | Missing shortcuts help, URL encoding |

**Total New Issues: 9**

---

## Updated Implementation Order

### Phase 1: Critical (Add to existing)

13. Remove or fix non-functional Settings/Help buttons
14. Fix silent error swallowing in skills page
15. Complete terminology standardization

### Phase 2: Important (Add to existing)

16. Remove session ID from sidebar UI
17. Add touch support for resize handles
18. Enable theme switching

### Phase 3: Polish (Add to existing)

19. Add keyboard shortcuts help
20. Review URL structure

---

## Additional Files Involved (Second Pass)

- `packages/web/src/components/layout/sidebar-project.tsx`
- `packages/web/src/components/layout/sidebar-items.tsx`
- `packages/web/src/components/layout/resize-handle.tsx`
- `packages/web/src/lib/directory-picker.ts`
- `packages/web/src/app.tsx`

---

**Total Issues in Audit: 56 (37 initial + 9 from second pass + 10 from comprehensive third pass)**

---

# Additional Findings - Third Pass (Complete Codebase Analysis)

**Date:** March 3, 2026  
**Scope:** All 61 TypeScript/TSX files in packages/web/src  
**New Issues Found:** 10 issues from comprehensive file-by-file analysis

---

## 16. Dead Code - Non-Functional UI Elements

### 16.1 Settings and Help Buttons Do Nothing

**Location:** `sidebar-project.tsx:35-51`
**Current:**

```tsx
<button type="button" title="Settings" aria-label="Settings">
  <SettingsIcon className="size-3.5 mx-auto" />
</button>
<button type="button" title="Help" aria-label="Help">
  <HelpIcon className="size-3.5 mx-auto" />
</button>
```

**Problem:** Both buttons have NO `onClick` handlers - completely non-functional dead code that creates false expectations for users
**Impact:** High - Dead UI is worse than missing UI
**Suggested Fix:** Either implement the functionality or remove the buttons entirely

---

## 17. Console Logging in Production Code

### 17.1 Debug Logs Throughout Sync System

**Location:** `chat-sync.ts:160, 179-183, 209, 269, 277, 288, 301`
**Current:** Multiple `console.info`, `console.warn` calls in production code
**Problem:** Console noise in production builds, exposed internal implementation details
**Impact:** Low - Technical debt, but not user-facing
**Suggested Fix:** Wrap in `import.meta.env.DEV` checks or use proper logging library with levels

---

## 18. Hidden/Undiscoverable Features

### 18.1 Teaching Mode Has No UI Entry Point

**Location:** `teaching-mode.ts` (375 lines), `teaching-actions.ts` (131 lines)
**Problem:** Extensive teaching mode state management exists but:

- No UI button to activate teaching mode
- No indication it exists in the interface
- Users cannot discover the feature
  **Impact:** Medium - Wasted development effort, hidden functionality
  **Suggested Fix:** Add teaching mode toggle in UI or remove if not production-ready

---

## 19. Theme Consistency Issues

### 19.1 Markdown Theme Hardcoded to Dark

**Location:** `markdown-parser.ts:13-14, 89-91, 121-124`
**Current:** Theme hardcoded to `"github-dark"` for syntax highlighting
**Problem:** Doesn't respect app theme setting, inconsistent with dark-only theme lock
**Impact:** Low - Visual inconsistency
**Suggested Fix:** Use theme-aware syntax highlighting or remove hardcoding

---

## 20. Additional Terminology Inconsistencies

### 20.1 More "Project" References Found

**Locations:**

- `sidebar-workspace.tsx:81`: "Close project" button text
- `sidebar-project.tsx:28`: "Open project" tooltip
- `directory-picker.ts:37,58`: Native dialog titles "Open project"
- `chat-left-sidebar.tsx`: Uses "New thread"
- `sidebar-items.tsx:73`: Uses "New chat"

**Problem:** Still mixing "project", "thread", and "chat" terminology after notebook standardization
**Impact:** Medium - Ongoing cognitive load for users
**Suggested Fix:** Complete audit and standardize all remaining references

---

## 21. Code Architecture Issues

### 21.1 Vendored SDK References in Code

**Location:** `opencode-client.ts:1`
**Current:** `import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"`
**Problem:** Internal references to vendored OpenCode SDK remain in codebase
**Impact:** Low - Technical debt, not user-facing
**Suggested Fix:** Eventually abstract or rename to avoid confusion

---

## Summary Table - Third Pass

| Category        | Count | Priority Issues                |
| --------------- | ----- | ------------------------------ |
| Dead code       | 1     | Non-functional buttons         |
| Console logging | 1     | Production debug logs          |
| Hidden features | 1     | Undiscoverable teaching mode   |
| Theme issues    | 1     | Hardcoded markdown theme       |
| Terminology     | 1     | Remaining "project" references |
| Architecture    | 1     | SDK references                 |

**Total New Issues: 6 (unique from previous passes)**

---

## Updated Implementation Order

### Phase 1: Critical (Add to existing)

21. Remove or fix non-functional Settings/Help buttons
22. Complete terminology standardization across ALL files
23. Either expose teaching mode or remove dead code

### Phase 2: Important (Add to existing)

24. Remove session ID from sidebar UI
25. Add touch support for resize handles
26. Enable theme switching (remove forced dark)
27. Clean up production console logging

### Phase 3: Polish (Add to existing)

28. Add keyboard shortcuts help
29. Review URL structure
30. Theme-aware markdown highlighting
31. Abstract vendored SDK references

---

## All Files Involved (Complete Audit)

**Component Files (29):**

- All route files (6)
- All layout components (7)
- All chat components (4)
- All prompt components (6)
- Skills, settings, teaching, MCP dialogs (6)

**Utility/State Files (32):**

- All state management files (9)
- All lib utilities (7)
- All context files (2)
- All helper files (14)

**Total: 61 files analyzed**

---

**FINAL TOTAL: 56 Issues**

- 37 from initial pass
- 9 from second pass
- 10 from comprehensive third pass

_This audit represents a complete analysis of every TypeScript file in the Buddy web application._

_This document contains findings from two comprehensive passes through the Buddy web application frontend._

---

# Verification Pass (March 3, 2026)

This section verifies the claims above against the current codebase as it exists today.

- The audit currently contains **52 issue headings**, not 56.
- **2 headings are direct duplicates**: `11.1` = `16.1`, and `12.2` = `20.1`.
- Priority is assigned only to **live, current UI issues**.

**Tag legend:** `VERIFIED`, `PARTIAL`, `REJECTED`, `DEAD_CODE`, `DUPLICATE`, `OUT_OF_SCOPE`  
**Priority legend:** `P1` high user impact, `P2` meaningful UX issue, `P3` moderate polish/accessibility gap, `P4` minor polish/backlog, `n/a` not a live issue

## 1. Terminology & Empty States

- `1.1` `VERIFIED` `P2` **Raw "MCP" Acronym In Primary Chat Header**. The live chat header still renders `MCP`, `MCP 2/3`, and `MCP error` in `packages/web/src/routes/$directory.chat.tsx`.
- `1.2` `VERIFIED` `P4` **Action Verb Choices Are Inconsistent Across Similar Flows**. Live UI still mixes `Add`, `Edit`, `Authorize`, `Connect`, `Connect provider`, `Manage`, and `Use for models`.
- `1.3` `VERIFIED` `P3` **Skills Permission Trigger Uses A Vague "Policy" Label**. The permission menu button in `packages/web/src/components/skills/skills-page.tsx` is still labeled `Policy`.
- `1.4` `PARTIAL` `P4` **"Use for models" Is Present But Context-Dependent**. The label exists in `packages/web/src/components/settings-modal.tsx`; it is somewhat ambiguous in isolation, but the surrounding provider panel gives partial context.
- `2.1` `VERIFIED` `P2` **Goals Inspector Empty State Is Terse And Non-Actionable**. The live right sidebar still shows `No goals found for this notebook yet.` with no next step.
- `2.2` `VERIFIED` `P2` **Curriculum Empty State Is Terse And Non-Actionable**. The live right sidebar still shows `No curriculum found for this notebook yet.` with no next step.
- `2.3` `VERIFIED` `P4` **Skills Library Empty State Lacks Guidance**. The library section still falls back to `No library skills matched your search.` only.
- `2.4` `PARTIAL` `P4` **Notebook Chat Loading Copy Is Generic, Not Broken**. The route still shows `Loading notebook chat...`; the message is real but this is a copy-quality issue, not a functional failure.

## 2. Error Handling & Validation

- `3.1` `VERIFIED` `P1` **MCP Dialog Surfaces Raw Backend/Error Strings**. `packages/web/src/components/mcp-dialog.tsx` still feeds `stringifyError(...)` directly into user-visible error state for load, toggle, auth, and save failures.
- `3.2` `VERIFIED` `P2` **Settings Footer Shows Raw Settings Error Text**. `packages/web/src/components/settings-modal.tsx` still returns `settings.status.error` directly in `footerHint`.
- `3.3` `VERIFIED` `P3` **Teaching Editor Displays Raw Save Errors**. `packages/web/src/components/teaching/teaching-editor-panel.tsx` still renders `props.workspace.saveError` directly.
- `3.4` `VERIFIED` `P4` **MCP Validation Copy Remains Developer-Oriented**. Errors like `Environment must be a JSON object with string values.` and `...must be valid JSON.` are still used in `packages/web/src/components/mcp-dialog.tsx`.
- `8.1` `PARTIAL` `P4` **Submit-Time Validation Is Only Partly Accurate**. The MCP dialog validates on save, but the create-skill dialog already blocks submission when required fields are empty, so this is not universally true.
- `8.2` `VERIFIED` `P4` **Validation Errors Are Minimal And Generic**. Messages such as `Name is required.` and `Timeout must be a positive integer.` are still the active strings.
- `14.1` `VERIFIED` `P2` **Skills Route Swallows Action Errors Without Local UI Feedback**. `packages/web/src/routes/skills.tsx` still catches several async failures and suppresses them locally; those errors are written to store state, but this route does not render that state.

## 3. Accessibility

- `4.1` `PARTIAL` `P2` **Thread Status Still Relies Heavily On Color**. The live `chat-left-sidebar` uses color dots for busy/unread/idle; the cited `sidebar-items.tsx` example also does this, but that file is currently unused.
- `4.2` `PARTIAL` `P4` **Add Notebook Control Is Icon-Only But Tooltip-Backed**. The live button is icon-only, but the audit understates the current implementation because it also has a zero-delay tooltip in `packages/web/src/components/layout/chat-left-sidebar.tsx`.
- `4.3` `PARTIAL` `P4` **Hardcoded Sidebar Hex Colors Exist, But They Do Not Break The Only Active Theme**. Custom hex colors are present in `packages/web/src/components/layout/chat-left-sidebar.tsx`, but the app is also currently forced to dark mode.
- `4.4` `REJECTED` `n/a` **No Concrete Contrast Failure Is Demonstrated**. The cited low-contrast claim is not substantiated by the audit; no measured WCAG failure is shown.
- `4.5` `REJECTED` `n/a` **Modal Focus Management Is Handled By The Shared Radix Dialog**. `@buddy/ui` wraps Radix `Dialog`, so the blanket `no focus trap` claim does not hold for `settings-modal`, `mcp-dialog`, or `connect-provider-dialog`.
- `4.6` `PARTIAL` `P4` **Field Errors Are Not Programmatically Associated**. The original title is inaccurate because labels do exist; the real issue is that `mcp-dialog.tsx` uses form-level errors without field-level `aria-describedby` / `aria-errormessage` wiring.

## 4. User Flow & Navigation

- `5.1` `VERIFIED` `P2` **Archive Action Executes Immediately With No Confirm/Undo**. `packages/web/src/components/layout/chat-left-sidebar.tsx` still calls `onArchiveSession(...)` directly from the menu.
- `5.2` `VERIFIED` `P4` **Settings Are Explicit-Save Only**. `packages/web/src/components/settings-modal.tsx` still requires `Save changes`; there is no auto-save path.
- `5.3` `PARTIAL` `P4` **Teaching Conflict UI Is Brief But Not Context-Free**. The conflict bar already explains that the lesson file changed outside the editor, so the issue is weaker than described.
- `5.4` `VERIFIED` `P4` **New Session Creation Has No Pending-State Feedback**. The live `onNewSession` path awaits async work without disabling the trigger or showing progress.
- `9.3` `VERIFIED` `P4` **Mention File Search Has No Visible In-Flight State**. `packages/web/src/components/prompt/prompt-composer.tsx` performs async file search but does not track or render a searching indicator.
- `10.1` `REJECTED` `n/a` **Skills Page Is Not A Navigation Dead End**. There is no dedicated back button in the content area, but the live page keeps the left sidebar visible, so users are not trapped there.
- `10.2` `REJECTED` `n/a` **Root Redirect Already Uses Replace Navigation**. `packages/web/src/routes/index.tsx` calls `navigate({ to: "/chat", replace: true })`, so the extra-history-entry claim is incorrect.
- `10.3` `REJECTED` `n/a` **Settings Modal Already Shows Notebook Context**. `packages/web/src/components/settings-modal.tsx` shows `Notebook` in the nav and `local: <directory name>` in the sidebar footer.
- `10.4` `VERIFIED` `P4` **Thread Organization Trigger Does Not Reflect The Current Mode Closed**. The trigger remains a generic icon button; current mode is only visible after opening the dropdown.
- `15.1` `VERIFIED` `P4` **Keyboard Shortcuts Exist Without An Obvious Discovery Surface**. Shortcut handling exists in `packages/web/src/components/prompt/prompt-composer.tsx`, but there is no visible help entry point for it.

## 5. Visual Consistency & Copy

- `6.1` `VERIFIED` `P4` **Border Treatments Are Visibly Inconsistent Across Surfaces**. The cited examples still mix explicit borders, partial borders, and custom fills.
- `6.2` `VERIFIED` `P4` **Button Sizing Tokens Are Mixed Across Similar Controls**. `sm`, `xs`, and icon sizes are all still used side-by-side in the audited surfaces.
- `6.3` `VERIFIED` `P4` **Comparable List UIs Still Use Different Spacing/Card Treatments**. The MCP list and settings lists still use noticeably different spacing patterns.
- `7.1` `PARTIAL` `P4` **Teaching Step Labels Are Short, But Tooltips Clarify Them**. `Accept Step` and `Restore Step` are still terse, though both buttons include explanatory `title` text.
- `7.2` `VERIFIED` `P3` **"New thread" And "New chat" Both Still Exist In Live UI**. `chat-left-sidebar.tsx` uses `New thread`, while `$directory.chat.tsx` still falls back to `New chat` for the session title.
- `9.1` `VERIFIED` `P4` **Skills Page Initial Loading Uses Silent Skeletons**. The loading state is still visual-only skeleton blocks with no descriptive copy.
- `9.2` `VERIFIED` `P4` **MCP Pending Label Is Generic**. The active in-row pending string is still `Updating...`.
- `9.4` `VERIFIED` `P4` **Teaching Workspace Loading Copy Is Static**. The live fallback is still `Preparing lesson workspace...` with no progress signal.

## 6. Secondary Pass Claims

- `11.1` / `16.1` `DEAD_CODE` `n/a` **Unused Sidebar Settings/Help Buttons Lack Handlers**. The buttons do exist in `packages/web/src/components/layout/sidebar-project.tsx`, but that component is only used by `sidebar-shell.tsx`, and `sidebar-shell.tsx` is not imported by any route.
- `12.1` `DEAD_CODE` `n/a` **Session ID Exposure Is In An Unused Sidebar Component**. The `session.id.slice(0, 10)` display is real in `packages/web/src/components/layout/sidebar-items.tsx`, but that component is only referenced by the unused `sidebar-workspace.tsx`.
- `12.2` / `20.1` `PARTIAL` `P4` **Project/Notebook Terminology Is Only Partly A Live Issue**. The strongest live examples are in `packages/web/src/lib/directory-picker.ts` (`Open project`, `Enter absolute project directory path`); several other cited examples are in unused sidebar components.
- `13.1` `VERIFIED` `P3` **App Theme Is Explicitly Locked To Dark Mode**. `packages/web/src/app.tsx` still uses `forcedTheme="dark"` and `enableSystem={false}`.
- `13.2` `VERIFIED` `P3` **Resize Handles Are Mouse-Only**. `packages/web/src/components/layout/resize-handle.tsx` only binds `onMouseDown` and document `mousemove` / `mouseup`.
- `15.2` `PARTIAL` `P4` **Directory Tokens Are Opaque, But The Audit Describes The URL Form Incorrectly**. The route token is base64url-style via `encodeDirectory(...)`, so it is cryptic but not the literal `/%2FUsers/...` form claimed.
- `17.1` `OUT_OF_SCOPE` `n/a` **Production Console Logging Is Real But Not A UI/UX Issue**. The `console.info` / `console.warn` calls in `packages/web/src/state/chat-sync.ts` are present, but this is technical debt rather than interface polish.
- `18.1` `REJECTED` `n/a` **Teaching Mode Does Have A Live UI Entry Point**. The chat route exposes an `Editor` button and a `Start Interactive Lesson` action in the right sidebar.
- `19.1` `REJECTED` `n/a` **Hardcoded Markdown Dark Theme Matches Today’s Forced-Dark App Shell**. `github-dark` is hardcoded in `packages/web/src/lib/markdown-parser.ts`, but it is consistent with the current forced-dark app configuration.
- `21.1` `OUT_OF_SCOPE` `n/a` **Vendored SDK Naming Is Architecture Debt, Not UI/UX**. The `@opencode-ai/sdk` import in `packages/web/src/lib/opencode-client.ts` is real, but it should not be tracked as a UI polish issue.

## Verification Outcome

Use the tags above as the source of truth for follow-up work:

- Treat `VERIFIED` and `PARTIAL` entries as the current live backlog.
- Drop `REJECTED`, `DEAD_CODE`, `DUPLICATE`, and `OUT_OF_SCOPE` entries from any implementation plan unless the scope changes.

---

# Proposed Fixes (March 3, 2026)

Concrete code-level fixes for every `VERIFIED` and `PARTIAL` issue from the verification pass above.

---

## 1. Terminology & Empty States

### Fix for 1.1 — Raw "MCP" Acronym In Primary Chat Header

**File:** `packages/web/src/routes/$directory.chat.tsx`  
**Lines:** 1541–1552

Replace the MCP button label and tooltip with user-friendly "Tools" terminology. Keep MCP as a subtitle inside the dialog itself.

```diff
 <Button
   variant={hasMcpError ? "secondary" : "ghost"}
   size="sm"
   onClick={() => setMcpDialogOpen(true)}
-  title="View and toggle MCP servers"
+  title="View and toggle tool servers"
 >
   {mcpEntries.length > 0
     ? hasMcpError
-      ? `MCP error`
-      : `MCP ${connectedMcpCount}/${mcpEntries.length}`
-    : "MCP"}
+      ? `Tools error`
+      : `Tools ${connectedMcpCount}/${mcpEntries.length}`
+    : "Tools"}
 </Button>
```

### Fix for 1.2 — Inconsistent Action Verbs (PARTIAL)

No single diff — this is a cross-file copy audit. Standardize to:

| Verb                 | Usage                                                 |
| -------------------- | ----------------------------------------------------- |
| **Add**              | creating a new item (e.g. "Add tool", "New skill")    |
| **Connect**          | linking an external service (e.g. "Connect provider") |
| **Enable / Disable** | toggling on/off state                                 |

Key spots to update:

- `mcp-dialog.tsx:514,628` — keep "Add MCP" but rename to **"Add tool"**
- `mcp-dialog.tsx:501` — dialog title "MCPs" → **"Tools"**
- `settings-modal.tsx:409` — "Use for models" → **"Set as default"** (see 1.4 fix below)
- `settings-modal.tsx:441` — "Connect provider" is already correct

### Fix for 1.3 — Skills Permission Trigger Uses a Vague "Policy" Label

**File:** `packages/web/src/components/skills/skills-page.tsx`  
**Lines:** 138–140

```diff
 <Button type="button" variant="outline" size="sm" disabled={props.disabled}>
-  Policy
+  Permissions
 </Button>
```

### Fix for 1.4 — "Use for models" Is Ambiguous (PARTIAL)

**File:** `packages/web/src/components/settings-modal.tsx`  
**Line:** 409

```diff
-  Use for models
+  Set as default
```

### Fix for 2.1 — Goals Inspector Empty State Is Terse

**File:** `packages/web/src/components/layout/chat-right-sidebar.tsx`  
**Line:** 159

```diff
-<p className="text-sm text-muted-foreground">No goals found for this notebook yet.</p>
+<div className="space-y-1">
+  <p className="text-sm text-muted-foreground">No learning goals set yet.</p>
+  <p className="text-xs text-muted-foreground/70">
+    Goals help Buddy track your progress. Ask Buddy to create a study plan to get started.
+  </p>
+</div>
```

### Fix for 2.2 — Curriculum Empty State Is Terse

**File:** `packages/web/src/components/layout/chat-right-sidebar.tsx`  
**Line:** 194

```diff
-<p className="text-sm text-muted-foreground">No curriculum found for this notebook yet.</p>
+<div className="space-y-1">
+  <p className="text-sm text-muted-foreground">No curriculum created yet.</p>
+  <p className="text-xs text-muted-foreground/70">
+    A curriculum guides your learning path. Ask Buddy to create one for this notebook.
+  </p>
+</div>
```

### Fix for 2.3 — Skills Library Empty State Lacks Guidance (PARTIAL)

**File:** `packages/web/src/components/skills/skills-page.tsx`  
**Lines:** 573–577

```diff
 <Card className="border-dashed border-border/60 bg-card/30">
   <CardContent className="p-6 text-sm text-muted-foreground">
-    No library skills matched your search.
+    No library skills matched your search. Try a different keyword, or create a custom skill above.
   </CardContent>
 </Card>
```

### Fix for 2.4 — Notebook Chat Loading Copy Is Generic (PARTIAL)

**File:** `packages/web/src/routes/$directory.chat.tsx`  
**Line:** 1617

```diff
-<p className="text-sm text-muted-foreground">Loading notebook chat...</p>
+<p className="text-sm text-muted-foreground">Loading conversation history…</p>
```

---

## 2. Error Handling & Validation

### Fix for 3.1 — MCP Dialog Surfaces Raw Backend/Error Strings

**File:** `packages/web/src/components/mcp-dialog.tsx`  
**Lines:** 410–413, 460–461, 489–490, 593–594

Add a small helper at the top of the file that maps known error patterns to friendly messages, then use it in place of `stringifyError(...)`:

```tsx
// Add near the top, after imports
function friendlyMcpError(raw: unknown): string {
  const message = stringifyError(raw).toLowerCase()
  if (message.includes("econnrefused") || message.includes("fetch failed"))
    return "Could not connect to the tool server. Check the URL and try again."
  if (message.includes("401") || message.includes("403") || message.includes("unauthorized"))
    return "Authentication failed. Please verify your credentials."
  if (message.includes("timeout") || message.includes("timed out"))
    return "Connection timed out. The server may be busy — try again later."
  if (message.includes("enotfound") || message.includes("dns")) return "Server address not found. Please check the URL."
  // Fallback: keep the original but prefix a user-friendly intro
  return `Something went wrong: ${stringifyError(raw)}`
}
```

Then replace all five `setError(stringifyError(...))` / `setEditorError(stringifyError(...))` call sites with the helper:

```diff
-setError(stringifyError(statusResult.reason))
+setError(friendlyMcpError(statusResult.reason))
```

(Apply the same pattern at lines 413, 461, 490, and 594.)

### Fix for 3.2 — Settings Footer Shows Raw Settings Error Text

**File:** `packages/web/src/components/settings-modal.tsx`  
**Lines:** 164–170

Wrap the error through a friendly mapper before rendering:

```diff
 const footerHint = (() => {
   if (settings.status.loading) return "Loading settings..."
   if (settings.status.saving) return "Saving changes..."
-  if (settings.status.error) return settings.status.error
+  if (settings.status.error) return "Something went wrong while loading settings. Try closing and reopening."
   if (activeTab === "providers") return "Connections are shared by the notebook runtime."
   return "Changes apply to this notebook only."
 })()
```

### Fix for 3.3 — Teaching Editor Displays Raw Save Errors

**File:** `packages/web/src/components/teaching/teaching-editor-panel.tsx`  
**Lines:** 306–309

```diff
 {props.workspace.saveError ? (
   <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
-    {props.workspace.saveError}
+    Could not save changes to the lesson file. Please try again.
   </div>
 ) : null}
```

### Fix for 3.4 — MCP Validation Copy Remains Developer-Oriented (PARTIAL)

**File:** `packages/web/src/components/mcp-dialog.tsx`

Update the `parseOptionalStringMap` helper (lines 203–226) and the validation messages:

```diff
-  error: `${label} must be a JSON object with string values.`,
+  error: `${label} needs to be in JSON format, e.g. { "KEY": "value" }. Each value must be a text string.`,

-  error: `${label} must be valid JSON.`,
+  error: `${label} is not valid JSON. Check for missing commas or quotes.`,

-  error: "Name is required.",
+  error: "Please enter a name for this tool server.",

-  error: "Timeout must be a positive integer.",
+  error: "Timeout must be a whole number greater than zero (e.g. 30).",
```

### Fix for 8.1 — Submit-Time Validation (PARTIAL)

Low priority. No code change needed right now — the create-skill dialog already validates inline. The MCP dialog could benefit from adding `onChange` validation with debounce in a future pass.

### Fix for 8.2 — Validation Errors Are Minimal and Generic

Covered by 3.4 above — the same validation strings are the ones updated.

### Fix for 14.1 — Skills Route Swallows Action Errors Without UI Feedback

**File:** `packages/web/src/routes/skills.tsx`  
**Lines:** 75, 89, 104, 130, 147

Import `toast` from `@buddy/ui` and surface errors in catch blocks:

```diff
+import { toast } from "@buddy/ui"

// Example for onOpenDirectory (line 75):
-  } catch {
-    // project actions manage their own error state
-  }
+  } catch (err) {
+    toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.")
+  }
```

Apply the same pattern to all five catch blocks (lines 75, 89, 104, 130, 147).

---

## 3. Accessibility

### Fix for 4.1 — Thread Status Still Relies Heavily On Color (PARTIAL)

**File:** `packages/web/src/components/layout/chat-left-sidebar.tsx`  
**Lines:** 396–401

Add semantic shape/icon differences alongside color to meet WCAG 1.4.1. For example, busy gets a pulse animation, unread gets a slightly larger dot, idle stays as-is:

```diff
 <span
-  className={`inline-block size-1.5 shrink-0 rounded-full ${
-    busy ? "bg-amber-500" : unread ? "bg-sky-500" : "bg-emerald-500"
+  className={`inline-block shrink-0 rounded-full ${
+    busy
+      ? "size-1.5 bg-amber-500 animate-pulse"
+      : unread
+        ? "size-2 bg-sky-500"
+        : "size-1.5 bg-emerald-500/60"
   }`}
+  role="status"
+  aria-label={busy ? "Generating" : unread ? "Unread messages" : "Idle"}
 />
```

This introduces three distinguishing cues beyond color: **size** (unread is larger), **animation** (busy pulses), and **opacity** (idle is dimmer).

### Fix for 4.2 — Add Notebook Control Is Icon-Only (PARTIAL)

Already has a zero-delay tooltip. No additional change needed; the tooltip is sufficient.

### Fix for 4.3 — Hardcoded Sidebar Hex Colors (PARTIAL)

**File:** `packages/web/src/components/layout/chat-left-sidebar.tsx`

Replace hardcoded hex values with semantic tokens. Since the app is dark-only today, these are equivalent but will survive a future theme change:

```diff
-bg-[#0b0b0d]
+bg-background

-hover:bg-[#151821]
+hover:bg-muted/30

-hover:bg-[#1a1d24]
+hover:bg-muted/40

-bg-[#111318]
+bg-muted/15

-bg-[#121419]
+bg-muted/20

-bg-[#101217]
+hover:bg-muted/15
```

### Fix for 4.6 — Field Errors Are Not Programmatically Associated (PARTIAL)

**File:** `packages/web/src/components/mcp-dialog.tsx`

The editor error is currently displayed as a standalone `<p>` at the bottom of the form. Wire it to the first relevant field using `aria-describedby`:

```diff
 {editorError ? (
-  <p className="text-sm text-destructive">{editorError}</p>
+  <p id="mcp-editor-error" role="alert" className="text-sm text-destructive">{editorError}</p>
 ) : null}
```

And on the Name input (line 667–678), add:

```diff
 <Input
   id="mcp-name"
+  aria-invalid={!!editorError}
+  aria-describedby={editorError ? "mcp-editor-error" : undefined}
   ...
 />
```

---

## 4. User Flow & Navigation

### Fix for 5.1 — Archive Action Executes Immediately With No Confirm/Undo

**File:** `packages/web/src/components/layout/chat-left-sidebar.tsx`  
**Lines:** 455–461

Replace the immediate archive call with a toast-based undo. Import `toast` from `@buddy/ui`:

```diff
+import { toast } from "@buddy/ui"

 <DropdownMenuItem
   onSelect={() => {
-    void props.onArchiveSession(group.directory, session.id)
+    const undoTimeout = setTimeout(() => {
+      void props.onArchiveSession(group.directory, session.id)
+    }, 5000)
+    toast("Thread archived", {
+      action: {
+        label: "Undo",
+        onClick: () => clearTimeout(undoTimeout),
+      },
+      duration: 5000,
+    })
   }}
 >
```

> **Note:** If the `toast` API in `@buddy/ui` doesn't support the `action` option, an alternative is to add a small confirmation dialog (similar to the rename dialog). Either approach works; the undo-toast is lower friction.

### Fix for 5.2 — Settings Are Explicit-Save Only

**File:** `packages/web/src/components/settings-modal.tsx`

Low-priority polish. Two options:

- **Option A (recommended):** No code change — explicit save is fine, but add an unsaved-changes indicator. Track whether any setting differs from the loaded state and show "Unsaved changes" next to the footer hint.
- **Option B:** Auto-save with debounce. This is more invasive and can be deferred.

No concrete diff for now — flag for a future iteration.

### Fix for 5.4 — New Session Creation Has No Pending-State Feedback

**File:** `packages/web/src/components/layout/chat-left-sidebar.tsx`  
**Line:** 362

Add a disabled/loading state to the new-thread button while the session is being created. This requires threading a `creatingSession` boolean prop from the parent, or adding local state:

```diff
+const [creatingSession, setCreatingSession] = useState<string | undefined>(undefined)

 <button
   type="button"
   className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#1a1d24] hover:text-foreground"
   aria-label={`Start new thread in ${directoryLabel}`}
+  disabled={creatingSession === group.directory}
   onClick={() => {
-    props.onNewSession(group.directory)
+    setCreatingSession(group.directory)
+    Promise.resolve(props.onNewSession(group.directory)).finally(() => setCreatingSession(undefined))
   }}
 >
-  <SquarePenIcon className="size-3.5" />
+  <SquarePenIcon className={`size-3.5 ${creatingSession === group.directory ? "animate-pulse" : ""}`} />
 </button>
```

> Requires changing `onNewSession` prop signature to return `void | Promise<void>`. If that's not desired, the parent route can set a shared loading flag instead.

### Fix for 9.3 — Mention File Search Has No Visible In-Flight State

**File:** `packages/web/src/components/prompt/prompt-composer.tsx`

In the file-search dropdown, track a `searching` boolean and display a "Searching…" placeholder while the async call is in flight. The exact implementation depends on the dropdown component used internally — the fix is:

1. Set `searching = true` when `onSearchFiles` is called.
2. Set `searching = false` in `.finally()`.
3. Show `<span className="text-xs text-muted-foreground px-3 py-2">Searching…</span>` inside the dropdown while `searching` is true.

### Fix for 10.4 — Thread Organization Trigger Does Not Reflect Current Mode

**File:** `packages/web/src/components/layout/chat-left-sidebar.tsx`  
**Lines:** 238–245

Show the current organize mode as a subtle label on the trigger button:

```diff
 <button
   type="button"
-  className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#1a1d24] hover:text-foreground"
+  className="inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground text-[11px]"
   aria-label="Organize threads"
   title="Organize threads"
 >
   <SlidersHorizontalIcon className="size-3.5" />
+  {organizeMode === "chronological" ? "Recent" : null}
 </button>
```

### Fix for 15.1 — Keyboard Shortcuts Exist Without Discovery Surface

Low priority. Recommended approach: add a small `?` icon button in the prompt footer bar that opens a popover listing shortcuts (Escape, Cmd+Enter, arrow keys, etc.). No diff — flag for a future iteration.

---

## 5. Visual Consistency & Copy

### Fix for 6.1 — Border Treatments Are Inconsistent

Low priority polish. Standardize on `border-border/60` as the default border treatment across all card and panel surfaces. A lint rule or CSS variable can enforce this long-term.

### Fix for 6.2 — Button Sizing Mixed Across Controls

Low priority. Establish a convention:

| Context                    | Size token |
| -------------------------- | ---------- |
| Primary actions in dialogs | `sm`       |
| Secondary / inline actions | `xs`       |
| Icon-only controls         | `icon-xs`  |

No code diff — document the convention and apply incrementally.

### Fix for 6.3 — Comparable List UIs Use Different Spacing

Low priority. The MCP server list and settings provider list both render similar item rows. Extract a shared `ListRow` component or apply consistent padding (`px-4 py-3` vs. `px-4 py-4`). Defer to a design-system cleanup pass.

### Fix for 7.1 — Teaching Step Labels Are Short (PARTIAL)

Already has tooltips. Consider renaming for clarity:

```diff
-  Accept Step
+  Save Checkpoint

-  Restore Step
+  Revert to Checkpoint
```

### Fix for 7.2 — "New thread" and "New chat" Both Exist

**File 1:** `packages/web/src/components/layout/chat-left-sidebar.tsx` — Line 408  
**File 2:** `packages/web/src/routes/$directory.chat.tsx` — Line 317

Standardize on **"New thread"** since that's the term used in the sidebar:

```diff
 // $directory.chat.tsx:317
-const sessionTitle = sessionFamily.current?.title ?? directoryState?.sessionTitle ?? "New chat"
+const sessionTitle = sessionFamily.current?.title ?? directoryState?.sessionTitle ?? "New thread"
```

### Fix for 9.1 — Skills Page Initial Loading Uses Silent Skeletons

**File:** `packages/web/src/components/skills/skills-page.tsx`  
**Lines:** 507–525

Add loading text above the skeleton cards:

```diff
 {loading ? (
-  <div className="grid gap-4 lg:grid-cols-2">
+  <div className="space-y-3">
+    <p className="text-sm text-muted-foreground">Loading your skills…</p>
+    <div className="grid gap-4 lg:grid-cols-2">
     {Array.from({ length: 4 }).map((_, index) => (
       ...skeleton cards...
     ))}
+    </div>
   </div>
```

### Fix for 9.2 — MCP Pending Label Is Generic "Updating..."

**File:** `packages/web/src/components/mcp-dialog.tsx`  
**Line:** 557

Make the label reflect the action being performed:

```diff
 {isPending ? (
-  <span className="text-xs text-muted-foreground">Updating...</span>
+  <span className="text-xs text-muted-foreground">
+    {statusByName[name]?.status === "connected" ? "Disconnecting…" : "Connecting…"}
+  </span>
 ) : null}
```

### Fix for 9.4 — Teaching Workspace Loading Copy Is Static

**File:** `packages/web/src/routes/$directory.chat.tsx`  
**Lines:** 1745–1747

Add an animated indicator:

```diff
 <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-sm text-muted-foreground">
-  Preparing lesson workspace...
+  <span className="animate-pulse">Preparing lesson workspace…</span>
 </section>
```

---

## 6. Secondary Pass Claims

### Fix for 12.2 / 20.1 — "Open project" Terminology in Live Code (PARTIAL)

**File:** `packages/web/src/lib/directory-picker.ts`  
**Lines:** 37, 58

```diff
-  title: "Open project",
+  title: "Open notebook",
```

(Apply at both line 37 and line 58.)
