# Session handoff — 2026-10-02

For the agent taking over this work in a new Claude Code session. You have none of the previous session's context; this file is meant to be enough to continue without it.

- **Worktree:** `/Users/prashantbhudwal/Code/buddies/hippo` (a git worktree; run everything from here, never `cd` to the original repository).
- **Branch:** `fix/notes-ux`, HEAD `a69bdc43c2`. **Nothing from this session is committed.** All work exists only as uncommitted changes in this worktree, so the new session must run on this machine in this directory.
- **State when handed over:** `bun lint` clean, `bun typecheck` 12 of 12 tasks pass, every touched test file passes. No agents running. No dev server or QA app running.
- **The user's last instruction:** stop editing and wait. Do not start fixing anything until the user tells you what to do next. Start by reporting state and asking for the open decisions in section 6.

Companion files, in the order to read them:

1. This file.
2. `docs/reviews/markdown-fidelity-handoff-2026-10-02.md` — causes and plans for the four unfinished save-fidelity items, written by an agent that was stopped early. The plans are reasoning only; nothing in them was tested.
3. `docs/reviews/notes-markdown-parser-audit-2026-10-02.md` — the 18-finding audit ledger (ids A1–A4, B1–B11, C1–C3, D1–D5, E1–E2, F). It says "nothing here has been fixed"; that is out of date. Use section 4 below for current status, and verify any finding against the code before acting on it.
4. `docs/reviews/session-status-2026-10-02.md` — the running status log. Shorter than this file; kept for the record.
5. `.pr-review/bench-desktop-test-report.html` — the original desktop QA report (git-ignored folder).

If you need exact wording or code from the previous session, the full transcript is at `/Users/prashantbhudwal/.claude/projects/-Users-prashantbhudwal-Code-buddies-hippo/321e559b-756c-463a-be1c-f35b92df046d.jsonl`. It is very large; search it, do not read it whole.

---

## 1. What the user asked for

Three requests, layered in this order:

1. **Fix the failures in a desktop QA report** (14 pass, 2 fail, 7 partial, 1 skipped; three observed issues). Obvious single-solution bugs were to be fixed directly; anything needing a product decision was to be asked through the question tool first.
2. **Explain and fix a callout that rendered as raw `:::obsidian-callout{…}` text** in one of the user's notes, then **audit the whole notes / Markdown / MDX parsing path** for similar bugs and fix those with the same process.
3. **Fix dogfooding "Issue 08":** the text `tokens/s` in chat rendered as a file path chip.

The session ran out of usage part-way through request 2. Requests 1 and 3 are done.

## 2. How the user wants the work done

These are standing instructions. `AGENTS.md` and the memory index load automatically, but the ones that bit during this session are repeated here.

**Process for a batch of bugs**

- Obvious bug with one sensible fix: fix it, with a test.
- Fix that changes behaviour or needs a product choice: ask with the question tool before touching it. Put the recommended option first.
- Tightly scoped obvious bugs: delegate to Sonnet agents. Several related tight bugs can go to one Sonnet.
- Larger or complex fixes: an Opus agent. **Never more than one Opus agent at a time.** Queue the rest.
- Never delegate so much that you have nothing on your own critical path. Keep the riskiest shared-file work for yourself.
- If agents could collide (same files, interacting logic), run them one after another.
- Partition delegated work by file ownership, and tell each agent that lint and typecheck are run once by you afterwards.

**Verification**

- `bun lint`, then `bun typecheck`, from the repository root. Never run typechecks concurrently. `bun typecheck` regenerates the SDK first; that is expected.
- Focused tests only, one file at a time, through the package script:
  - web: from `packages/web`, `bun run test test/<file>`
  - buddy: from `packages/buddy`, `bun run test test/<file>`
- Never raw `bun test`, never the full suite, never vendor tests.
- `bun fmt` only when the user says they are satisfied. It has not been run.
- Browser or computer-use verification only with the user's explicit approval. Approval was given once, for one re-check; it does not carry over.

**Code**

- No code comments. Name things clearly instead.
- The repository's oxlint config has custom `anti-slop` rules that caught agent-written code three times this session:
  - `no-shape-in-symbol-names`: no "shape" in identifiers or file names.
  - `no-runtime-typeof`: no `typeof x === "…"` narrowing.
  - `no-known-value-widening`: no `Record<string, string>` style annotations on constant tables.
- Do not edit `vendor/opencode`, generated files (`routeTree.gen.ts`, `packages/sdk/src/gen/`) or build artifacts.

**Safety**

- Never point tests, fixtures or scripts at the developer's real Buddy home, Electron `userData`, runtime XDG roots or notebook `.buddy` state.
- Stop only processes you started. Never kill Buddy, Electron or dev servers by name or pattern.
- No machine-wide shell scans. Keep paths inside the repository.
- Do not commit or push unless asked. If asked, the commit attribution line is in the session's system reminder.

**Communication**

- Lead with the verdict in plain words. No walls of code-path narration.
- Findings documents are records, not open bugs: verify before repeating a claim.

## 3. The working tree is shared with earlier work

`git status` shows about 100 modified and 45 untracked files. **Most of them are not from this session.** The branch already carried uncommitted work on themes, the in-app browser, shortcuts, Easel and settings before this session started. Do not revert, reformat or "clean up" files you do not recognise.

Files this session created or changed:

**Web, source** (`packages/web/src/`)

| File | What changed |
|---|---|
| `components/directory-chat/directory-workspace-root.tsx` | New-tab stays selected when a list opens from it |
| `components/directory-chat/directory-chat-right-workspace.tsx` | New prop `selectedEmptyTabID` forwarded to the tab strip |
| `components/directory-chat/directory-workspace-context.tsx` | Passes `isOwnListOpen` to the lifecycle service; republishes when the list-visibility preference changes |
| `lib/directory-workspace-lifecycle.ts` | `drawerContext(drawer, target, isOwnListOpen)`; new `beside` presentation |
| `components/media/renderers/mermaid/use-mermaid-viewport.ts` | Stable fit-strategy deps, skip unchanged zoom commits, retry centring after a fit frame |
| `components/bench/markdown/obsidian-callouts.ts` | Title encode/decode; longer outer fence; nested callouts; restore accepts 3+ colons; frontmatter end is `---` only |
| `components/bench/markdown/compatibility.ts` | Reworked prepare and restore passes (section 4, "Prepare and restore") |
| `components/bench/markdown/editor.tsx` | Dash bullets and `---` rules on save; real link URL on click; file text format preserved |
| `components/bench/markdown/use-editor-plugins.ts` | Registers `buddyListFidelityPlugin()` after `listsPlugin()` and `buddyProseDirectivePlugin()` after `directivesPlugin(...)` |
| `components/bench/markdown/plugins/directives.tsx` | Callout kind aliases and case-insensitive matching |
| `components/bench/markdown/plugins/prose-directives.ts` (new) | Unknown text and leaf directives become literal text |
| `components/bench/markdown/plugins/list-fidelity.ts` (new) | Ordered list start; plain items in task lists |
| `components/bench/markdown/editor-link-url.ts` (new) | Reads the real URL from the Lexical link node |
| `components/bench/markdown/file-text-format.ts` (new) | Reads and reapplies BOM, line ending and final newline |
| `lib/presented-media.ts` | A decimal such as `.98` no longer counts as a file extension |

**Buddy, source** (`packages/buddy/src/`)

| File | What changed |
|---|---|
| `learning/features/bench/context.ts` | `beside` added to drawer presentations; `benchStoredDrawerKind` |
| `learning/features/bench/tools/read-context.ts` | Tool description documents `beside`; capture uses the stored drawer |
| `learning/features/bench/client-actions.ts` | Capture completion matches on the stored drawer |
| `learning/prompt/user-prelude/index.ts` | Status line for a list open beside the Bench target |
| `learning/features/platform/skills/buddy-help/references/workspace.md` | "What Buddy sees" updated |
| `notes/presentation.ts` | Grapheme-safe truncation |
| `notes/note-file.ts` | Frontmatter open pattern tolerates a BOM |

**Tests**

- Web, new: `markdown-bench-editor-compatibility.test.tsx`, `markdown-bench-editor-fidelity.test.tsx`, `markdown-bench-callout-roundtrip.test.tsx`, `markdown-bench-callout-kinds.test.tsx`, `markdown-bench-editor-links-and-endings.test.tsx`, `mermaid-viewport-centering.test.tsx`.
- Web, changed: `markdown-bench-obsidian.test.ts`, `markdown-bench-editor.test.tsx`, `markdown-bench-compatibility.test.ts`, `presented-media-paths.test.ts`, `markdown-link-decoration.test.tsx`, `directory-workspace-lifecycle.test.ts`.
- Buddy, changed: `test/learning/bench-turn-context.test.ts`, `test/notes/note-file.test.ts`, `test/notes/library-and-capture.test.ts`.

**Docs and helpers**

- `docs/reviews/`: this file, `session-status-2026-10-02.md`, `markdown-fidelity-handoff-2026-10-02.md`, `notes-markdown-parser-audit-2026-10-02.md`.
- `.pr-review/desktop-qa/relaunch-with-prep.ts` (git-ignored): reruns `predev` then `electron-vite dev` against the saved QA sandbox.

## 4. Status of every item

### 4.1 Desktop QA report — done, re-verified in the running app

| Failure | Fix | Check |
|---|---|---|
| New tab loses its selected look when a list opens from it | Tab strip gets a separate "selected" id that stays set while a drawer covers the empty page | Seen live in the isolated QA instance |
| Buddy said it could not see the Sources list sitting beside an open PDF | New `beside` drawer presentation. An item's own section list is a UI preference (`useUiPreferences.collapsedWorkspaceLists`), not the stored drawer, so the web derives it from the preference. Screenshot capture still matches on the stored drawer through `benchStoredDrawerKind` | Live: Read Bench returned `{"kind":"sources","presentation":"beside"}` and capture succeeded |
| Mermaid nodes clipped in the embedded view | A per-render object in effect deps caused a perpetual refit that starved the one-shot centring effect | Live (theme toggle, print round trip), plus a test that fails on the old hook |

The user chose to leave the report's partial and skipped checks as they are.

### 4.2 Issue 08, `tokens/s` path chip — done

Fixed in `lib/presented-media.ts`. Two things remain and need a decision (section 6, item 4).

### 4.3 Markdown audit — finding by finding

"Fixed" means there is a test that passes. Nothing in this table has been checked in the running app.

| Finding | Status | Notes |
|---|---|---|
| A1 callout body blanked by `key:value`, `:D` | Fixed | `prose-directives.ts`. Not separately verified: the same text inside a table cell, and inside a `:::note` admonition body |
| A2 HTML comments deleted from `.md` | Fixed | Shown as literal text, restored byte for byte, including multi-line. A comment inside a larger raw HTML block is still dropped |
| A3 directive-looking prose forces source mode | Fixed for text and leaf directives and for reference links | `<a href=https://x.com>` (unquoted attribute) still forces source mode; not addressed |
| A4 crash when a pass rewrote frontmatter | Fixed | Frontmatter is split off before every pass |
| A4 / F crash on YAML that is unusual on disk | **Not started** | `title: Note: the sequel`, duplicate keys, comment-only frontmatter. Queued |
| B1 math matching across the whole document | Fixed | Bounded to the paragraph; never reaches into code, images, link URLs or callout directive lines |
| B2 math pass rewrote frontmatter and callout titles | Fixed | Literal `\[x\]` and `\(x\)` in ordinary prose still become math, by the user's decision |
| B3 serialiser escapes read back as math | Fixed | Backslash math is never recognised inside link text or URLs |
| B4 angle-bracket link destinations | Fixed | `[b](<path with spaces.md>)` round-trips |
| B5 restore stripped escapes between `<` and `>` | Fixed | Only strips inside spans that start like a tag |
| B6 `:::` inside callout bodies | Fixed | A bare `:::` line in a callout body saves as `\:::` (accepted) |
| B7 nested callouts | Fixed | |
| B8 list start number, `2024. A year` | Fixed | Top-level lists only; nested numbered lists restart at 1 on purpose |
| B8 plain item gains a checkbox | Fixed on disk | The editor still draws a checkbox on the plain item |
| B8 hard breaks | **Not started** | Plan in the fidelity handoff |
| B8 `#tag`, `- [/]`, `[^1]` escaped on save | **Not started** | Plan in the fidelity handoff; blocked on a decision |
| B8 indented code, loose lists, `$$x$$` inline, math block in a list item, blank lines in `<div>` | **Not triaged** | Never assigned to anyone |
| B9 bullets and rules | Fixed | Saves use `-` and `---` |
| B9 final newline, CRLF | Fixed | Trailing blank lines collapse to one newline |
| B9 everything else (`snake\_case`, `\$5`, entities decoded, tables re-padded, …) | Left as is | Byte-only noise; not raised with the user beyond bullets and rules |
| B10 lazy continuation leaves the callout | **Not triaged** | |
| B11 callout title over-decodes literal `&amp;` | Accepted | Inherent to how the directive serialiser writes attributes |
| C1 callout kinds, case and aliases | Fixed | `[!todo]` still shows "Note": there is no Buddy config for it |
| C2 title shows `⁠\<T>` or literal Markdown | **Not verified** | The math pass now skips directive lines; whether the angle pass does was not checked |
| C3 `<br>`, unclosed `<img>` shown as text | **Not triaged** | File round-trips unchanged |
| D1 dead `buddy://` and `obsidian://` links | Fixed | Should be confirmed once in the real app |
| D2 `$` in a quoted message corrupts the note | Expected fixed by B1 and B2 | No dedicated test; worth one |
| D3 quoted message triggers A1, A2, B6, B7 | Follows from those fixes | |
| D4 emoji split by truncation | Fixed | |
| D5 note frontmatter regenerated on every body save | **Not started, unverified** | The audit only read the code. Reproduce before fixing |
| D5 BOM note not recognised | Fixed | A BOM on a Buddy-stamped note is dropped on save |
| E1 MDX `import` / `export` lines deleted or rewritten | **Not started** | Queued |
| E2 other MDX results | **Not triaged** | |
| F `...` frontmatter terminator, mixed line endings, BOM | Fixed | |

**Prepare and restore, as it now works** (`compatibility.ts`)

```
prepareMarkdownForMdxEditor(markdown)
  → convert Obsidian callouts to directives
  → split off frontmatter; nothing below touches it
  → inline reference links, remove their definitions
  → normalise math, bounded to the paragraph
  → autolink and angle-bracket replacements
restoreMarkdownFromMdxEditor(markdown)
  → strip the inserted markers, restore comments and callouts
```

- Raw `<` is protected by inserting U+2060 plus `\<`; restore strips it. The same marker scheme now protects `[` for definitions that must stay as text.
- Unused link definitions are kept; their URL is rewritten as `<https://…>`. Footnote-style definitions are kept as text.
- Opening a file never rewrites it. The first real edit re-serialises the whole document, so every round-trip difference lands on disk then.

**Things worth re-checking, because they were claimed but not confirmed**

- The fidelity agent reported that `Claim.[^1]\n\n[^1]: Source` and `See [docs][1].\n\n[1]: https://example.com` still fail with a `linkReference` parse error. It may have observed that before the reference-link inlining landed. Probe both through the real editor before believing either side.
- `5) five\n6) six` loses the paren delimiter (saves as `5. five`). Seen before the list-start fix; not re-run.
- `4. four\n   7. seven` saves as `7\. seven`.

## 5. What is left, in suggested order

Do none of this until the user says go. When they do, this order keeps risk low:

1. **Ask the open decisions** in section 6. Items 1 and 2 block work below.
2. **Hard breaks.** No decision needed. Full plan in the fidelity handoff, item 2. Read the "do not export all LineBreakNodes as break" warning first.
3. **Tags, custom task statuses and footnotes**, as one piece of work: all three come from the same escape step, and the plan is a single `handlers.text` override. Needs decision 2.
4. **Frontmatter crash on unusual YAML** in the web editor. MDXEditor's `FrontmatterEditor` calls `Object.entries(YamlParser.load(yaml))` unguarded. An earlier Opus launch for this was stopped before it changed anything.
5. **MDX `import` / `export` lines** (E1).
6. **Server-side frontmatter regeneration** (D5). Reproduce first; it is an unverified read-only finding. Persisted user data must survive, so treat this one carefully.
7. **Triage the "not triaged" rows** in 4.3 with the user using the same process.
8. **Check the Markdown fixes in the running app**, if the user approves. So far they are verified in happy-dom only.
9. `bun fmt`, then commit, when the user says they are satisfied.

Items 2 to 6 are each sized for one Opus agent, one at a time. They all touch `use-editor-plugins.ts` or neighbouring plugin files, so run them in series.

**Constraint for any list or serialiser work:** `@lexical/list` and `mdast-util-to-markdown` are not direct dependencies of `packages/web` and do not resolve from it. `$isListNode`, a `ListItemNode` subclass and to-markdown's `defaultHandlers` are unavailable without a `package.json` change. `list-fidelity.ts` works around this with structural type guards on `getType()`.

**Test pattern to copy:** `packages/web/test/markdown-bench-editor-compatibility.test.tsx` mounts the real `MarkdownBenchEditor` and compares `getMarkdown()` with the input, table-driven. To collect processing errors use the `onProcessingResult` prop; `onProcessingErrorChange` is not a prop of the editor component and an assertion built on it passes vacuously.

## 6. Decisions waiting for the user

Ask these with the question tool, recommended option first.

1. **Plain item in a task list, after ticking then unticking it.** Today it saves as a plain item again, not `- [ ]`, because the "plain" mark stays on the node. Accept, or clear the mark on first tick?
2. **Deliberately escaped syntax.** If tags, statuses and footnotes are fixed as planned, a hand-written `\#word` at line start, `\[^1]` or `- \[/] x` would save unescaped. That is the same in CommonMark but becomes live syntax in Obsidian. Also, a one-word footnote definition typed in rich text (`[^1]: Source`) would save unescaped and parse as a link definition on the next open.
3. **Checkbox drawn on plain items.** Removing it needs `@lexical/list` 0.35.0 and `mdast-util-to-markdown` 2.1.2 added as direct dependencies of the web package.
4. **Path chips in chat.** Prose followed by a real extension (`km/h. See README.md`) still becomes a chip, and two relative paths in one sentence merge into one chip. Both fixes depend on whether folder names with spaces must keep working.

## 7. Decisions already made — do not reopen

| Question | The user's answer |
|---|---|
| Sources list beside an open item | Report it to Buddy as `beside` |
| New tab with a list open | Keep the selected look only; no other change |
| Partial and skipped QA checks | Leave the gaps |
| Re-checking the QA fixes live | Approved once, for C3 and V1, in the isolated instance |
| `$…$` and `\(…\)` math | Keep both styles, but never treat backslash math as math inside links |
| HTML comments in `.md` | Show as text, keep in the file |
| Reference links | Convert to inline links |
| Save style | Dash bullets and `---` rules |
| Larger audit items to fix | List and line-break fidelity; frontmatter robustness; Obsidian syntax escaped on save; MDX import and export lines |

## 8. Behaviour changes the user has been told about

- `[x](example.com)` is now treated as a workspace-relative path. Before, Lexical added `https://`.
- Relative paths whose only extension is digits (`logs/app.001`) no longer become chips in chat.
- Trailing blank lines at the end of a file collapse to one newline on edit.
- Top-level numbered lists keep their first number, and the editor shows it.
- `$3.00` in running prose now saves as `\$3.00` (one existing test expectation was changed for this).
- A literal entity in a callout title (`&amp;`) is decoded on save.

## 9. Verification record

Last run after all agents stopped:

- `bun lint`: clean.
- `bun typecheck`: 12 of 12 tasks pass.
- Web, each file run on its own, all pass: all 17 `markdown-bench-*.test.*` files, `presented-media-paths`, `markdown-link-decoration`, `directory-workspace-lifecycle`, `mermaid-viewport-centering`.
- Buddy, all pass: `notes/note-file`, `notes/library-and-capture`, `learning/bench-turn-context`, `learning/bench-read-context`.

Not done:

- No Markdown fix has been seen in the running app.
- `bun fmt` has not been run.
- Nothing is committed.

## 10. Isolated desktop QA harness

Only use this if the user approves live verification again.

- Scripts are in `.pr-review/desktop-qa/` (git-ignored): `launch.ts`, `restart.ts`, and `relaunch-with-prep.ts`.
- They run the desktop app against a temporary sandbox, not the real Buddy home. The sandbox root used this session was `/var/folders/6b/_tpzqtks48d18kr7zb8w4t800000gn/T/buddy-desktop-behavior-qa-KFdkgk`; it is a temp directory and may be gone. Check before relying on it.
- The dev app's bundle id was `ai.buddy.desktop.dev.4f1c6ef356eabe96`. The instance was quit at the end of the session.
- Stop only an instance you started yourself.

## 11. Small traps hit this session

- The shell's working directory drifts after `cd` in a compound command. Use absolute paths.
- `cat -v` is aliased to `bat` on this machine and fails; use the Read tool.
- `git mv -k` silently does nothing on an untracked file; use `mv`.
- Background agents write test files that pass their own run but fail the repository lint. Always run lint and typecheck yourself after an agent reports.
- An agent that is stopped cannot be resumed with its context. Ask for a written handoff before stopping one.
