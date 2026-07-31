# Known issues — 2026-07-31

Review scope: `ux-fixes` compared with `origin/main`.

## Generated-image reuse can consume different bytes than were authorized

Priority: P2; fix before merge.

Buddy verifies a generated image by hashing its contents, but then returns only the file path and
reopens that path when preparing the image request. If the file changes between those reads, Buddy
can send bytes that were not covered by the provenance check or a new permission prompt.

For users, this is a rare permission-integrity issue. Reading large reference images twice also
increases disk I/O and memory use, which can make image editing slower or less reliable near the
configured input limits.

Recommended fix: return and consume the verified bytes or an open file handle so authorization and
request construction use the same file contents.

Affected code:

- `packages/buddy/src/learning/features/image-generation/service/generated-image-authorization.ts`
- `packages/buddy/src/learning/features/image-generation/service/image-inputs.ts`
- `packages/buddy/src/learning/features/image-generation/tools/imagegen.ts`

## Rename API can produce a file the editor cannot reopen

Priority: P2.

The rename service validates that the source is editable but does not validate the destination
format. A request such as renaming `note.md` to `note.png` can succeed and return an editable-file
result, while the next editable-file read rejects the destination with HTTP 415.

The current Markdown title UI preserves `.md` or `.mdx`, so users are unlikely to encounter this
through normal title editing. It remains a correctness trap for future UI surfaces and SDK
consumers.

Recommended fix: validate that the destination remains a supported editable format before changing
the directory entry.

Affected code:

- `packages/buddy/src/project/project-file-editor-service.ts`

## Windows-reserved note names are accepted by title validation

Priority: P2.

The note-title validator rejects invalid path characters but accepts Windows device names such as
`CON`, `NUL`, `COM1`, and `LPT1`. These remain reserved after adding a Markdown extension, so the
rename reaches the filesystem and fails on Windows.

The original note remains safe, but Windows users receive a confusing rename failure for titles
that macOS accepts.

Recommended fix: reject Windows-reserved basenames in the shared title validation and add focused
cross-platform test cases.

Affected code:

- `packages/web/src/components/bench/markdown-bench-note-title.ts`

## Validation completed during review

- Focused Buddy and web tests: 123 passed.
- `bun lint`: passed with existing warnings.
- `bun typecheck`: passed.
