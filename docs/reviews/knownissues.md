# Review Known Issues

## Status And Scope

This file tracks open issues identified while reviewing the uncommitted onboarding and directory
display changes on 2026-08-02. The issues are documented here and are not fixed by this review.

| ID | Item | Priority | Status |
| --- | --- | --- | --- |
| ONB-001 | Directory display infers the user's home from path shape | P2 | Open, blocking |
| ONB-002 | Directory display drops absolute and UNC root markers | P2 | Open, blocking |
| ONB-003 | ChatGPT choice arrow uses an unbounded, ungated hover transition | P3 | Open |

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

## Verification Notes

- `bun lint` passed with existing warnings.
- Root `bun typecheck` passed.
- The directory-display and permission-dock path tests passed: 9 passed, 0 failed.
- The focused onboarding run produced 46 passes and one failure in the untouched legacy
  `OnboardingSetup` copy assertion. That failure was not attributed to the reviewed changes.
