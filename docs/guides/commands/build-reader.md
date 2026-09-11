# Guidelines for Building and Extending Buddy's Document Reader

## Production Entry Point

The production reader route is:

```txt
packages/web/src/components/directory-chat/directory-chat-reading-reader-pane.tsx
  -> packages/web/src/components/readers/document-reader.tsx
```

`DocumentReader` is the single product-level reader entry point. Do not route a document directly to an underlying engine from a feature or page.

---

## Engine Split & Architecture

Buddy provides a unified reader interface with format-specific rendering engines:

- **EPUB:** Uses `foliate-js` via `FoliateReader`.
- **PDF:** Uses the exact pinned `pdfjs-dist` dependency via `PdfReader` and PDF.js viewer-layer components.
- Production resource discovery currently admits `.epub` and `.pdf`.

### Ownership Boundaries

- **Product Concerns (Buddy-owned):** Toolbar, popovers, panels, dialogs, preferences, help, versioned document state, bookmarks, annotations, search result view models, selection-to-chat staging, active reading prompt context.
- **Engine Concerns (Behind Adapter):** Rendering, teardown, format-specific navigation, text selection extraction, search execution, highlight overlays, geometry calculations, location events, display modes.

---

## License Boundary & Upstream Foliate Integration

- **License Boundary:**
  - The `foliate` desktop app repository is **GPL**.
  - The `foliate-js` repository is **MIT**.
  - The `PDF.js` assets used by `foliate-js` are **Apache 2.0**.
  - Buddy must **never** copy GPL implementation code from the Foliate app into Buddy-owned packages. It is fully acceptable to use `foliate-js` directly as an MIT package dependency.
- **Dependency Pinning:**
  - The published `foliate-js@1.0.1` npm package omitted bundled `pdf.js` assets and failed with `UnsupportedTypeError` when opening PDFs.
  - Buddy pins `packages/web` directly to the known-good upstream source commit used by the official Foliate desktop submodule:
    `github:johnfactotum/foliate-js#399248a67a8862ffb5e6463a33f9d52b317ca2eb`

---

## Vite & Runtime Integration Gotchas

1. **Vite Cache Invalidation:**
   - After updating the `foliate-js` dependency pin, Electron/Vite may serve stale prebundled output from `packages/desktop-electron/node_modules/.vite`.
   - If runtime behavior diverges from the source pin, clear generated `.vite` caches and restart the application.
2. **`optimizeDeps` Exclusions:**
   - Vite dependency optimization can incorrectly prebundle PDF.js modules inside `foliate-js`.
   - Buddy explicitly excludes `foliate-js/view.js`, `foliate-js/pdf.js`, and `foliate-js/vendor/pdfjs/pdf.mjs` from `optimizeDeps` so the renderer loads source modules directly.
3. **Asset Resolution & Glob Import Prevention:**
   - Upstream `foliate-js/pdf.js` uses `new URL(\`vendor/pdfjs/\${path}\`, import.meta.url)`. Vite interprets template literals in `new URL()` as glob imports, dragging `.mjs.map` files into the module graph as `?import&url` (served as `application/json`), breaking browser module evaluation.
   - Buddy transforms this at the Vite layer into `new URL("./vendor/pdfjs/" + path, import.meta.url)`, preserving runtime-relative asset resolution while bypassing the glob transform.
4. **Runtime Compatibility & Teardown Shims:**
   - **`Map.prototype.getOrInsertComputed`:** Foliate/PDF.js relies on this nonstandard helper. Buddy installs this shim in the runtime before importing `foliate-js/view.js`.
   - **Paginator Null Guard:** In `foliate-js/paginator.js`, `requestAnimationFrame` callbacks can execute after view teardown. Buddy guards `this.#view?.document` to prevent `Cannot read properties of null (reading 'document')` exceptions on fast view cleanup.

---

## Contracts & Persistence

Shared persisted reader types live in:

```txt
packages/reader-contract/src/index.ts
```

- Use discriminated `ReaderPositionAnchor` and `ReaderTextAnchor` values across all reader code.
- **EPUB:** Uses CFI anchors.
- **PDF:** Uses page/ratio position anchors and crop-relative canonical PDF text quads. **Never encode a PDF location or selection as a synthetic CFI.**
- Text geometry for PDF is stored in unrotated user space relative to the page crop box. Convert through the active page viewport at boundary edges. Never persist DOM pixels, current zoom scale, or rotation.

Reader preferences and per-document state live in:

```txt
packages/web/src/components/readers/reader-storage.ts
```

- All new writes use the v2 neutral schema.
- Associate PDF state with a stable source ID and PDF fingerprint so byte changes never inherit stale geometry.

---

## PDF.js Runtime

PDF.js runtime and packaging are centralized in:

```txt
packages/web/src/components/readers/pdf/pdfjs-runtime.ts
packages/web/scripts/create-pdfjs-vite-plugin.ts
```

- Do not add CDNs, iframes, stock PDF.js viewer shells, or independently versioned workers. API and worker versions must match.
- `PDFViewer` owns a single two-axis scroll container. Do not split continuous vertical scrolling, zoomed horizontal panning, and canvas virtualization across nested scroll owners.

---

## Workflow & Verification

1. Determine whether a change affects product-shell behavior or engine-adapter behavior.
2. Extend shared types in `packages/reader-contract` before adding engine-specific abstractions.
3. Keep format-specific modes discriminated; do not leak EPUB typography concepts into PDF or PDF coordinate logic into EPUB.
4. Add runtime tests for observable behavior, persistence serialization, cancellation, and quad geometry.
5. For PDF changes, manually verify continuous layout, fit modes, numeric zoom, horizontal panning, page rotation, selection/annotations, search match jumping, rapid document switching, and memory canvas disposal.
6. Use `.agents/skills/buddy-frontend` for frontend component standards and design token usage.
