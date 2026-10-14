# Production heading navigation and Contents

**Implemented: issue 28 navigation; issue 27 native TOC. Separate, related changes.**

Heading clicks now jump directly on every click. Compatible slugs handle punctuation and duplicate headings; explicit IDs and Obsidian anchors remain supported. Pointer clicks avoid link inspection; edit through the toolbar. Document text stays unchanged.

Markdown/MDX Bench surfaces, including read-only files, now use the book-style Contents popover. It nests headings, highlights the current section, updates after edits, and closes after selection. Easel uses the same production navigation.

**Verified:** 79 focused tests, root lint and typecheck pass. Live-app verification remains pending.
