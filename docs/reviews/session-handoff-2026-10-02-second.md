# Session handoff (second session) — 2026-10-02

**Completion update:** the follow-up finished the formatting plugin/editor wiring, edited-currency preservation, math/HTML protection and multiline-image indentation. All 29 Markdown test files passed (713 tests, one existing cold-click TODO), both Notes suites passed (41 tests), and root lint/typecheck passed. The conservative HTML choices were retained and documented. See `.pr-review/checkpoint-computer-use-spec/READINESS.md` for current status; the sections below describe the earlier stop. Computer-use verification is still pending. Nothing was committed and `bun fmt` has not been run.

Continues `session-handoff-2026-10-02.md`. Same worktree (`/Users/prashantbhudwal/Code/buddies/hippo`) and branch (`fix/notes-ux`). **Nothing is committed.** `bun fmt` has not been run. No browser or app verification has been done; everything is verified in happy-dom tests only.

The standing process and code rules in section 2 of the first handoff still apply. The user has also said:
- Agent caps after the limit reset: one Opus and up to three Sonnets at a time; no complex work for Sonnets.
- Batch tight tasks into one Sonnet, but don't overload a single Sonnet.
- Start ready work right away instead of queueing it.
- For complicated edge cases, default to what Obsidian does instead of asking.

## 1. Decisions made in this session (do not reopen)

| Question | Answer |
|---|---|
| Plain task-list item, tick then untick | Ticking turns it into a real task; unticking saves `- [ ]` |
| Tags, `- [/]` statuses, `[^1]` footnotes | Save unescaped; a hand-typed escape before them is dropped |
| Checkbox drawn on plain items | Leave it; no new dependencies |
| Chat path chips | Keep spaced names; add sentence and second-path boundaries |
| Indented code in `.md` | Save as a fenced block |
| `<br>`, unclosed `<img>`, unquoted attributes | Render them; the file keeps the tags as written |
| Markdown in callout titles | Render inline Markdown; the title stays read-only |
| `.md` HTML blocks with blank lines | Keep the blank lines so other apps render the Markdown inside |
| MDX `<!-- -->` comments | Keep as written (show as text), like `.md` |
| Shift+Enter line break (#14a) | Follow Obsidian: two trailing spaces; a backslash when the spaces would sit on an otherwise empty line; breaks loaded from the file keep their style |
| Save churn in untouched text (B9 leftovers: `\:`, `<url>`, `\_`, `\$`, table padding, emphasis split around math) | Keep untouched blocks byte for byte; only edited blocks are re-serialized, and the worst escapes are fixed for those too |

## 2. Done and tested in this session

| Item | Files | Tests |
|---|---|---|
| Hard breaks, both styles | new `plugins/hard-breaks.ts` | `markdown-bench-editor-hard-breaks.test.tsx` |
| Tags, statuses, footnotes unescaped | new `plugins/obsidian-plain-syntax.ts` | `markdown-bench-editor-obsidian-syntax.test.tsx` |
| Tick turns plain item into task | `plugins/list-fidelity.ts` | `markdown-bench-editor-fidelity.test.tsx` |
| Loose lists stay loose (`list.spread`, `listItem.spread`) | `plugins/list-fidelity.ts` | same |
| Path chips | `lib/presented-media.ts` | `presented-media-paths.test.ts` |
| Unloadable YAML frontmatter no longer crashes; Backspace no longer deletes hidden frontmatter (`isIsolated`) | new `plugins/frontmatter.tsx` | `markdown-bench-editor-frontmatter.test.tsx` |
| MDX `import`/`export` kept verbatim, shown read-only, imports not regenerated; Backspace safe; body passes skip ESM blocks | new `plugins/mdx-esm.tsx`, `compatibility.ts` (`prepareMdxBodyKeepingEsm`) | `markdown-bench-editor-mdx-esm.test.tsx` |
| `.mdx` saves no longer leave U+2060 markers | `compatibility.ts` `restoreMdxFromMdxEditor`, `editor.tsx` | same |
| Bare URLs in `.mdx` saved as `[url](url)` (MDX can't read `<url>`; this bug predates both sessions) | `editor.tsx` `MDX_SERIALIZATION_OPTIONS` | same |
| Math pass keeps `$$` blocks inside lists and blockquotes; one-line and `\[…\]` forms get the container prefix; inline `$$x$$` is no longer rewritten by prepare | `compatibility.ts` (`normalizeBuddyMathForMdxEditor`) | `markdown-bench-compatibility.test.ts`, new `markdown-bench-editor-math.test.tsx` |
| Definition as first line of a callout body no longer wipes the body | `compatibility.ts` (`withCalloutDirectiveLinesAsBlockBreaks`) | `markdown-bench-editor-compatibility.test.tsx` |
| `$` in a quoted chat message pinned | — | `markdown-bench-editor-compatibility.test.tsx` |
| D5: note frontmatter kept byte for byte on body save; empty stamped note without final newline keeps its stamp | `buddy/src/notes/note-file.ts` (`replaceNoteBody`), `library.ts` | `buddy/test/notes/library-and-capture.test.ts` |
| Lazy continuation lines stay inside callouts; inline Markdown in callout titles (Sonnet A2). Nested `> > more\n> after` now puts `after` in the inner callout, as CommonMark and Obsidian do | `obsidian-callouts.ts`, `plugins/directives.tsx`, `plugins/obsidian.tsx` | `markdown-bench-obsidian.test.ts`, `markdown-bench-callout-roundtrip.test.tsx`, new `markdown-bench-callout-title.test.tsx` |
| Inline `$$x$$` saved with two dollars, display mode (Sonnet C) | `plugins/math.tsx` | `markdown-bench-editor-math.test.tsx` |
| #8, #9: `- [<]` status kept; `<`, `\|`, U+2060 kept out of footnote labels | `plugins/obsidian-plain-syntax.ts` | `markdown-bench-editor-obsidian-syntax.test.tsx` |
| #3: `::name` alone in a list item no longer deleted; #7: bold/italics kept around `word:word`; #11: directive `{...}` attributes saved verbatim | `plugins/prose-directives.ts` | new `markdown-bench-editor-prose-directives.test.tsx` |
| #10: two hard breaks in a row kept; #14a: Shift+Enter saves per the decision above | `plugins/hard-breaks.ts` | `markdown-bench-editor-hard-breaks.test.tsx` |
| #12: `commitNestedEditors(container)` focuses and blurs nested editors before reading the save; used by 42 callout/directive tests; found no hidden bugs | new `test/markdown-bench-nested-editors.ts` | callout round-trip, callout kinds, editor compatibility |
| #14b: capture, rename and title sync change only the stamp keys they touch (comments, quoting, order, BOM, CRLF kept); unsafe edits fall back to the old full render | `buddy/src/notes/note-file.ts` (`replaceNoteMetadata`), `chat-capture.ts`, `session-title-sync.ts`, `library.ts` | `note-file.test.ts`, `library-and-capture.test.ts` |
| Edited blocks no longer gain `\\:` before letters, `\\=` for a lone `=`, `\\_` inside words; bare URLs (`http://`, `www.`, emails) stay bare in `.md` (Lexical's `autolink` node is the mark; unsafe characters fall back to `<url>`; `.mdx` keeps `[url](url)`) | `plugins/obsidian-plain-syntax.ts`, new `plugins/bare-autolinks.ts` | `markdown-bench-editor-obsidian-syntax.test.tsx` (88) |
| Checkbox click inside a callout toggled twice (nested and root check-list listeners both fired), so a click looked like it did nothing | `plugins/directives.tsx` (stops check-item click/pointerdown at the callout body) | `markdown-bench-editor-fidelity.test.tsx` |
| #14c: plain-item transform also registered on the active (nested) editor | `plugins/list-fidelity.ts` | same; a cold click before the callout was ever focused is a `test.todo` (happy-dom can't activate a nested editor by click) |
| Formatting split around inline nodes (`**bold $x$ after**`, links, wikilinks, images, bare URLs) joined back on save; not registered yet | new `plugins/formatting-runs.ts` | new `markdown-bench-formatting-runs.test.ts` |
| Untouched-block merge module (not wired yet, see section 5) | new `untouched-blocks.ts` (`keepUntouchedMarkdownBlocks`) | new `markdown-bench-untouched-blocks.test.ts` |

## 3. Agent work in flight (see section 6 for handoffs)

- Opus: MDX `<!-- -->` kept as written (done), indented code saved fenced (done), leftover `$$` rewrites in prepare (done), HTML in `.md` (in progress). Progress log: `scratchpad/opus-progress.md`. Owns `compatibility.ts`, `editor.tsx`, `use-editor-plugins.ts`, `mdx-intrinsic.tsx`, `mdx-generic-component.tsx`, `image.tsx`, new HTML plugin/tests.
- Sonnets H and I finished; their work was reviewed and taken over (the user does not want Sonnets used beyond trivially mechanical work).

## 4. Review findings (Opus review of all audit fixes) — status

| # | Finding | Status |
|---|---|---|
| 1 | Backspace deletes hidden frontmatter / ESM | Fixed |
| 2 | Definition first in callout body wipes body | Fixed |
| 3 | `::name` alone in a list item deleted | Fixed (saves `- \\::before`; the escape stops a leaf directive) |
| 4 | Empty stamped note loses stamp | Fixed |
| 5 | U+2060 markers written into `.mdx` | Fixed |
| 6 | ESM blocks rewritten by body passes | Fixed |
| 7 | Bold/italics dropped around `word:word`, `:D` | Fixed |
| 8 | `- [<]` status still escaped | Fixed |
| 9 | Footnote labels with `<`, `\|`, U+2060 | Fixed |
| 10 | Two hard breaks in a row lose one | Fixed |
| 11 | Directive attributes rebuilt from parsed values | Fixed |
| 12 | Tests can't see failures inside callout bodies | Fixed (`commitNestedEditors`) |
| 13 | Fragility notes | Accepted, all covered by tests |
| 14a | Shift+Enter line break lost on reopen | Fixed (Obsidian style, see decisions) |
| 14b | Capture, rename and title sync regenerate frontmatter | Fixed (`replaceNoteMetadata`) |
| 14c | Tick then untick inside a callout saves plain | Confirmed; Sonnet I fixing (transform not registered on nested editors) |

Simpler designs the reviewer suggested, not taken up:
- (a) Disable micromark `directiveText`/`directiveLeaf` parsing so `prose-directives.ts` isn't needed. Unverified that MDXEditor honours it.
- (b) Add a lowest-priority import visitor that turns unknown nodes into literal text.

## 5. State at the stop (limits at 95%)

**Wired this session (uncommitted; `bun lint` and `bun typecheck` pass):**
- **Untouched-block preservation** is wired.
  - **Where:** `editor.tsx` has a `preserveUntouchedBlocks` prop, which `page.tsx` passes.
  - **State:** `loadedMarkdownRef` holds `{ source, baseline }`.
  - **Baseline capture:** captured by `captureLoadedBaseline()` on mount and after `setMarkdown`, and from the `onChange` calls flagged `initialMarkdownNormalize` / `applyingExternalMarkdownRef`.
  - **Merge:** `restoreEditorMarkdown` merges for `.md` before `applyMarkdownFileTextFormat`.
  - **Gaps:** `untouched-blocks.ts` now keeps source gaps around a block edited in place (`sourceSlots`).
  - **Tests:** `markdown-bench-untouched-blocks.test.ts` 11/11; `markdown-bench-editor-untouched-blocks.test.tsx` 7/7.

**Formatting runs, not active:**
- **Symptom:** `plugins/formatting-runs.ts` (`root` handler override) works on mdast trees (`markdown-bench-formatting-runs.test.ts` 3/3) but had no effect in the editor.
- **Unregistered:** I unregistered it from `use-editor-plugins.ts` and removed its 7 editor cases.
- **Next steps:**
  1. Check whether `handlers.root` from an `addToMarkdownExtension$` extension is ever called (`exportMarkdownFromLexical.js:259`).
  2. Otherwise override the `paragraph`/`heading`/`tableCell` handlers.
  3. Add `buddyAutolink` and `buddyRawHtmlText` to its phrasing set.
  4. Re-register it.
  5. Restore editor cases such as `**bold $x$ after**`, `**see [a](u) now**`, `*see [[Wiki]] now*`, `**see http://x.com now**`, `**bold <br> still**`, and the unchanged `**bold** $x$ **after**`.

**Still open:**
- **`$5` → `\$5` in edited blocks:** the prepare step in `compatibility.ts` inserts it and nothing removes it.
- **#14c cold click:** a tick and untick by click in a callout that was never focused is a `test.todo`. The computer-use spec checks it in the real app.
- **`.mdx` untouched-block preservation:** not attempted.
- **Verification:** `bun lint` then `bun typecheck` from the repo root, run once. Then focused reruns of: obsidian-syntax, editor, editor-compatibility, editor-html, compatibility, untouched-blocks (both), fidelity, prose-directives, hard-breaks, math, callout ×3.
- **Opus HTML work:** review it when its handoff (section 6) is in. New `plugins/raw-html.tsx` and `plugins/raw-html-carrier.ts`; it changed `compatibility.ts` and `mdx-intrinsic.tsx`, and registered `buddyRawHtmlPlugin()` for `.md`.
- **Computer-use spec:** updated for the finished change set (`.pr-review/checkpoint-computer-use-spec/SPEC.md`, `prepare.py`, new fixtures). Recapture the checkpoint with `python3 prepare.py` after archiving, once the code is final.

## 6. Agent handoffs

- **Sonnet A2 (callouts), C (math), D (diagnosis), E (directives), F (hard breaks), G (test helper), H (escapes/URLs), I (#14c):** all finished. Their results are folded into section 2; H's and I's work was reviewed and finished by me.
- **Opus (compatibility + HTML):**
  - **Done:** items 1–3, then item 4's three HTML parts, all done and tested at 19:17 (`editor-html` 49/49, compatibility 45/45).
  - **Hardening:** it was then fixing inline tags that drop the file into source mode (uppercase `<B>`, custom elements, SVG children outside `<svg>`; this predates the session).
  - **Finished:** all four items are done.
    - `.mdx` `<!-- -->` is saved as written.
    - Indented code in `.md` is saved fenced.
    - `$$…$$` is kept in prepare.
    - `.md` HTML blocks and inline `<br>`/`<img>`/`<wbr>` are raw HTML nodes (new `plugins/raw-html.tsx`, `raw-html-carrier.ts`). They save byte for byte and render through the safe preview; `<img src=a.png width=200>`, the centred `<img>` and blank-line `<div>`s all work.
    - It also fixed uppercase tags, custom elements and stray SVG children forcing source mode.
  - **Tests:** html 52, indented-code 14, compatibility 45, and every other Markdown suite green at its run.
  - **Product questions it raised:** each was settled with the conservative option; ask the user.
    1. HTML blocks are now edited only through a source textarea (click/Enter), like Obsidian live preview, no longer inline.
    2. A lone `<div>`/`</div>` shows as a muted source chip; Obsidian shows nothing.
    3. Inline tags it can't parse (`<span class=x>`, `<input>`, uppercase, custom elements) still show as text.
    4. `$$a\nb$$ more` still becomes `$…$` when keeping `$$` would open a block.
    5. Indented templates like `## Premises:\n    1. <premise>` now save as fenced code (CommonMark/Obsidian).
    6. The raw-HTML preview uses its own allowlist (adds headings, `pre`, `kbd`, `sup`, `center`, `font`; drops script/style/iframe/forms/media).
  - **Seen, not fixed:**
    - `**bold <br> still**` splits. Add `buddyRawHtmlText` and `buddyAutolink` to `formatting-runs.ts`'s phrasing set once its handler works.
    - A multi-line inline `<img>` loses its indentation.
    - In `$a<b$`, U+2060 is inserted inside the math (KaTeX warning).
    - `$$\n<b>x</b>\n$$` saves as `\$\$`.
    - An empty SVG element saves self-closed.
  - **Untouched-block merge:** prepare now fences HTML blocks and indented code, but the merge compares the restored output, so this should be unaffected. Verify.
  - **Stray debug output:** `REGISTER root` / `TRANSFORM` lines print during editor tests. Find and remove the leftover `console.log` before committing.

## 7. Verification at the stop

- **Repo checks:** `bun lint` exits 0 with no findings; `bun typecheck` passes 12/12 tasks, after the final wiring and three small fixes (`toReversed`, the `setURL` return type, and the `parentElement` assertion in the callout-title test).
- **Focused test results** (last run after each change):
  - obsidian-syntax 88/0, after the formatting-run cases were removed
  - editor 26/0
  - editor-compatibility 25/0
  - prose-directives 56/0
  - fidelity 49/0 (1 todo)
  - untouched-blocks: unit 11/0, editor 7/0
  - formatting-runs unit 3/0
  - Opus suites: html 52/0, indented-code 14/0, compatibility 45/0, math 51/0, callout ×3, obsidian 78/0
  - buddy: note-file 10/0, library-and-capture 31/0
- **Not re-run after the final edits:** the Opus suites, after the untouched-block wiring. Rerun these first next session: editor-html, compatibility, indented-code, math, links-and-endings, frontmatter, mdx-esm, and callout ×3.
- **Not done:** nothing is committed, and `bun fmt` has not been run. The computer-use spec is updated, but recapture its checkpoint (`python3 prepare.py`, after archiving) before running it.
