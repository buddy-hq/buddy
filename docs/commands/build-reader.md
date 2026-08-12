# Guidelines for Building and Extending Buddy's Document Reader

## Production Entry Point

The production reader route is:

```txt
packages/web/src/components/directory-chat/directory-chat-reading-reader-pane.tsx
  -> packages/web/src/components/readers/document-reader.tsx
```

`DocumentReader` is the only product-level reader entry point. Do not route a document directly to an engine from a feature or page.

## Engine Split

Buddy has one reader interface with format-specific rendering engines:

- EPUB uses `foliate-js` through `FoliateReader`.
- PDF uses the exact direct `pdfjs-dist` dependency through `PdfReader` and PDF.js viewer-layer components.
- Production resource discovery currently admits `.epub` and `.pdf`. Other ebook formats are future routing work, even when Foliate can parse them.

Keep product concerns in Buddy-owned reader code:

- toolbar, popovers, panels, dialogs, preferences, and help
- versioned document state
- bookmarks, annotations, and search result view models
- selection-to-chat staging and removal
- active reading state and prompt context

Keep engine concerns behind the adapter:

- rendering and teardown
- format-specific navigation
- text selection extraction
- search execution and match highlighting
- annotation overlay geometry
- location events and display modes

## Contracts and Persistence

Shared persisted and cross-package anchor types live in:

```txt
packages/reader-contract/src/index.ts
```

Use discriminated `ReaderPositionAnchor` and `ReaderTextAnchor` values throughout shared code. EPUB uses CFI anchors. PDF uses page/ratio position anchors and crop-relative canonical PDF text quads. Never encode a PDF location or selection as a fake CFI.

Reader v2 preferences and per-document state live behind the repository in:

```txt
packages/web/src/components/readers/reader-storage.ts
```

New writes use the v2 neutral schema. Legacy CFI data is an inbound migration concern only. PDF state must be associated with a stable source id and a PDF fingerprint when available so changed bytes do not silently inherit stale geometry.

## PDF.js Runtime

PDF.js runtime and packaging are centralized in:

```txt
packages/web/src/components/readers/pdf/pdfjs-runtime.ts
packages/web/scripts/create-pdfjs-vite-plugin.ts
```

Do not add a CDN, iframe, stock PDF.js application shell, or an independently versioned worker. API and worker versions must match. The Vite integration owns worker, CMaps, standard fonts, WASM, ICC profiles, viewer images, compatibility transforms, and scoped viewer CSS for Vite and packaged Electron.

`PDFViewer` owns one two-axis scroll container. Continuous vertical reading, zoomed horizontal panning, render prioritization, and canvas retention must not be split across nested scroll owners or a second virtualization system without profiling evidence.

PDF text geometry is persisted in unrotated PDF user space relative to the crop box. Convert through the active page viewport at the boundary and add the crop origin only when rendering. DOM pixels, current scale, and current rotation are never persisted.

## References

- Foliate engine API reference: `~/code/foliate-js`
- Foliate behavior/UI reference: `~/code/foliate`
- Foliate integration incident guide: `docs/features/reader/foliate-gotchas.md`
- PDF.js API/viewer reference: the pinned `packages/web/node_modules/pdfjs-dist` source and official PDF.js documentation
- Long-term decision, baseline matrix, risks, and gates: `docs/reader/pdf-long-term.md`

Buddy may use `foliate-js` but must not copy GPL Foliate app source. Build shared UI with Buddy components and tokens, using the references for behavior rather than visual source copying.

## Workflow

1. Identify whether the change is product-shell behavior or engine behavior.
2. Inspect the relevant upstream/reference implementation and Buddy's existing neutral contract.
3. Extend a shared type or module before duplicating logic in an engine.
4. Keep format-specific modes discriminated; do not force EPUB typography settings onto PDF or PDF layouts onto EPUB.
5. Add runtime tests for observable behavior, persistence boundaries, cancellation, or geometry; do not test what TypeScript already guarantees.
6. Verify only changed-package tests, then run repository `bun lint` and one root `bun typecheck` for completion.
7. For PDF changes, verify continuous layout, fit modes, numeric zoom, horizontal panning, rotation, selection/annotations, search, rapid source replacement, and bounded rendered canvases.

Use `.agents/skills/buddy-frontend` for Buddy frontend architecture and interaction guidance. Use the shadcn/Buddy UI skill when composing shared reader controls.
