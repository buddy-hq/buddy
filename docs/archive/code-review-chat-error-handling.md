# Code Review: Chat Error Handling Changes

## Overview

This review covers the error handling enhancements made to the chat components in the Buddy project.

## Files Modified

1. `packages/web/src/components/chat/chat-transcript.tsx`
2. `packages/web/src/components/chat/parts/abstracted-tool-group.tsx`
3. `packages/web/src/components/chat/parts/assistant-error-card.tsx` (new)
4. `packages/web/src/components/chat/shared/utils.ts` (new functions)
5. `AGENTS.md` (added skill mappings)

## 🔴 High Priority Issues

### 1. Missing Accessibility Attributes
**File**: `assistant-error-card.tsx`
```tsx
<div className="mt-3 w-full rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3">
```
- Missing `role="alert"` for screen readers
- CopyAction needs `aria-label`

### 2. Logic Issue with `showErrorPreview`
**File**: `abstracted-tool-group.tsx`
```tsx
const previewEntry = activeEntry ?? (isBusy ? lastActiveEntryRef.current : lastErrorEntry)
const isWorking = Boolean(activeEntry || (isBusy && previewEntry))
const showErrorPreview = !isWorking && Boolean(lastErrorEntry) && !collapsePreview
```
**Problem**: When `isBusy=true` and there's no active entry but `lastActiveEntryRef.current` exists, the error preview may never show.

**Suggestion**:
```tsx
const showErrorPreview = Boolean(lastErrorEntry) && !isWorking && !collapsePreview
```

### 3. Potential Type Safety Issue
**File**: `shared/utils.ts`
```tsx
export function isMessageAbortError(value: unknown): boolean {
  return isRecord(value) && value.name === "MessageAbortedError"
}
```
**Issue**: Not checking if `value.name` is a string explicitly.

**Suggestion**:
```tsx
export function isMessageAbortError(value: unknown): boolean {
  return isRecord(value) && typeof value.name === "string" && value.name === "MessageAbortedError"
}
```

## 🟡 Medium Priority Issues

### 4a. Hardcoded Absolute `node_modules/.bun/...` Paths in AGENTS.md
**File**: `AGENTS.md`
```
load: "/Users/prashantbhudwal/Code/buddy/node_modules/.bun/@tanstack+router-core@1.168.6/..."
```
**Issue**: The skill mappings use machine-specific absolute paths resolved inside bun's lockfile structure. These break for any other developer, CI environment, or after a `bun install` that resolves to a different version. The `<!-- intent-skills:start/end -->` markers suggest these are auto-generated — the generator should produce portable paths (relative from workspace root or resolved dynamically at runtime).

### 4. Unnecessary Iteration in `abstracted-tool-group.tsx`
```tsx
const lastErrorEntry = useMemo(() => entries.findLast((entry) => entryHasError(entry)), [entries])
const errorCount = useMemo(
  () => entries.filter((entry) => entryHasError(entry)).length,
  [entries],
)
```
**Suggestion**: Combine into single computation:
```tsx
const errorData = useMemo(() => {
  const errors = entries.filter((entry) => entryHasError(entry))
  return {
    lastErrorEntry: errors.at(-1),
    errorCount: errors.length,
  }
}, [entries])
```

### 5. Potential XSS Vulnerability
**File**: `assistant-error-card.tsx`
```tsx
<div className="mt-2 whitespace-pre-wrap break-words text-sm text-icon-critical-base">
  {text}
</div>
```
**Issue**: Direct render of error text could be XSS if error messages contain malicious content.

**Suggestion**: Consider sanitization or use `String(text)`:
```tsx
{String(text)}
```

### 6. `assistantErrorName` Should be Memoized
**File**: `chat-transcript.tsx`
```tsx
const assistantErrorName =
  assistantError &&
  typeof assistantError.name === "string" &&
  assistantError.name !== "UnknownError"
    ? assistantError.name
    : undefined
```
**Issue**: Computed on every render.

**Suggestion**:
```tsx
const assistantErrorName = useMemo(() => {
  if (
    !assistantError ||
    typeof assistantError.name !== "string" ||
    assistantError.name === "UnknownError"
  ) {
    return undefined
  }
  return assistantError.name
}, [assistantError])
```

### 7. Inconsistent Use of `findLast`
**File**: `chat-transcript.tsx`
```tsx
.map((message) => (message.info.role === "assistant" ? message.info.error : undefined))
.findLast((error) => !!error && !isMessageAbortError(error))
```
**Suggestion**: Use `filter()` and `map()` together:
```tsx
assistantMessages
  .filter((message) => message.info.role === "assistant")
  .map((message) => message.info.error)
  .findLast((error) => !!error && !isMessageAbortError(error))
```

## 🟢 Minor / Nitpicks

### 8. Magic String "UnknownError"
**File**: `chat-transcript.tsx`
Hardcoded string should be a constant:
```tsx
const UNKNOWN_ERROR_NAME = "UnknownError" as const
```

### 9. `entryErrorText` Fallback Might Be Misleading
**File**: `abstracted-tool-group.tsx`
```tsx
return entry.info?.summary || entry.info?.subtitle
```
If error text is empty, showing summary/subtitle as the error preview could be confusing.

### 10. `entryErrorText` Can Return `undefined` for Known-Error Entries
**File**: `abstracted-tool-group.tsx`
```tsx
function entryErrorText(entry: AbstractedEntry): string | undefined {
  if (!entryHasError(entry)) return undefined
  const errorText = stripAnsi(String(entry.state?.error ?? "")).trim()
  if (errorText) return errorText
  const outputText = stripAnsi(String(entry.state?.output ?? "")).trim()
  if (outputText) return outputText
  return entry.info?.summary || entry.info?.subtitle
}
```
**Issue**: When `entryHasError` returns `true` but `state.error`, `state.output`, `info.summary`, and `info.subtitle` are all falsy, this returns `undefined`. `buildPreview` then falls through to the normal (non-error) output path, losing the error context entirely. The preview will show normal output for an entry that is known to have errored.

### 11. Error Preview Hidden When Abstracted Group Is Collapsed by Parent
**File**: `abstracted-tool-group.tsx`, `chat-transcript.tsx`
```tsx
const showErrorPreview = !isWorking && Boolean(lastErrorEntry) && !collapsePreview
```
**Issue**: `collapsePreview` is set in `chat-transcript.tsx` when the abstracted group "has followup" parts after it. This means tool-level errors in a collapsed group are invisible to the user — the error preview won't show, and the group renders as a normal collapsed step. The turn-level `AssistantErrorCard` covers assistant-message-level errors, but individual tool errors within a collapsed abstracted group can go unnoticed.

## 🚨 Important: Dependency Upgrade

The TanStack Router upgrade from v1.0 to v1.168 is significant. Ensure you:
1. Review the TanStack Router changelog for breaking changes
2. Test all routing functionality thoroughly
3. Check for deprecated API usage

## ✅ Positive Notes

- Clean separation of concerns with new utility functions
- Good use of `memo` for performance optimization
- Consistent color scheme using existing design tokens
- Smart use of `useThrottledText` for performance
- Proper type definitions on interfaces

## Recommendations

1. Fix accessibility issues first
2. Address the showErrorPreview logic issue
3. Add type safety improvements
4. Consider the XSS mitigation
5. Test thoroughly after the dependency upgrade