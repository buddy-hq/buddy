# Session status — 2026-10-02 (branch `fix/notes-ux`, nothing committed)

Written mid-session so work can resume if usage runs out. Everything below is uncommitted in the working tree.

## 0. Second session update (resumed from `session-handoff-2026-10-02.md`)

Sections 4 and 5 below are superseded by this section.

**Decisions taken:**
- Ticking a plain item in a task list turns it into a real task.
- Tags, statuses and footnotes save unescaped, at the accepted cost of hand-typed escapes.
- The checkbox stays drawn on plain items; no new dependencies.
- Path chips keep spaced names and gain boundaries.
- Indented code saves as a fenced block.
- Plain HTML (`<br>`, unclosed `<img>`, unquoted attributes) is rendered.
- Callout titles render inline Markdown.
- `.md` HTML blocks keep blank lines around Markdown content.
- MDX `<!-- -->` comments are kept as written.

**Done, each with tests:**

| Item | Where | Tests |
|---|---|---|
| Hard breaks, both styles (Opus) | new `plugins/hard-breaks.ts` | new `markdown-bench-editor-hard-breaks.test.tsx` (27) |
| Tags, custom statuses, footnotes saved unescaped | new `plugins/obsidian-plain-syntax.ts` (to-markdown `text` handler override) | new `markdown-bench-editor-obsidian-syntax.test.tsx` (26) |
| Tick turns a plain item into a task (Sonnet) | `plugins/list-fidelity.ts` (node transform via `getRegisteredNode`, tagged `@internal` in lexical) | `markdown-bench-editor-fidelity.test.tsx` (19) |
| Path chips: sentence breaks, no merged paths (Sonnet) | `lib/presented-media.ts` | `presented-media-paths.test.ts` (17) |
| Unloadable YAML frontmatter no longer crashes the editor | new `plugins/frontmatter.tsx` (Buddy frontmatter node without MDXEditor's dialog) | new `markdown-bench-editor-frontmatter.test.tsx` (10) |
| MDX `import`/`export` kept verbatim, imports no longer regenerated | new `plugins/mdx-esm.tsx` | new `markdown-bench-editor-mdx-esm.test.tsx` (15) |
| D5: note frontmatter kept byte for byte on body save (a BOM is now kept) | `buddy/src/notes/library.ts`, `note-file.ts` (`replaceNoteBody`) | `library-and-capture.test.ts` (29) |

The claimed `linkReference` parse error on footnotes does not reproduce; footnotes were only escaped.

**Queued:**
- Clear fixes:
  - Display math leaves list items, and `$$x$$` becomes `$x$`. The cause is the math normalisation in `compatibility.ts` prepare.
  - Lazy continuation lines leave callouts.
  - Loose lists become tight.
  - D2 needs a dedicated test.
- Decided fixes: listed under **Decisions taken** above.
- `<p align="center">\n  <img src="a.png" />\n</p>` saves the image as Markdown inside the HTML block, so other apps show literal text. Same area as the HTML-block item.
- An Opus review of all audit fixes is running; its findings go through the same triage.

**Accepted, no action:**
- Bytes-only changes: table padding, `key\:value` and `a \< b` in MDX, MDX JSX children losing blank lines.
- `a { b` and `a<br>b` in MDX open in source mode; they are invalid MDX.

## 1. Desktop QA report (3 failures) — done and re-verified live

| Failure | Fix | Verified |
|---|---|---|
| New tab loses selected look when a list opens from it | `directory-workspace-root.tsx` passes `selectedEmptyTabID` to the strip; `directory-chat-right-workspace.tsx` forwards it | Live in isolated QA instance |
| Buddy denied the Sources list beside the PDF | New `beside` drawer presentation. Web derives it from the list-visibility preference (`collapsedWorkspaceLists`), not the stored drawer: `directory-workspace-lifecycle.ts`, `directory-workspace-context.tsx`. Server: `bench/context.ts` (`benchStoredDrawerKind`), `tools/read-context.ts`, `client-actions.ts`, `prompt/user-prelude/index.ts`, `buddy-help/references/workspace.md` | Live: Read Bench returned `{"kind":"sources","presentation":"beside"}`; screenshot capture also succeeded |
| Mermaid nodes clipped in embedded view | `use-mermaid-viewport.ts`: stable fit-strategy deps, skip unchanged zoom commits, retry centring after a fit frame. Root cause was a perpetual refit loop starving the one-shot centring effect after any re-render | Live (theme toggle, print round trip) plus `test/mermaid-viewport-centering.test.tsx`, which fails on the old hook |

Lint and typecheck passed after these three. They have not been re-run since the work below.

## 2. Markdown / notes fixes — done, focused tests passing

| Item | Where | Tests |
|---|---|---|
| Callout title with quotes rendered as raw `:::obsidian-callout{…}` | `obsidian-callouts.ts` (title encoded as `&amp;`/`&quot;`, decoded on restore) | `markdown-bench-obsidian.test.ts`, `markdown-bench-editor.test.tsx` |
| Prose like `key:value`, `:D`, `::youtube[..]` blanked callout bodies / forced source mode | new `plugins/prose-directives.ts`, registered in `use-editor-plugins.ts` | `markdown-bench-editor.test.tsx` |
| `:::` inside callout bodies, nested callouts, `...` frontmatter mismatch (Sonnet) | `obsidian-callouts.ts` | `markdown-bench-obsidian.test.ts`, new `markdown-bench-callout-roundtrip.test.tsx` |
| Callout kinds: `[!WARNING]`, `[!faq]`, aliases (Sonnet) | `plugins/directives.tsx` | new `markdown-bench-callout-kinds.test.tsx` |
| Emoji split by title truncation; BOM notes not recognised (Sonnet) | `packages/buddy/src/notes/presentation.ts`, `note-file.ts` | `packages/buddy/test/notes/note-file.test.ts`, `library-and-capture.test.ts` |
| Dead `buddy://` and `obsidian://` links; final newline, CRLF, BOM kept on save (Sonnet) | `editor.tsx`, new `editor-link-url.ts`, new `file-text-format.ts` | new `markdown-bench-editor-links-and-endings.test.tsx` |
| Save style: `-` bullets, `---` rules | `editor.tsx` `MARKDOWN_SERIALIZATION_OPTIONS` | covered by editor tests |

Behaviour changes to know about from the Sonnet work:
- Links are now handed to the resolver as written. `[x](example.com)` used to get `https://` added by Lexical; it is now treated as a workspace-relative path.
- Trailing blank lines at end of file collapse to one newline on edit.
- `[!todo]` still shows "Note" (no Buddy config for it).
- A BOM on a Buddy-stamped note is dropped on save.

## 3. Prepare and restore passes (`compatibility.ts`) — done, tests passing

`packages/web/src/components/bench/markdown/compatibility.ts` reworked for six findings. Covered by `test/markdown-bench-compatibility.test.ts` (13 pass; one expectation changed: `$3.00` is now escaped as `\$3.00`) and the new table-driven `test/markdown-bench-editor-compatibility.test.tsx` (21 cases through the real editor).

1. Math pass bounded to the current paragraph and never reaching into code, images, link URLs or callout directive lines; `$…$` kept byte for byte.
2. `\(…\)` / `\[…\]` never treated as math inside link text or URLs (your decision). A literal `\[x\]` in ordinary prose still becomes math.
3. Frontmatter split off before every pass, so math and autolink passes cannot rewrite YAML. This also stops the editor throwing on `price: $20`.
4. `[b](<path with spaces.md>)` round-trips.
5. HTML comments shown as literal text and restored exactly, including multi-line (your decision). Restore only strips backslash escapes inside tag-like spans, so `a < b \*not em\* > c` keeps its escapes. Comments embedded inside a larger raw HTML block are untouched (still dropped by the editor).
6. Reference links converted to inline links and their definitions removed (your decision). Unused definitions are kept; their URL is rewritten as `<https://…>`. Footnote-style definitions are kept as text.

Also done: `tokens/s` file chip (Sonnet). Cause: a decimal such as `.98` counted as a file extension in `packages/web/src/lib/presented-media.ts`. Behaviour change: relative paths whose only extension is digits (`logs/app.001`) are no longer chipped. Not fixed: prose followed by a real extension (`km/h. See README.md`) still chips, and two relative paths in one sentence merge into one chip; both need a decision on spaced folder names.

## 4. Markdown save fidelity agent — stopped at a checkpoint, 2 of 6 done

No agents are running. The Opus fidelity agent was stopped early and cannot be resumed. Its full handoff, with causes and plans for the unfinished items, is in `docs/reviews/markdown-fidelity-handoff-2026-10-02.md`.

| Item | State |
|---|---|
| Ordered list start numbers (`5. five` saved as `1. five`) | Done for top-level lists. Nested numbered lists still restart at 1, on purpose. |
| Plain item in a task list gained `[ ]` on save | Done on disk. The editor still draws a checkbox on the plain item. |
| Hard breaks (two-space and backslash) | Not started; plan in the handoff |
| `#tag` at line start saved as `\#tag` | Not started; plan in the handoff |
| Custom task statuses (`- [/]`) saved escaped | Not started; plan in the handoff |
| Footnotes (`[^1]`) saved escaped | Not started; plan in the handoff |

Files: new `plugins/list-fidelity.ts`, one registration line in `use-editor-plugins.ts`, new `test/markdown-bench-editor-fidelity.test.tsx` (13 cases).

Decisions the handoff raises:
- Plain item in a task list: once ticked and unticked it saves as plain again, not `- [ ]`.
- Tags, statuses and footnotes, if built as planned: a deliberately escaped `\#word`, `\[^1]` or `- \[/] x` would save unescaped and become live syntax in Obsidian.
- Adding `@lexical/list` and `mdast-util-to-markdown` as direct dependencies of `packages/web` would allow removing the checkbox drawn on plain items.

## 5. Queued, not started

- The four unfinished fidelity items above (hard breaks; tags, statuses and footnotes as one piece of work).
- Frontmatter crash on unusual YAML (`title: Note: the sequel`, duplicate keys, comment-only). Opus, one at a time; an earlier launch was stopped before it changed anything.
- MDX `import` / `export` lines deleted or rewritten on save. Opus, after the above.
- Buddy note frontmatter regenerated with `stringifyYaml` on every body save (server, read-only finding, unverified).

## 6. Known and accepted, not being fixed

- Callout title containing literal entity text (`&amp;`, `&#x22;`) is decoded on save; inherent to how the directive serialiser writes attributes.
- A bare `:::` line in a callout body saves as `\:::`.
- Byte-only noise on first edit other than bullets and rules (`snake\_case`, `\$5`, entities decoded, tables re-padded) is unchanged.
- Rare state where the stored drawer equals the item's own section: screenshot capture is refused, as before.

## 7. Verification state and what is still owed

Last run after the fidelity agent stopped, with nothing else running:
- `bun lint`: clean.
- `bun typecheck`: 12 of 12 tasks pass.
- Web, each file run on its own, all pass: every `markdown-bench-*.test.*` file (17 files), `presented-media-paths`, `markdown-link-decoration`, `directory-workspace-lifecycle`, `mermaid-viewport-centering`.
- Buddy, all pass: `notes/note-file`, `notes/library-and-capture`, `learning/bench-turn-context`, `learning/bench-read-context`.

Still owed:
- `.pr-review/desktop-qa/relaunch-with-prep.ts` is a helper I added in the git-ignored QA folder; the QA instance is quit.
- `bun fmt` only when you are satisfied.
- None of the Markdown fixes have been checked in the running app; they are verified by tests in happy-dom only.

## Records

- Fidelity agent handoff: `docs/reviews/markdown-fidelity-handoff-2026-10-02.md` (plans are reasoned, not tested).
- Audit ledger: `docs/reviews/notes-markdown-parser-audit-2026-10-02.md` (18 findings; a record, verify before acting).
- QA report: `.pr-review/bench-desktop-test-report.html`.
