---
name: tanstack-react-virtual
description: Implement and review long-list virtualization in packages/web using @tanstack/react-virtual with stable keys, correct scroll parent wiring, and predictable behavior during streaming updates.
---

# TanStack React Virtual for Buddy

Use this skill when adding or reviewing virtualization in `packages/web`.

## Scope

- Virtualize only vertical list containers with a clear scroll parent.
- Keep existing interaction semantics unchanged (selection, menus, toggles, keyboard flow).
- Preserve chat streaming scroll behavior managed by controller state.

## Canonical Pattern

Use `useVirtualizer` with:

- `count`
- `getScrollElement`
- `getItemKey`
- `estimateSize`
- `overscan`

Render:

- one container with `height: virtualizer.getTotalSize()` and `position: relative`
- absolutely positioned row wrappers using `transform: translateY(...)`

For variable row heights:

- add `data-index={virtualRow.index}`
- set `ref={virtualizer.measureElement}`
- estimate toward a realistic upper bound

## Buddy-Specific Rules

- For `ScrollArea`, use the existing `viewportRef` as the virtualizer scroll element.
- Never key rows by index; use domain keys (session ID, artifact ID, resource ID, etc.).
- Do not add nested scroll parents unless the feature already uses one.
- Keep expensive list transforms outside row render functions.
- Keep `vendor/**` untouched.

## Failure Modes To Check

- Scroll jumps when new rows stream in.
- Row overlap or clipping from wrong sizing assumptions.
- Hidden interaction regressions (menu triggers, toggle controls, row click handlers).
- Missing last-row spacing previously provided by layout gap classes.

## References

- https://tanstack.com/virtual/latest/docs/framework/react/react-virtual
- https://tanstack.com/virtual/latest/docs/api/virtualizer
