# Review Known Issues

## Status And Scope

This file tracks open issues identified while reviewing uncommitted changes. The issues are
documented here for later follow-up and are not fixed by the reviews that recorded them.

| ID | Item | Priority | Status |
| --- | --- | --- | --- |
| ONB-001 | Directory display infers the user's home from path shape | P2 | Open, blocking |
| ONB-002 | Directory display drops absolute and UNC root markers | P2 | Open, blocking |
| ONB-003 | ChatGPT choice arrow uses an unbounded, ungated hover transition | P3 | Open |
| CHAT-002 | Usage-limit fallback copy promises resets for non-resetting failures | P2 | Open, deferred |
| CHAT-003 | Terminal Stop actions leave the error card unchanged | P2 | Open, deferred |

## ONB-001: Directory Display Infers Home From Path Shape

### Current behavior

`describeDirectory()` treats every `/Users/<name>`, `/home/<name>`, and
`C:/Users/<name>` prefix as the active OS user's home directory. It therefore produces the
following misleading displays:

```text
/Users/Shared/Buddy    -> ~/Buddy
C:/Users/Public/Buddy  -> ~/Buddy
```

### User-visible impact

The onboarding location step can claim that a shared or public directory is private home storage.
The complete path remains in a tooltip, but the primary path label still misstates where Buddy will
store the user's data.

### Follow-up

Pass the actual normalized OS home directory into the formatter and replace it with `~` only after
an exact path-boundary match. Add regression coverage for macOS Shared, Windows Public, and paths
belonging to another user.

## ONB-002: Directory Display Drops Absolute And UNC Roots

### Current behavior

`pathSegments()` removes leading separators, and the non-home fallback in `describeDirectory()`
does not restore them. For example:

```text
/opt/buddy            -> opt/buddy
//server/share/Buddy  -> server/share/Buddy
```

The current outside-home test codifies the rootless `/opt/buddy` result.

### User-visible impact

An absolute POSIX path appears relative, while a Windows UNC path appears local instead of showing
that it points to a network share. Buddy supports both macOS and Windows, so both root forms must be
preserved.

### Follow-up

Parse and retain the path root separately from its segments, carry the POSIX, drive, or UNC prefix
through elision, and update the outside-home expectation. Add explicit UNC coverage.

## ONB-003: ChatGPT Choice Arrow Uses An Unbounded Hover Transition

### Current behavior

The newly added outward arrow in `EngineScreen` uses `transition-all` and an ungated
`group-hover` translation.

### Impact

`transition-all` can begin animating unrelated properties as the component evolves. The translation
can also latch as a hover state on touch-capable Windows devices because it is not restricted to a
fine pointer.

### Follow-up

Transition only `transform`, `opacity`, and `color`. Gate the translation behind
`@media (hover: hover) and (pointer: fine)`, or remove the translation and retain only the opacity
and color feedback.

## CHAT-002: Usage-Limit Fallback Copy Promises Resets For Non-Resetting Failures

### Current behavior

The fallback from `usageLimitDetail()` is used by every `usage-limit` classification, including
payment-required responses, insufficient balances, missing payment methods, and OpenCode Zen credit
errors. When those errors contain no reset metadata, the card still tells the user to wait for a
reset.

### User-visible impact

Some account and billing failures do not reset automatically. The current copy can therefore send
users toward a recovery path that will never resolve the error.

### Follow-up

Mention waiting only when the provider supplied a valid reset time. For usage limits without reset
metadata, direct the user to provider billing or settings, or suggest selecting another available
model.

Affected code:

- `packages/web/src/components/chat/assistant-error-card.tsx`
- `packages/web/src/state/chat-error-model.ts`

## CHAT-003: Terminal Stop Actions Leave The Error Card Unchanged

### Current behavior

Several terminal assistant-error cards expose a **Stop** action. The handler aborts the active
session run, but a terminal error normally represents a run that has already settled. Aborting the
idle session does not dismiss or replace the persisted assistant error, so the same card remains
visible after the action completes.

### User-visible impact

The button appears actionable but commonly produces no visible change. This is especially confusing
on authentication, model-availability, access-restriction, and exhausted-retry errors where the
user expects the action to advance or clear the failure state.

### Follow-up

Keep **Stop** on live retry notices. Terminal cards should instead expose an action that changes the
terminal state, such as dismissing the card, opening the model selector, or starting an explicit
recovery flow.

Affected code:

- `packages/web/src/components/chat/assistant-error-card.tsx`
- `packages/web/src/components/directory-chat/directory-chat-main-pane.tsx`

## Verification Notes

- `bun lint` passed with existing warnings.
- Root `bun typecheck` passed.
- The directory-display and permission-dock path tests passed: 9 passed, 0 failed.
- The focused onboarding run produced 46 passes and one failure in the untouched legacy
  `OnboardingSetup` copy assertion. That failure was not attributed to the reviewed changes.
