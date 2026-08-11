# Known issue · a state painted in the hover colour

**Status:** fixed in `Toggle` / `ToggleGroupItem`. **Not audited elsewhere.**

**Class of bug:** a component tracks a state correctly and paints it in a colour
that carries no information, so the state is invisible to the person using it.

This file exists because the instance we found is almost certainly not the only
one. It came in with an upstream shadcn class string, and we vendored the whole
shadcn set from one commit — so any component whose selected/active/pressed
state shares a token with its hover state has the same defect for the same
reason.

---

## 1 · The instance we found

`packages/ui/src/components/ui/toggle.tsx`, in `toggleVariants`:

```
hover:bg-surface-weak
aria-pressed:bg-surface-weak
data-[state=on]:bg-surface-weak
```

Three states, one token, and nothing else distinguishing them — same text
colour, same weight, same border. A selected segment and a segment the pointer
happens to be over are the same pixels.

It is worse than "subtle", for two compounding reasons:

1. **You cannot see the collision by hovering.** To hover the selected item you
   have to stop looking at the unselected one, so the two states are never on
   screen at once for comparison. This is why it survived review.
2. **`surface-weak` is close to `surface-raised-stronger-non-alpha`** in dark
   mode — and that is the fill of every popover these controls live in. So in
   the place the component is used most, the selected item barely separates from
   its own container either.

Reproduced side by side, before and after, in the `segmented-active-state`
easel (DevTools → Easel).

### Provenance

Not a Buddy regression. `git diff 22c907d327 -- packages/ui/src/components/ui/toggle.tsx`
shows the only substantive change Buddy ever made to that file is the token
rename — `muted → surface-weak`, `ring → border-interactive-base`. The upstream
string already read `hover:bg-muted` … `data-[state=on]:bg-muted`.

That matters for how it gets fixed. There is no earlier revision to revert to
and no upstream fix to wait for. Per `packages/ui/AGENTS.md`, shadcn is the
foundation and the Buddy token layer is the theme, so the override belongs in
our copy of the component.

### The fix

```diff
- aria-pressed:bg-surface-weak
- data-[state=on]:bg-surface-weak
+ aria-pressed:bg-surface-raised-strong
+ aria-pressed:text-text-strong
+ data-[state=on]:bg-surface-raised-strong
+ data-[state=on]:text-text-strong
+ data-[state=on]:hover:bg-surface-raised-strong
  hover:bg-surface-weak
```

Three parts, all load-bearing:

- **A distinct fill.** One step further up the raised ramp than hover, so the
  two separate at any surface depth.
- **A text-colour signal.** Colour alone is fragile across five reader themes
  and two app modes; a second channel is not.
- **An explicit `data-[state=on]:hover:`.** An attribute selector and `:hover`
  have equal specificity, so source order decides which wins. Without this
  companion, hovering a selected item hands it back to the hover colour — the
  bug, reintroduced in the one case anyone tests by hand.

---

## 2 · Why this needs an audit, not just a patch

The same failure has already been seen once in this codebase in a different
form. `command.tsx` shipped `data-selected:*` classes that compiled to
`[data-state="selected"]` — a selector cmdk never writes — so the active row
never lit up either. See the `command-selection-tokens` easel.

Two different mechanisms, one symptom:

| Mechanism | Example | Selection works? | Selection visible? |
| --- | --- | --- | --- |
| Selector cannot match | `command.tsx` `data-selected:*` | yes | no |
| Selector matches, resolves to hover | `toggle.tsx` `data-[state=on]:bg-surface-weak` | yes | no |

Both are invisible to unit tests and to type checking, because in both cases the
component's behaviour is correct. Only looking at it catches them — and only if
you look at the selected and unselected items **at the same time**.

## 3 · What an audit should check

For every component in `packages/ui/src/components/ui` that has a selected,
active, checked, pressed or open state:

1. **Does the state token differ from the hover token?** Grep for a component
   whose `hover:bg-*` and `data-[state=*]:bg-*` name the same token.
2. **Is there a second signal?** Fill alone is not enough on a surface whose
   own fill is nearby. Text colour, weight, or a border edge should carry it too.
3. **Does the state survive hover?** Any `data-[state=…]:bg-*` that has to beat
   a `hover:bg-*` needs the explicit `data-[state=…]:hover:` companion, because
   the two have equal specificity.
4. **Does it hold on a raised surface?** Test inside a popover on
   `surface-raised-stronger-non-alpha`, not only on `background-base`. Most of
   these components spend their life inside a popover, and the page background
   is the forgiving case.
5. **Does the selector match the attribute the library actually writes?** The
   `command.tsx` variety. Check the rendered DOM, not the class list.

Starting points, all state-bearing and all vendored from the same commit:
`tabs.tsx`, `select.tsx`, `dropdown-menu.tsx`, `menubar.tsx`,
`navigation-menu.tsx`, `radio-group.tsx`, `checkbox.tsx`, `switch.tsx`,
`accordion.tsx`, `sidebar.tsx`.

## 4 · Consumers affected by the toggle fix

`foliate-preferences-panel.tsx`, `pdf-reader.tsx`, `reader-preferences-panel.tsx`,
`reader-annotation-dialog.tsx`, and every easel using a `ToggleGroup`. That
breadth is the argument for fixing the variant rather than one panel — and the
argument for a neutral on-state over an accented one, since a panel with five
selected segments should not turn into a colour field.

Note that `packages/ui/src/index.ts` exports only `ToggleGroup` and
`ToggleGroupItem`; bare `Toggle` is not reachable from the app, so
`ToggleGroupItem` is the single consumer surface for this variant.
