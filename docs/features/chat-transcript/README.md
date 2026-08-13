# Chat transcript

Everything about the chat transcript lives in this folder. Each document owns one
subject; where two subjects touch, one of them is authoritative and the other
links to it rather than restating it.

| Document | Owns | Read it when |
| --- | --- | --- |
| [design.md](./design.md) | Architecture: data flow, state ownership, row projection, Markdown, inline artifacts | You need to know how a message becomes a row |
| [scroll-and-virtualization.md](./scroll-and-virtualization.md) | **Authoritative** on scroll ownership, attachment, virtualizer config, measurement, and geometry reservation | Anything moves when it should not |
| [chat-switch-flicker.md](./chat-switch-flicker.md) | The view-transition system for switching chats and workspaces | Flicker happens *between* chats, not within a turn |
| [dead-zone.md](./dead-zone.md) | Activity-row working labels and their timing | You are about to change a dead-zone constant |
| [invariants.md](./invariants.md) | The contracts every change must preserve | Before and after any change here |
| [history.md](./history.md) | What broke, what was diagnosed, what was resolved | Before re-deriving a conclusion that already has evidence |
| [hypothesis.md](./hypothesis.md) | Work currently in flight, with predictions and falsification criteria | You are picking up an unfinished thread |

## Ownership boundaries

These four subjects overlap and have been mixed up before. The split is:

- **Scroll ownership** — `scroll-and-virtualization.md` only. `design.md` and
  `chat-switch-flicker.md` link to it. An earlier version of
  `chat-switch-flicker.md` claimed Buddy repairs the bottom after every attached
  size change; it does not, and that contradiction is what this consolidation
  removed.
- **Dead-zone timing values** — `dead-zone.md` only. Other documents refer to the
  constants by name.
- **Markdown projection** — `design.md` for the current shape, `history.md` for
  what was tried and what remains open.
- **Chat-switch visibility** — `chat-switch-flicker.md`. It is about the boundary
  at which a destination becomes visible, not about scrolling.

## Rules for editing these documents

1. **Code wins.** If a document disagrees with the implementation, the document
   is wrong until proven otherwise. Fix the document in the same change.
2. **Do not restate another document's subject.** Link instead. Two copies of a
   rule become two different rules.
3. **Record evidence, not conclusions alone.** A trace excerpt, a measurement, or
   a test name is what makes a claim re-checkable later.
4. **Do not delete a rejected approach.** The rejections in
   `scroll-and-virtualization.md` and `chat-switch-flicker.md` exist because each
   one was tried and made something worse.

## Verification

Docs-only edits need no typecheck. Code changes here need the affected
`packages/web` tests, then root `bun lint` and root `bun typecheck`.
