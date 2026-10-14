# Handoff: Markdown save fidelity — 2026-10-02

Written by the Opus fidelity agent when it was stopped at a checkpoint. That agent cannot be resumed; this file is everything that survives. Treat the plans below as reasoning to verify, not as tested fact.

Two of six items are fixed and tested. The other four reproduce through the real editor but have no code, only the design below.

## Files created or changed

- `packages/web/src/components/bench/markdown/plugins/list-fidelity.ts` (new): `buddyListFidelityPlugin`, with import and export visitors at priority 1 for ordered list start and for plain items in task lists.
- `packages/web/src/components/bench/markdown/use-editor-plugins.ts`: one import line and one registration line, `buddyListFidelityPlugin()` directly after `listsPlugin()`.
- `packages/web/test/markdown-bench-editor-fidelity.test.tsx` (new): 13 cases, items 1 and 3 only.

## Per item

| # | Item | State | Covering tests (describe block) |
|---|---|---|---|
| 1 | Ordered list start | Done for top-level lists; nested lists deliberately unchanged | "ordered list start numbers" (8 cases) |
| 2 | Hard breaks | Not started | none |
| 3 | Plain item in task list | Done on disk; editor still draws a checkbox | "plain items in task lists" (5 cases) |
| 4 | `#tag` at line start | Not started | none |
| 5 | Custom task statuses | Not started | none |
| 6 | Footnotes | Not started | none |

### Item 1 — done

- **Cause:** `@mdxeditor/editor` `dist/plugins/lists/MdastListVisitor.js:6` calls `$createListNode(listType)` without `mdastNode.start`. `dist/plugins/lists/LexicalListVisitor.js:5-8` exports `{ordered, spread: false}` with no `start`.
- **Fix:** the import visitor lets the library build the list, then calls `setStart` on it. The export visitor lets the library export, then sets `start` on the mdast list. Lexical renders `<ol start="5">`, so the editor shows the real numbers.
- **Before → after:**
  - `5. five\n6. six`: `1. five\n2. six` → unchanged.
  - `2024. A year`: `1. A year` → unchanged.
  - Also unchanged now: `0. zero\n1. one`, `3. three\n   - a\n   - b\n4. four`, `> 5. five\n> 6. six`.
- **Deliberate limit:** a numbered list nested inside a list item still restarts at 1 (`- item\n\n  7. seven\n  8. eight` saves as `- item\n  1. seven\n  2. eight`, same as before). MDXEditor always writes tight items, and an ordered list not starting at 1 cannot interrupt a paragraph. `4. four\n   7. seven` parses as paragraph text and saves as `7\. seven`, so honouring the start there would destroy the list on the next open. Pinned by "restarts a nested numbered list at one so it stays a list".

### Item 3 — done on disk

- **Cause:** `MdastListVisitor.js:5` makes the whole list type `check` if any item has a boolean `checked`. `MdastListItemVisitor.js:5` turns `checked: null` into `false`. `LexicalListItemVisitor.js:19` exports `Boolean(getChecked())` for every item.
- **Fix:** on import, plain items inside a check list get a Lexical NodeState mark (`buddyPlainItemInTaskList`). On export, a marked, unticked item has its mdast `checked` set to `null`.
- **Before → after:**
  - `- [ ] task\n- plain item`: `- [ ] task\n- [ ] plain item` → unchanged.
  - Nested `- [x] done\n- plain\n  - [ ] sub\n  - subplain\n- [ ] open` → unchanged.
- **Residual display issue:** the plain item still shows an unticked checkbox in the editor. Lexical's `ListItemNode` draws every leaf of a check list that way and it cannot be subclassed here (see the constraint below).

## Constraint the next agent must know

`@lexical/list` and `mdast-util-to-markdown` are not dependencies of `packages/web` and do not resolve from it (isolated install). So:

- `$isListNode`, `$createListNode`, a `ListItemNode` subclass and `defaultHandlers` are unavailable without a `package.json` change.
- `list-fidelity.ts` uses structural type guards on `getType() === "list"` / `"listitem"` instead.
- `no-runtime-typeof` rules out narrowing `exportJSON()` output.

Adding `@lexical/list` 0.35.0 and `mdast-util-to-markdown` 2.1.2 as direct dependencies would allow cleaner code and the display fix for item 3. That is optional.

## Not started: cause and intended approach

### Item 2 — hard breaks

- **Where the information is lost:**
  - `dist/plugins/core/MdastBreakVisitor.js:4-6` imports mdast `break` as a plain `LineBreakNode`.
  - `dist/plugins/core/LexicalLinebreakVisitor.js:4-6` exports every `LineBreakNode` as text `"\n"`.
  - `mdast-util-to-markdown` `lib/handle/break.js:29` only ever writes `\` + newline, so the two-space style has no serialiser.
- **Do not export all LineBreakNodes as `break`:** `MdastParagraphVisitor.js:10-12` inserts two LineBreakNodes between the paragraphs of a list item and relies on them exporting as `"\n\n"`. `- one\n\n  two\n- three` round-trips today only because of that.
- **Plan (new `plugins/hard-breaks.ts`):**
  1. **Parse:** a from-markdown extension with `enter: { hardBreakTrailing(token) { this.enter({type: "break", data: {…marker…}}, token) } }`. Extension enter handlers replace the defaults (`mdast-util-from-markdown` `lib/index.js`, `extension()` uses `Object.assign`); the default exit stays.
  2. **Import:** an import visitor for `break` at priority 1 creates the `LineBreakNode` and marks it with NodeState (`createState`, `$setState` from `lexical`) as backslash or trailing-spaces.
  3. **Export:** an export visitor at priority 1 handles only marked LineBreakNodes. It emits `{type: "break"}` for backslash and a custom mdast node for trailing spaces.
  4. **Serialise:** the custom node's to-markdown handler calls `state.handle({type: "break"}, parent, state, info)` and swaps `"\\\n"` for `"  \n"`. This keeps the library's heading and table fallback. The custom type needs the `declare module "mdast"` augmentation that `plugins/obsidian.tsx:113-121` uses.
- **Guard needed:** only emit a hard break when a non-linebreak sibling follows and its text does not start with a newline. A backslash break at the end of a block reparses as a literal backslash.
- **Cases removed from the test file (expected: unchanged):**
  - `line one  \nline two`
  - `line one\\\nline two`
  - `- one  \n  two\n- three\n\n> quoted\\\n> again`
  - `line one  \nline two\\\nline three` after appending text
  - Guards that pass today: `line one\nline two`, `- one\n\n  two\n- three`

### Items 4, 5, 6 — escapes

- **Where the escape comes from:**
  - `mdast-util-to-markdown` `lib/unsafe.js:69` (`#` at break).
  - `lib/unsafe.js:121-122` (`[` at break and in phrasing), plus Buddy's own extra `[` rule at `plugins/obsidian.tsx:302-305`.
  - `lib/unsafe.js:91` and `:133` (`*` and `_` in phrasing).
  - All applied by `lib/util/safe.js` from `lib/handle/text.js:14`.
- **Why a handler override:** extensions can only add unsafe patterns (`lib/configure.js:33-36`), never remove them. The narrow fix is to override `handlers.text` in a to-markdown extension; nothing else defines `text`.
- **Plan (new `plugins/obsidian-plain-syntax.ts`):** find protected spans in `node.value`, emit them raw, and pass the pieces between through `state.safe` with the correct `before` and `after` characters. Spans:
  - **Tags:** `#` plus the whole tag name, where the `#` is at a line start (`info.before + value` matches `[\r\n][\t ]*#`), is followed by a tag character, and the name has at least one non-digit. This can never be an ATX heading, which needs a space, tab or line end after the `#`s. The span must cover the name: `#second_line` was observed saving as `\#second\_line`.
  - **Custom statuses:** `[c]` at index 0 of the first text of the first paragraph of a list item, followed by a space or tab. `c` is one character, not whitespace, `[`, `]`, `\`, a backtick, `x` or `X`. Detect position with `state.stack.at(-1..-3)` being `phrasing`, `paragraph`, `listItem` and `state.indexStack.at(-1)` and `.at(-2)` both 0. The whole `[c]` must be raw: `[*]` was observed saving as `\[\*]`.
  - **Footnotes:** optional `!` then `[^label]`, label without whitespace, brackets or backslash, anywhere in text, skipped when `state.stack` includes `label` or `reference`. Including the `!` avoids `works![^1]` becoming `works\![^1]`.
- **Cases removed (expected: unchanged):**
  - `#project/alpha`
  - `- #todo item\n\n> #quoted tag\n\ntext #tag here\n#second_line and #third-tag`
  - `- [/] in progress\n- [-] cancelled\n- [*] starred\n- [>] forwarded`
  - `- [ ] todo\n- [/] doing\n- [x] done\n\n1. [?] question\n2. plain` (relies on item 3, which is in)
  - `Claim.[^1]\n\n[^1]: The note text.`
  - `First[^my_note] and *second*[^2].\n\n[^my_note]: The first note.\n[^2]: The second note.`
  - Guards that pass today and must keep passing:
    - `\\# not a heading\n\n\\#\n\n\\#1 is a number, not a tag`
    - `see \\[text] here\n\n\\[/] outside a list\n\n- \\[x] literal box\n- later \\[/] in the item\n- \\[/]no space`
    - `see \\[text] here and \\[^not a note] and \\[^]`

## Approaches that did not work

- **Honouring `start` on nested numbered lists:** backed out, reason under item 1.
- **Splitting a mixed list into separate Lexical lists** (which would fix the checkbox display): rejected. to-markdown switches the bullet between adjacent lists (`lib/handle/list.js:29-30,90-92`), and `MdastListVisitor.js:8-10` inserts nested wrappers in reverse order when there are several.
- **Clicking a checkbox in happy-dom:** Lexical compares `clientX` with the `::before` width, which is NaN there. The test uses `KEY_SPACE_COMMAND` on the focused item instead.

## Behaviour changes on save, and product decisions

- **Top-level numbered lists** keep their first number, and the editor displays it.
- **Plain item in a task list:** saved plain, drawn with a checkbox. Ticking it saves `- [x]`. Unticking it again saves it plain, not `- [ ]`, because the mark stays on the node. Decision needed: is that acceptable, or should the mark clear on first tick?
- **Items 4–6, if built as planned:**
  - A deliberately escaped `\#word` at line start, `\[^1]`, or `- \[/] x` will save unescaped. That is identical in CommonMark but becomes live syntax in Obsidian; the tree cannot tell the two apart.
  - A one-word footnote definition typed in rich text (`[^1]: Source`) will save unescaped. On the next open it parses as a link definition and sends the document to source mode.

## Seen outside the six items, left alone

- `Claim.[^1]\n\n[^1]: Source`, `See [docs][1].\n\n[1]: https://example.com`, and a footnote with an indented second paragraph were reported as failing with a `linkReference` parse error and falling to source mode (audit A3). The agent's tests may have run before the reference-link inlining in `compatibility.ts` landed; re-check before acting.
- `5) five\n6) six` saves as `1. five\n2. six`: the paren delimiter is lost. Observed before the item 1 fix; the start numbers should now survive, not re-run.
- Lazily continued text that looks like a list marker gains a backslash: `4. four\n   7. seven` saves `7\. seven`.

## Verified by test versus reasoned only

- **Run by the agent:** the 13 cases in the fidelity test, the 26-case `markdown-bench-editor.test.tsx` suite, and the baseline outputs for all six items.
- **Reasoned only:**
  - Every part of the plans for items 2, 4, 5 and 6.
  - The mark's behaviour under Enter, indent, list-type toggle and copy/paste.
  - `.mdx` documents: tests ran `documentFormat="markdown"` only.
