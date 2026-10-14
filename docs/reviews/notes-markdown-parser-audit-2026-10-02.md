# Notes / Markdown / MDX parser and round-trip audit — 2026-10-02

Research ledger. Nothing here has been fixed. Every entry carries a status:

- **reproduced** — triggered with the exact input shown, by running the real code.
- **read only** — concluded from reading the code, not run.
- **suspected** — plausible, neither run nor fully traced.
- **checked and fine** — exercised and found consistent.

Verify each item against the code before acting on it.

## Method

Two throwaway harnesses, kept outside the repository (session scratchpad, `md-audit/`):

1. **Pure transforms** — a Bun script importing `prepareMarkdownForMdxEditor`,
   `restoreMarkdownFromMdxEditor`, `prepareMdxForMdxEditor`,
   `prepareObsidianCalloutsForMdxEditor`, `restoreObsidianCalloutsFromMdxEditor`, and the server's
   `packages/buddy/src/notes/presentation.ts` / `note-file.ts` pure functions.
2. **Real editor** — the actual `MarkdownBenchEditor` component (`packages/web/src/components/bench/markdown/editor.tsx`)
   mounted in happy-dom with the production plugin list, then `handle.getMarkdown()` read back. That value is
   exactly what `onChange` hands to the file store after any edit, so it is what autosave writes
   (`use-file.ts:262-268`, 900 ms debounce). "OUT" below means that value.

Run with `bun run --preload`, never `bun test`. No product code, tests, lint, typecheck or dev server were run.
No real Buddy home, notes library or `.buddy` state was read; all inputs are synthetic strings.

Worktree state matters: `obsidian-callouts.ts` was already modified by the other session (titles encoded with
`&amp;`/`&quot;`) when these ran.

Important framing fact, **reproduced**: the editor does not rewrite a file on open. `onChange` is suppressed for
the initial normalisation (`editor.tsx:648-652`). But the first real edit anywhere re-serialises the **whole
document** through `mdast-util-to-markdown`, so every round-trip difference below lands on disk the first time
the user types a character.

Package versions read: `@mdxeditor/editor` 4.0.3, `micromark-extension-directive` 3.0.2,
`mdast-util-directive` 3.1.0, `mdast-util-to-markdown` 2.1.2, `mdast-util-from-markdown` 2.0.3,
`lexical` 0.35.0, `yaml` 2.9.0, `js-yaml` 4.1.1.

---

## A. Content deleted or hidden

### A1. Callout body is blanked, then deleted on focus + blur — **reproduced**

Input:

```
Intro

> [!quote]- Title
> The ratio is key:value and it worked :D
> second line

Outro
```

What happens: the callout renders with its title and an **empty body**. No processing error is reported
(`onProcessingResult` never fires with an error, so status stays "ready"). Dispatching `focus` then `blur` on the
body's nested contenteditable, with no typing, makes `getMarkdown()` return

```
Intro

> [!quote]- Title

Outro
```

and `onChange` fires with that value, so autosave writes the deletion.

Why: the body is imported by MDXEditor's `NestedLexicalEditor` (`dist/plugins/core/NestedLexicalEditor.js:96-119`)
inside `editor.update()` with no try/catch. `key:value` and `:D` parse as `textDirective` nodes
(micromark-extension-directive accepts `:name` after any non-colon character). No descriptor matches a
`textDirective` (`plugins/directives.tsx:268-272` registers only container descriptors) and
`escapeUnknownTextDirectives` is not passed (`use-editor-plugins.ts:110-112`), so the import throws
`UnrecognizedMarkdownConstructError`, Lexical rolls the update back and logs to console. On `BLUR_COMMAND`
(`NestedLexicalEditor.js:136-146`) the empty nested tree is exported and replaces the directive's children.

Same result, each **reproduced** with focus + blur:

- `> [!note] T\n> it worked :D` → `> [!note] T`
- `> [!note] T\n> see [text][ref]\n>\n> [ref]: https://example.com` → `> [!note] T` (`linkReference`)
- `> [!note] T\n> claim[^1]\n>\n> [^1]: https://example.com` → `> [!note] T`
- `:::note\nuse npm run build:prod\n:::` → `:::note\n:::` (admonition directive, not a callout)

Table cells use the same nested editor. `| a | b |\n|---|---|\n| key:value | x |` renders the cell **blank**
(**reproduced**); focus + blur threw `TypeError: undefined is not an object (evaluating 'mdast.children[0].children')`
and left the Markdown unchanged in that probe. Typing into the blank cell replacing the hidden text is **read only**.

Relevance to session notes: Buddy writes the quoted assistant message as a callout body
(`packages/buddy/src/notes/presentation.ts:73-85`). Any quoted message containing `word:word`, `:D`, `:P`,
`build:prod`, `nginx:latest`, a reference-style link, or a footnote definition hits this.

### A2. HTML comments are deleted from `.md` files — **reproduced**

- `before\n\n<!-- a comment -->\n\nafter\n` → OUT `before\n\nafter`
- `text <!-- note --> more\n` → OUT `text  more`
- inside a callout body: `> [!note] T\n> before <!-- hidden --> after` → `> [!note] T\n> before  after`

Why: `compatibility.ts:213-219` deliberately leaves comments unescaped ("safe HTML ranges"), and MDXEditor's
`commentFromMarkdown` (`dist/mdastUtilHtmlComment.js`) handles the token with `this.buffer()` / `this.resume()`
and creates no node. The comment never reaches Lexical, so it is absent from the export.

### A3. Text-directive-looking prose sends the whole document to source mode showing internal syntax — **reproduced**

Inputs (each alone in a `.md` file): `Ratio is key:value here.`, `Note:this and localhost:port and nginx:latest`,
`it worked :D`.

What happens: `markdownProcessingError$` is set with
`Parsing of the following markdown structure failed: {"type":"textDirective","name":"value"}`;
`markdownBenchErrorRecoveryPlugin` (`plugins/editor-runtime.ts:97-131`) switches to source view. The source view
shows the **prepared** text, not the file: callouts appear as `:::obsidian-callout{kind="…" title="…"}`, `<` as
`⁠\<` (with U+2060), non-math `$` as `\$`. This is the same visible symptom as the original bug report, reachable
with no quote in any title. Saving from source mode restores correctly (`getMarkdown()` equalled the input).

Other constructs that take the same path, **reproduced**:

- reference links / definitions: `[text][ref]\n\n[ref]: https://example.com "T"` → `linkReference` error
- leaf directives: `::youtube[Video]{#abc}` → `leafDirective` error
- HTML with an unquoted attribute: `<a href=https://x.com>link</a>` → `Error parsing markdown: Unexpected character …`

Not errors (checked): `At 10:30am and ratio 3:2` (digit after colon), `status:: done`, `Nice :smile: day`.

### A4. Editor crashes on frontmatter js-yaml cannot load — **reproduced** (as a thrown render error in the harness)

- `---\ntitle: Cost $5\nprice: $20\n---\n\nBody\n` → render throws
  `YAMLException: can not read a block mapping entry…` because the math pass rewrote the YAML to
  `title: Cost $5\nprice:$20` (see B2).
- `---\nurl: <https://example.com>\n---\n\nBody\n` → render throws `bad indentation of a mapping entry`, because the
  autolink pass rewrote the YAML line to `url: [https://example.com](<https://example.com>)` (see B3).

Why it throws rather than degrades: MDXEditor's `FrontmatterEditor` calls
`Object.entries(YamlParser.load(yaml))` in a `useMemo` with no guard (`dist/plugins/frontmatter/FrontmatterEditor.js`).
Whether a React error boundary above the Bench surface contains this was **not checked**. Frontmatter that is
invalid YAML on disk, or valid YAML that is not a mapping, would take the same path — **read only**.

---

## B. Content changed on save (the user did not ask for it)

### B1. Math normalisation matches delimiters across the whole document — **reproduced**

`normalizeBuddyMathForMdxEditor` (`compatibility.ts:354-411`) calls `matchBuddyInlineMath(rest-of-document)` at
every unprotected index. `findEndOfMath` (`components/markdown/markdown-math.ts:127-149`) has no line, paragraph
or block bound, and scans straight through code blocks and inline code looking for the closing delimiter. The
matched text is `.trim()`med and re-emitted as `$…$`, which deletes the whitespace next to the closing delimiter
wherever it was.

| Input | OUT |
|---|---|
| `Cost is $5.\n\n```sh\necho $HOME\n```\n` | `Cost is \$5.\n\n```sh\necho$HOME\n```` — code block content changed |
| ``Use `$x` and $y then `$z`.`` | ``Use `$x` and $y then `$z\`.`` — inline code broken |
| `See [[Costs $5]] and [[Plan $10]].` | `See [[Costs $5]] and [[Plan$10]].` — wikilink target changed |
| `Price: $5\n\nSome text.\n\nOther price: $7` | `Price: \$5\n\nSome text.\n\nOther price:\$7` |
| `Either $5, $10 or more.` | `Either $5,$10 or more.` and `5,` renders as math |
| `Between $5-$10 or $20/month or $200/year.` | `Between $5-$10 or $20/month or$200/year.` and renders as math |
| `Run echo $HOME and $PATH now` | `Run echo $HOME and$PATH now`, `HOME and` renders as math |
| `First \(a here.\n\n- list item\n\nSecond b\) there.` | `First \$a here.\n\n* list item\n\nSecond b\$ there.` — parentheses replaced by dollars |
| `Array \[0 index.\n\n## Heading\n\nclose \] here.` | `Array \$0 index.\n\n## Heading\n\nclose\$ here.` |

### B2. The math pass rewrites frontmatter, callout titles and link text — **reproduced**

The protected ranges are only `code`, `inlineCode` and `html` nodes from a plain `fromMarkdown()` with no
frontmatter extension (`compatibility.ts:339-352, 360-367`).

- Frontmatter: `---\ntitle: Cost $5\nprice: $20\n---` is prepared as `price:$20` (and crashes, A4).
- Callout title: `> [!quote]- costs $5 and $10 today\n> body` → the title **displays** `costs \$5 and \$10 today`
  and OUT is `> [!quote]- costs \$5 and \$10 today\n> body`. Order of operations: callouts are converted first,
  then the math pass escapes `$` inside the directive attribute (`compatibility.ts:418-420`); directive
  attributes have no backslash escapes, so the backslash is literal.
- Literal escaped brackets/parens, which are valid CommonMark, become math permanently:
  `literal \[x\] brackets` → `literal $x$ brackets`; `\[not math\]` → `$$\nnot math\n$$`;
  `call f\(x\) now` → `call f$x$ now`.

### B3. Two-step corruption: the serialiser's own escapes are read back as math — **reproduced**

`mdast-util-to-markdown` escapes `(`/`)` in link destinations and `[`/`]` in link text. On the next open those
escapes match the `\(…\)` / `\[…\]` math delimiters.

| Round 0 (file) | After first edit | After second edit |
|---|---|---|
| `[wiki](https://en.wikipedia.org/wiki/Foo_(bar))` | `…/Foo_\(bar\))` | `…/Foo_\$bar\$)` — URL destroyed |
| `[see [x] here](https://x.com)` | `[see \[x\] here](…)` | `[see $x$ here](…)` |
| `![fig [1] here](a.png)` | `![fig \[1\] here](a.png)` | `![fig 1 here](a.png)` |

Also the autolink pass (`compatibility.ts:77-104`) operates on a tree that sees frontmatter as body text:
`---\nurl: <https://example.com>\n---` is prepared as `url: [https://example.com](<https://example.com>)`.

### B4. Links and images with angle-bracket destinations are turned into plain text — **reproduced**

- `[b](<path with spaces.md>)` → displayed as literal `[b](<path with spaces.md>)`, OUT `\[b]\(<path with spaces.md>)`
- `![alt](<my image.png>)` → OUT `!\[alt]\(<my image.png>)`

Why: `collectMarkdownAnglePlaceholderReplacements` (`compatibility.ts:158-183`) escapes every `<` not inside code,
a reserved autolink replacement, or a "safe HTML" range. The `<` of a link destination is none of those, so
`⁠\<` is inserted and the link no longer parses. Stable after the first save (the link is gone for good).

### B5. Restore strips backslash escapes between `<` and the next `>` on a line — **reproduced**

- `a < b \*not em\* > c` → OUT `a < b *not em* > c` (literal asterisks become emphasis on next open)
- `if a < b then *x* and 2 \* 3 and \_y\_ > c` → OUT `if a < b then *x* and 2 * 3 and _y_ > c`

Why: `restoreMarkedEscapedAngles` (`compatibility.ts:118-156`) assumes everything from an inserted `⁠\<` to the
next `>` is one placeholder and removes every `\`+ASCII-punctuation in between (line 151).

### B6. Callout body containing `:::` or a directive — **reproduced**

- `> [!note] T\n> before\n> :::\n> after` → OUT `> [!note] T\n> before\n\nafter\n\:::` (text leaves the callout, stray `\:::`)
- `> [!note] T\n> :::tip\n> inner\n> :::\n> after` → OUT
  `::::obsidian-callout{kind="note" title="T"}\n:::tip\ninner\n:::\n::::\n\nafter\n\:::` — **internal directive
  syntax written to disk**. `mdast-util-directive` widens the outer fence to four colons when a container is
  nested; `OBSIDIAN_CALLOUT_DIRECTIVE_START_PATTERN` (`obsidian-callouts.ts:3`) only matches exactly three.
- `> [!note] T\n> ```md\n> :::\n> ```` → OUT `> [!note] T\n> ```md\n> ```\n\n```\n:::\n```` — the container's
  closing-fence check runs per line and does not know it is inside a code fence, so the directive ends at the
  `:::` inside the code block.

The pure prepare/restore pair also disagrees without the editor: `restore(prepare("> [!note] T\n> before\n> :::\n> after\n"))`
is `> [!note] T\n> before\nafter\n:::\n`.

### B7. Nested callouts are escaped — **reproduced**

`> [!note] Outer\n> text\n> > [!tip] Inner\n> > inner text` → inner renders as a plain quote reading
`[!tip] Inner`, OUT `> [!note] Outer\n> text\n>\n> > \[!tip] Inner\n> > inner text`. The prepare loop consumes the
inner lines as body and never recurses (`obsidian-callouts.ts:183-190`); the wikilink extension's unsafe rule then
escapes `[` (`plugins/obsidian.tsx:301-305`).

### B8. Serialiser normalisation that changes meaning — **reproduced**

| Input | OUT | Loss |
|---|---|---|
| `5. five\n6. six` | `1. five\n2. six` | list start number |
| `2024. A year` | `1. A year` | the number is content |
| `line one  \nline two` and `line one\\\nline two` | `line one\nline two` | hard break → soft break (`LexicalLinebreakVisitor` emits a text `\n`) |
| `para\n\n    indented code\n\nafter` | `para\n\nindented code\n\nafter` | indented code block becomes a paragraph (`mdxMd()` disables indented code) |
| `Claim.[^1]\n\n[^1]: The note text.` | `Claim.\[^1]\n\n\[^1]: The note text.` | footnote syntax escaped |
| `#project/alpha` (line start), `- #todo item` | `\#project/alpha`, `* \#todo item` | Obsidian tag at line start |
| `- [ ] task\n- plain item` | `* [ ] task\n* [ ] plain item` | plain item gains a checkbox |
| `- [/] in progress\n- [-] cancelled` | `* \[/] in progress\n* \[-] cancelled` | Obsidian custom task statuses |
| `- one\n\n- two` | `* one\n* two` | loose list → tight |
| `Text $$x$$ inline.` | `Text $x$ inline.` | display → inline |
| `- item\n\n  $$\n  x = 1\n  $$` | `* item\n\n$$\nx = 1\n$$` | math block leaves the list item |
| `<div class="box" align="center">\n\ncontent\n\n</div>` | `<div class="box" align="center">\n  content\n</div>` | blank lines removed, so other renderers treat the content as raw HTML |

### B9. Serialiser normalisation that only changes bytes — **reproduced**

`MARKDOWN_SERIALIZATION_OPTIONS` (`editor.tsx:175-178`) sets only `listItemIndent` and `resourceLink`.

- `- ` / `+ ` bullets → `* `; `1)` → `1.`; `---` / `___` / `* * *` → `***`; `_em_` / `__strong__` → `*em*` / `**strong**`
- setext headings → ATX; `## Title ##` → `## Title`; `~~~` fences → backtick fences; `~single~` → `~~single~~`
- `snake_case` → `snake\_case`; `2 * 3` → `2 \* 3`; `AT&T` → `AT\&T`; `[x]` / `array[0]` → `\[x]` / `array\[0]`;
  `:smile:` → `\:smile:`; `# C# and F#` → `# C# and F\#`
- `It costs $5 today.` → `It costs \$5 today.` (the `\$` is inserted by Buddy's prepare step and never removed)
- entities decoded: `&amp;` → `&`, `&copy;` → `©`, `&nbsp;` → a literal U+00A0, `&lt;div&gt;` → `\<div>`
- link destinations: `?a=1&b=2` → `?a=1\&b=2`; `Foo_(bar)` → `Foo_\(bar\)` (then B3)
- bare URL `https://example.com/a_b` → `<https://example.com/a_b>`
- tables re-padded, `|---|:-:|` → `| - | :-: |`
- `<img src="a.png" width="100" />` → `<img width="100" src="a.png" />`
- `\(E = mc^2\)` → `$E = mc^2$`; `\[ … \]` → `$$ … $$`; one-line `$$y = 1$$` → three lines; bare `\begin{align}` wrapped in `$$`
- `[[ Note ]]` → `[[Note]]`; `[[Note|Note]]` → `[[Note]]`
- runs of blank lines collapsed; leading blank lines removed; trailing spaces removed
- **final newline removed**: MDXEditor publishes `theNewMarkdownValue.trim()` (`dist/plugins/core/index.js:288`)
- **CRLF → LF for the whole file**: `> [!note] T\r\n> body\r\n\r\ntext\r\n` → `> [!note] T\n> body\n\ntext`

### B10. Lazy continuation leaves the callout — **reproduced**

`> [!note] T\n> body\nlazy continuation\n\nnext` → OUT `> [!note] T\n> body\n\nlazy continuation\n\nnext`.
CommonMark and Obsidian keep the lazy line inside the quote.

### B11. Callout title entity decoding over-decodes (residual of the in-progress fix) — **reproduced**

`> [!note] R&D &amp; "q" 'a' &#x22; &lt;\n> body` → OUT `> [!note] R&D & "q" 'a' " &lt;\n> body`.
The title displays correctly. On export `mdast-util-directive` encodes only the quote character and leaves `&`
alone, so a literal `&amp;` or `&#x22;` in the user's title is indistinguishable from an encoded one, and
`decodeDirectiveAttributeValue` (`obsidian-callouts.ts:109-124`) decodes both.

---

## C. Rendered wrongly, file unchanged

### C1. Callout kind matching is case-sensitive and has no aliases — **reproduced**

`> [!WARNING]\n> Careful` renders with the label `Note` and the neutral tone; `> [!faq]\n> q` renders `Note`.
`isMarkdownBenchAdmonitionName` (`plugins/directives.tsx:85-89`) is an exact `Object.hasOwn` on fifteen lower-case
names. GitHub alerts are upper-case; Obsidian is case-insensitive and has aliases (`summary`, `tldr`, `todo`,
`hint`, `check`, `done`, `help`, `faq`, `attention`, `fail`, `missing`, `cite`).

### C2. Callout title shows prepare-step artefacts — **reproduced**

- `> [!note] use <T> generics` → label text is `use ⁠\<T> generics` (U+2060 + backslash). File round-trips.
- `> [!note] use `code` and **bold** and [[Link]]` → label shows the Markdown literally.

### C3. Valid HTML shown as literal text — **reproduced**

`line<br>next`, `<img src="a.png" width="300">`: escaped by the angle pass because the tag is neither
self-closing nor closed, so the editor shows the tag source. File round-trips unchanged.

---

## D. Session notes written by the server (`packages/buddy/src/notes`)

Writer: `renderMessageQuote` / `quotedMessageBody` / `renderSessionNoteEntry` in `presentation.ts:46-150`,
called from `chat-capture.ts:158-268`. The pure functions were run with synthetic message text and the output
was then mounted in the real editor.

### D1. "Open message" link is dead in the Bench editor — **reproduced** (happy-dom)

The writer emits `> [Open message](buddy://chat/<sessionID>?message=<messageID>)` (`presentation.ts:78-83`).
In the editor the anchor's `href` attribute is `about:blank`, the click handler (`editor.tsx:482-494`) passes
`"about:blank"` to `onOpenLink`, `readChatMessageLink` (`features/notes/notes-markdown-document.tsx:43-53`)
returns `undefined`, and `resolveMarkdownBenchLink` returns `undefined`. Nothing happens.

Why: `@lexical/link` 0.35.0 `LinkNode.sanitizeUrl` (`LexicalLink.dev.mjs:26, 102-113`) sets the DOM `href` to
`about:blank` for any protocol other than `http:`, `https:`, `mailto:`, `sms:`, `tel:`. The Markdown itself
round-trips (the node keeps the real URL).

Same result for `obsidian://open?…` (which `link-navigation.ts:4` lists as a safe scheme), `file:///…`,
`zotero://…`, `C:/notes/a.md`, and a relative link whose first segment contains a colon (`Note:%20sub.md`).
`https://…` and `./other.md#frag` work. Should be confirmed once in the real app; the sanitiser is plain JS and
not environment-dependent.

### D2. A `$` in the quoted message corrupts the note on first edit — **reproduced**

Server output for message text `It costs $5 today.`:

```
> [!quote]+ It costs $5 today.
> It costs $5 today.
>
> [Open message](buddy://chat/ses_01abc?message=msg_01xyz)
```

Prepared text has the body line as `It costs$5 today.` and OUT is `> It costs\$5 today.` — a space deleted and a
backslash added. The title repeats the first 120 characters of the body, so the `$` in the title pairs with the
`$` in the body (B1). With two amounts (`It costs $5 and $10 per month`) OUT is title
`It costs \$5 and $10 per month`, body `It costs$5 and \$10 per month`, and the body renders `5 and \` as math.

### D3. Quoted message body triggers A1, A2, B6, B7 — **reproduced**

Message text → effect once the note is opened in the editor:

- `Run `npm run build` then check key:value pairs.` / `Great job :D keep going` /
  `See [docs][1].\n\n[1]: https://example.com` → callout body blank, including the "Open message" link (A1)
- `Docusaurus:\n\n:::note\nhello\n:::` → OUT contains
  `::::obsidian-callout{kind="quote" fold="+" title="Docusaurus: :::note hello :::"}` and the "Open message"
  link ends up outside the callout followed by `\:::` (B6)
- `> [!tip] Remember\n> this\n\nok` → `> > \[!tip] Remember` (B7)
- `Visible <!-- hidden --> text` → `> Visible  text` (A2)
- `\(x\)` in the body → `$x$` on save; the title already has the backslashes stripped (`presentation.ts:77`)

### D4. Title truncation can split a surrogate pair — **reproduced**

`noteMessageExcerpt` (`presentation.ts:41-44`) does `text.slice(0, length)`. With 119 ASCII characters followed
by `😀`, the title ends in a lone `\ud83d` before the `…`. Written as UTF-8 that becomes U+FFFD. Same slice in
`plainTextPreview` (`presentation.ts:34-38`).

### D5. Frontmatter is re-serialised on every body save — **read only**

`updateNote` (`library.ts:319-342`) writes `renderNoteSource(input.content, note.metadata)`, and
`renderNoteSource` (`note-file.ts:96-99`) is `stringifyYaml(parsedMetadata)`. For a Buddy-stamped note the
frontmatter text is therefore regenerated from parsed values each time the editor saves the body: comments,
quoting style, flow-vs-block style and key formatting the user added in another tool are not preserved, and
line endings become `\n`. The schema is `.passthrough()` so extra keys survive as values. Not run.

Also **read only**: `parseNoteSource` (`note-file.ts:17, 76-94`) requires the file to start with `---` exactly, so
a Buddy note saved with a BOM by another tool is treated as a plain note and its frontmatter is sent to the
editor as body text.

### Writer behaviour checked and fine (**reproduced**, pure functions)

- Titles containing `"`, `[`, `]`, backticks, `|`, `#`, `&`, entities, a leading `>`, `[!quote]`: one line, no
  newline, `\ < >` removed. After the other session's encoding fix these render.
- First line with newlines, CRLF, tabs: whitespace collapsed into one title line.
- Headings outside fences become `**bold**`; headings inside fences are untouched; a closing fence with
  trailing text is correctly not treated as a close; an unclosed fence gets a closing fence appended; nested
  four-backtick fences are tracked.
- Empty/whitespace message and image-only message produce `> [!quote]+` with no title.
- Not converted, by reading the output: setext headings (`Title\n=====`) and `# heading` inside a nested quote
  or list stay headings inside the callout.

---

## E. MDX path (`.mdx`, `prepareMdxForMdxEditor`, `jsxPlugin`)

### E1. `export` statements and most `import` statements are deleted or rewritten — **reproduced**

| Input | OUT |
|---|---|
| `export const x = 1\n\n# T` | `# T` |
| `export default function Layout({ children }) { return children }\n\n# T` | `# T` |
| `export const meta = { title: 'x' }\n\n# {meta.title}` | `# {meta.title}` |
| `import './x.css'\n\n# T` | `# T` |
| `import B from './b'\n\n# T` | `# T` |
| `import { A, B } from './ab'\n\n<A />` | `import { A } from './ab'\n\n<A />` |
| `import { A as Z } from './a'\n\n<Z />` | `import { Z } from './a'\n\n<Z />` — wrong export name |
| `import * as UI from './ui'\n\n<UI.Button />` | `<UI.Button />` — import gone |
| `import B from './b'\nimport A from './a'` (both used) | reordered, one per paragraph |
| `import A from "./a"` | `import A from './a'` |

Why: MDXEditor regenerates imports from the components it saw used (`dist/exportMarkdownFromLexical.js:98-150`)
and has no export path for other `mdxjsEsm` nodes.

### E2. Other MDX results — **reproduced**

- `<!-- a comment -->` → `{/* a comment */}` permanently (`compatibility.ts:310-337`); no restore.
- `<!-- has */ inside -->` → source mode with a JSX parse error (the conversion is skipped, line 328).
- `para\n\n    <!-- in indented code -->` → source mode: the comment pass skips it as CommonMark indented code,
  but MDX has no indented code.
- `a { b`, `a<br>b`, `key:value` → source mode. `a < b` → `a \< b`.
- `<Callout type="info">\n\nHello\n\n</Callout>` → `<Callout type="info">\n  Hello\n</Callout>`.
- Fine: `{1 + 1}`, `<Chart data={[1,2,3]} />`, inline JSX, frontmatter, callouts, `<div className>` / `<div class>`.

---

## F. Additional line-ending and frontmatter results — **reproduced**

- CRLF file → **mixed** endings, not just LF: `# Title\r\n\r\npara one\r\npara two\r\n\r\n- a\r\n- b\r\n` →
  `# Title\n\npara one\r\npara two\n\n* a\n* b`. Soft breaks inside a paragraph keep `\r\n`; block separators
  become `\n`.
- Leading BOM is removed on save (`\uFEFF# Title` → `# Title`).
- Editor render throws (A4) for: `---\n# just a comment\n---` (`Object.entries(undefined)`),
  `---\na: 1\na: 2\n---` (duplicated mapping key), `---\ntitle: Note: the sequel\n---` (invalid YAML).
  No React error boundary exists under `packages/web/src` except the chemistry renderer's, and the router is
  created without an `errorComponent` (`app.tsx:44`), so the route-level default handles it — **read only**.
- Frontmatter values are rewritten by the math pass: `re: '\(x\)'` → `re: '$x$'`.
- `---\ntitle: x\n...\n` (YAML document-end marker): the callout pass treats it as frontmatter
  (`obsidian-callouts.ts:10`), micromark does not; OUT `***\n\ntitle: x\n...`.
- Fine: empty frontmatter `---\n---`, scalar or list frontmatter, a tab after the colon, Templater `<% %>` in a
  value, quoted `"[[Other Note]]"`, block sequences, frontmatter-only file, empty file.

---

## Not covered

- **Chat transcript renderer** (`packages/web/src/components/markdown/`: `markdown-parser.ts`,
  `markdown-segments.ts`, `markdown-html-segment.tsx`, `Markdown.tsx`, the worker files). Only
  `markdown-math.ts` was read, because the Bench path imports its matchers. Whether the chat renderer shares the
  cross-block `$` pairing (B1) was not tested; the code suggests its `marked` inline tokenizer is bounded by the
  paragraph, but that is **suspected**, not run. Callout handling, sanitisation and streaming in the chat
  renderer were not examined.
- `MarkdownHtmlSegment` as used for `![[note]]` embed previews (`plugins/obsidian.tsx:433-477`).
- `read-only-markdown-bench-view.tsx`, `markdown-wysiwyg-file-editor.tsx`, `markdown-file-editor.tsx`.
- Bench plugins `chemistry.tsx`, `mermaid.tsx`, `svg.tsx`, `mdx-intrinsic.tsx`, `mdx-generic-component.tsx`.
- `agent-edits.ts`, `use-rename.ts`, `note-title.ts`, `property-values.ts`, `notes-wikilinks.ts`, `use-wikilinks.ts`.
- Server: `project-file-editor-service.ts` (the non-notes save path — whether it normalises content, encoding or
  line endings on read/write), `library-index.ts`, `session-title-sync.ts`, `images.ts`. D5 was read, not run.
- Source-mode editing (CodeMirror) and the diff view beyond confirming `getMarkdown()` restores correctly.
- Paste, drag-and-drop, markdown shortcuts and undo/redo. Typing was not simulated; "on first edit" results are
  the editor's own serialisation read via `getMarkdown()`, plus synthetic `focus`/`blur` events for A1.
- Tables with multi-line or block content in cells, images with dimensions, footnotes with multi-paragraph
  bodies, very large documents (the math pass slices the remaining document at every index).
- Real Chromium behaviour. Everything "reproduced" ran in happy-dom under Bun.

---

## Checked and fine

All **reproduced** through the real editor unless noted; "fine" means OUT equals the input apart from the final newline.

- Callout title with `"`, `'`, `{`, `}`, backticks, brackets, a `:` (`Ratio a:b here`), `$x^2$`
- Callout with fold `+`/`-`, custom type `[!my-type]+`, empty body, `>`-only blank body lines, tab or three spaces after `>`
- Callout inside a bullet and an ordered list item; two callouts separated by a blank line; callout directly after frontmatter
- Callout body with a fenced code block (no `:::` inside), a table, a list, a heading, a nested plain quote
- Callout examples inside a top-level fenced code block are left alone (`protectedMarkdownLineIndexes`)
- Wikilinks `[[Note]]`, `[[Folder/Note|alias]]`, `[[Note#Heading]]`, `[[Note#^block]]`; embeds `![[image.png]]`,
  `![[image.png|100]]`; wikilink in a heading, in link text, in a table cell with `\|`; `[[…]]` inside code
- Angle autolinks `<https://…>`, `<me@example.com>`; placeholders `<T>`, `<name>`, `a < b`, `x <- y`, `<3`;
  Templater `<% … %>`; JSX-looking text in `.md`
- `{{date}}`, `{a}`, `{ b }` in `.md`
- Inline HTML `<sub>`, `<kbd>`, `<span style>`; `<br/>`
- `%%hidden comment%%`, block id `^abc123`, `status:: done`
- Frontmatter with a comment line, a flow sequence and a date; frontmatter containing `<b>`
- Fenced code with unknown language, with meta (`js title="x.js" {1,2}`), with no language
- `$x^2$`, `$$\n…\n$$`, `$50\%$`, already-escaped `\$5`
- Images `![alt](img.png "t")`, `![a b](img%20one.png)`, `![](../Attachments/01ABC.png)`
- `[Open message](buddy://chat/ses_01abc_def?message=msg_01xyz_q)`
- Unicode, tabs, non-breaking spaces, a zero-width space
