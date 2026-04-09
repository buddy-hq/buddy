# File Explorer + Monaco Implementation Plan

## My Expectations

- Buddy exposes a project-scoped file explorer in the app UI so a user can browse all folders and files in the active project without leaving the app.
- The explorer is lazy-loaded. We do not eagerly enumerate or render an entire repository up front.
- The right sidebar tree shows all project files, not only code/text files. Hidden files, media files, config files, assets, and other project artifacts are part of the learning context and must be visible unless deliberately filtered by a defined rule.
- Clicking a text file opens it in-app with syntax highlighting and line numbers.
- Clicking supported non-text files opens them in an appropriate in-app viewer or fallback surface rather than failing silently.
- Files that Buddy does not render in-app by default should still open predictably via the platform default app rather than ending in a dead-end state.
- Monaco is the default editor surface for supported text files because it is already installed in `packages/web` and is a strong fit for editable text/code views. Monaco is not the universal renderer for every file type.
- Supported text files open in an editable Monaco surface in the project explorer when the file is safe to render in-app.
- Browsing arbitrary project files and editing arbitrary project files are separate capabilities. Browsing is the first-class requirement; editing is conditional on a real backend write/conflict contract.
- File access stays confined to the active project root. Path traversal and accidental cross-project access are blocked at the backend boundary.
- Binary, media, and otherwise unsupported files do not get forced through Monaco. They should show a safe fallback state or specialized viewer behavior where appropriate, but they still appear in the tree.
- Large files get predictable degraded behavior rather than trying to render everything at full fidelity. Performance and reliability take priority over fancy behavior.
- File tree state, open tabs, active file, and unsaved state stay scoped to the current project/session so switching projects does not leak UI state.
- This plan should reflect the actual runtime boundary that already exists in the repo. OpenCode vendor functionality is the starting point for project-file browsing; Buddy-owned code should add product behavior rather than re-implement core file plumbing.
- This is a full implementation plan for the file-explorer capability, but it should still separate base browsing from follow-up editing/review/parity work rather than blending them into one oversized first pass.
- The learning-assistant requirement changes the product boundary: the file tree is not just for code editing convenience; it is part of how the learner inspects the full project context.
- Out of scope unless explicitly added later: full OpenCode diff/review parity, git hunk review UI, multi-root workspace support, and full language-server feature parity across arbitrary repo files.
- The hard part is not syntax highlighting. The hard part is safe file APIs, save/conflict behavior, tree state, large-file handling, and a predictable UX contract.

## Current Code Reality

- Buddy already has a Monaco-based teaching editor, but it is scoped to tracked teaching-workspace files under `.buddy/teaching/<session>` rather than arbitrary repo files.
- Buddy now proxies OpenCode file search via `/find/file` and also exposes Buddy compatibility routes plus generated SDK operations for generic project file listing and project file reading.
- Vendored OpenCode already has project-scoped file routes for file listing and file reading, plus a file tree state model and watcher-driven refresh behavior.
- Vendored OpenCode does not currently provide a project-file write route with save/conflict semantics comparable to Buddy’s teaching workspace save flow.
- Vendored OpenCode’s current file-read contract is sufficient for text files, binary fallback, and image/svg-style preview data, but not for a full first-class pdf/audio/video preview matrix without backend changes.
- The current implementation now includes arbitrary project-text-file editing for supported in-app text files, backed by a dedicated Buddy-owned write/conflict contract rather than the teaching-workspace save flow.

## Engineering Checklist

### Scope And Product Decisions

- [x] Lock the product boundary: the right sidebar tree must expose all project files, not just text/code files.
- [x] Decide which Buddy surfaces get this capability first: directory chat only, teaching workspace, or both.
- [x] Decide whether the first shipped version is browse-only or browse-plus-edit for arbitrary repo files.
- [x] Define which file classes are editable, viewable, previewable, or fallback-only.
- [x] Define which file classes should fall back to opening in the platform default app when Buddy does not render them in-app.
- [x] If arbitrary repo-file editing is included, define save behavior for editable text files: manual save, autosave, or per-surface behavior. Autosave with `Cmd/Ctrl+S`, reload, and overwrite conflict recovery.
- [x] Define explicit non-goals so the implementation does not drift into review/diff parity work.

### Backend File Contract

- [x] Decide whether Buddy should proxy vendored OpenCode `file.list` / `file.read` routes directly or expose thin Buddy-owned wrappers over the same runtime authority.
- [x] Reuse existing OpenCode project-root containment checks instead of creating a parallel path-security implementation.
- [x] Expose a typed project-file directory list contract to the frontend.
- [x] Expose a typed project-file read contract to the frontend.
- [x] Reuse or extend the existing text vs binary detection behavior rather than inventing a separate Buddy-only classifier.
- [x] Define how the tree treats ignored files, hidden files, and explicitly excluded entries such as `.git`.
- [x] If first-class non-text preview expands beyond current image/svg support, extend the read contract deliberately instead of overloading the current text/binary shape.
- [x] If repo-file editing is in scope, add a real project-file write route with explicit version/conflict semantics rather than reusing teaching-workspace save behavior.
- [x] Add focused backend tests for traversal, missing files, list/read behavior, binary handling, and any new write/conflict contract.

### SDK And Client Contract

- [x] Expose typed SDK operations for project file directory list and project file read.
- [x] If repo-file editing is in scope, expose a typed SDK operation for project file write.
- [x] Keep route shapes small and literal so the frontend state model does not depend on backend implementation details.
- [x] Regenerate or update SDK clients only for the touched contract surface.

### Frontend State Model

- [x] Add project-scoped file explorer state for expanded directories, loaded nodes, loading/error states, and refresh behavior.
- [x] Reuse the vendor file-tree mental model for lazy directory loading and refresh behavior instead of inventing a separate tree model from scratch.
- [x] Add open-file state for active file, open tabs or single-file mode, file content load state, and viewer mode.
- [x] Only add dirty state, save state, and external-change conflict state if repo-file editing is actually enabled.
- [x] Decide whether editor state persists per project/session and how that state is restored.
- [x] Keep project file-explorer state isolated from teaching-workspace state unless we intentionally unify them later.

### Explorer UI

- [x] Build a lazy-loaded file tree in `packages/web` with folder expand/collapse behavior.
- [x] Take visual and interaction inspiration from the vendor OpenCode file-tree UI and state model where it improves clarity, instead of designing this surface in isolation.
- [x] Add empty, loading, and error states for the explorer.
- [x] Add file icons and file-type affordances appropriate to the existing design system.
- [x] Show all project files in the tree, including non-text files, with explicit handling for hidden files and ignored files instead of accidental behavior.
- [x] Add clear state treatment for files that are visible in the tree but not directly editable.
- [ ] Add predictable refresh behavior after save, external change, or project switch.

### Monaco Integration

- [x] Reuse the existing Monaco setup patterns already present in `packages/web` rather than creating a parallel editor bootstrap path.
- [x] Add extension-to-language mapping for generic project files.
- [x] Render line numbers and syntax highlighting by default for supported text files.
- [x] Support both read-only and editable modes with the same core component contract.
- [x] Add save wiring and dirty-state handling only if repo-file editing is enabled.
- [x] Add fallback behavior for unsupported languages and oversized text files.
- [ ] Verify Monaco asset loading and runtime behavior in both browser dev and Electron packaging flows.

### Non-Text File Viewing

- [x] Ship first-class in-app preview only for file classes that the current backend contract can already serve well.
- [x] Treat image and svg preview as first-pass candidates.
- [x] Route pdf and Foliate-supported ebook/comic formats through the in-app reader when the raw file contract is available; keep audio/video on the platform-default-app fallback path.
- [x] Add viewer/fallback routing so the file open action chooses Monaco, a specialized viewer, or a platform-default-app handoff based on file type.
- [x] Ensure non-text files still participate in tabs/open-file state even when they are not editable.
- [x] Define how binary and unsupported files communicate “visible but not editable here” while still offering a clear open-in-default-app action.

### Platform Integration

- [x] Add a desktop-safe open-in-default-app action for files Buddy does not render in-app by default.
- [ ] Verify the default-app handoff behavior on both macOS and Windows.
- [x] Define what happens on web/dev surfaces where native default-app handoff may be unavailable.

### Editor UX

- [x] Decide between single-file mode and tabbed file mode for the first version.
- [x] Show file name/path and viewer mode clearly.
- [x] If repo-file editing is enabled, show dirty marker and save/error state clearly.
- [x] If repo-file editing is enabled, define what happens when the user switches files with unsaved changes.
- [ ] Reuse existing watcher/event infrastructure for external file refresh if possible.
- [ ] If repo-file editing is enabled, define how external file changes are detected and surfaced.
- [ ] Ensure keyboard behavior is predictable for focus, save, and closing/opening files.

### Performance And Reliability

- [x] Avoid whole-repo eager scans and whole-tree renders.
- [x] Add large-file guardrails before wiring the editor into arbitrary project files.
- [x] Prevent binary files from being rendered as text by accident.
- [x] Ensure tree refreshes and editor reloads are resilient to partial failures.
- [ ] Verify path handling and file behavior on both macOS and Windows.

### Testing And Validation

- [ ] Add focused frontend tests for file tree state, open-file state, and Monaco-backed viewer behavior.
- [ ] Add focused frontend tests for non-text file opening and fallback/viewer behavior.
- [ ] Add at least one end-to-end flow that covers browse -> expand -> open text file.
- [ ] If repo-file editing is enabled, add at least one end-to-end flow that covers browse -> open -> edit -> save for text files.
- [ ] Add at least one end-to-end flow that covers browse -> open -> preview/fallback for non-text files.
- [x] Run scoped formatting, linting, and typechecking only for touched files/packages and fix only introduced issues.
- [x] Document any known limitations that remain after the first implementation pass.

### Follow-Up Work

- [x] Link any deferred work from this implementation into the appendix before closing the plan.

## Appendix

### Expected File Handling Matrix

| File class                                                                                                                                | Show in file tree                                 | Render in Buddy                  | Editable in Buddy                                       | Open in default app                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| Source/code text files (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.css`, `.html`, `.sql`, and similar text/code files) | Yes                                               | Yes, in Monaco                   | Yes, autosave + `Cmd/Ctrl+S` for supported in-app sizes | No                                                                    |
| Text/config/docs (`.json`, `.yaml`, `.yml`, `.toml`, `.md`, `.txt`, `.env`, `.gitignore`, `.editorconfig`, and similar text/config files) | Yes                                               | Yes, in Monaco                   | Yes, autosave + `Cmd/Ctrl+S` for supported in-app sizes | No                                                                    |
| Hidden files / dotfiles                                                                                                                   | Yes, unless explicitly excluded by a defined rule | Same as the underlying file type | Same as the underlying file type                        | Same as the underlying file type when Buddy does not render it in-app |
| Ignored files                                                                                                                             | Yes, likely de-emphasized                         | Same as the underlying file type | Same as the underlying file type                        | Same as the underlying file type when Buddy does not render it in-app |
| Images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, and similar image files)                                                                | Yes                                               | Yes, in-app preview              | No                                                      | Not by default                                                        |
| SVG                                                                                                                                       | Yes                                               | Yes, in-app preview              | No                                                      | Not by default                                                        |
| eBooks (`.epub`, `.mobi`, `.azw`, `.azw3`, `.fb2`, `.fbz`, `.cbz`, and similar Foliate-supported ebook/comic formats)                     | Yes                                               | Yes, in the Foliate reader       | No                                                      | Not by default                                                        |
| PDF                                                                                                                                       | Yes                                               | Yes, in the Foliate reader       | No                                                      | Not by default                                                        |
| Office/word-processing docs (`.doc`, `.docx`, `.odt`, `.rtf`, and similar document formats)                                               | Yes                                               | No in the first pass             | No                                                      | Yes                                                                   |
| Office presentations (`.ppt`, `.pptx`, `.odp`, `.key`, and similar slide formats)                                                         | Yes                                               | No in the first pass             | No                                                      | Yes                                                                   |
| Office spreadsheets (`.xls`, `.xlsx`, `.ods`, `.numbers`, and similar spreadsheet formats)                                                | Yes                                               | No in the first pass             | No                                                      | Yes                                                                   |
| Delimited text data (`.csv`, `.tsv`)                                                                                                      | Yes                                               | Yes, in Monaco                   | Yes, autosave + `Cmd/Ctrl+S` for supported in-app sizes | No                                                                    |
| Audio (`.mp3`, `.wav`, and similar audio files)                                                                                           | Yes                                               | No in the first pass             | No                                                      | Yes                                                                   |
| Video (`.mp4`, `.mov`, and similar video files)                                                                                           | Yes                                               | No in the first pass             | No                                                      | Yes                                                                   |
| Other binaries (`.zip`, `.tar`, `.gz`, `.exe`, `.dll`, `.so`, fonts, db files, and similar binary files)                                  | Yes                                               | No                               | No                                                      | Yes                                                                   |
| Directories                                                                                                                               | Yes                                               | Tree only                        | No                                                      | No                                                                    |
| Explicitly excluded entries such as `.git` and likely `.DS_Store`                                                                         | No                                                | No                               | No                                                      | No                                                                    |

### Deferred Work

- Project-file create/rename/delete flows beyond editing already-opened text files.
- Rich non-text preview beyond image/svg and the Foliate-integrated ebook/PDF set, including audio/video and office document/presentation/spreadsheet rendering in-app.
- Review/diff parity work, including git hunk review UI and richer diff-oriented file workflows.
- Language-server parity across arbitrary repo files.
- Git-integration enhancements beyond the base explorer contract, including status/decorations if not included in the first pass.
- Any future unification of the generic project explorer with the existing teaching-workspace editor state model.
- Watcher-driven auto-refresh parity for tree/file updates after external filesystem changes.
- Cross-platform verification tasks still pending: validate default-app handoff and path behavior on Windows.
- Focused frontend explorer tests and browse/open preview e2e coverage are still pending.

## Progress Log

- 2026-04-09: Confirmed vendor baseline behavior in `vendor/opencode/packages/app/src/components/file-tree.tsx`, `vendor/opencode/packages/app/src/context/file/tree-store.ts`, and `vendor/opencode/packages/opencode/src/file/index.ts` and aligned Buddy explorer design to that lazy-load + project-root-safe contract.
- 2026-04-09: Added Buddy compatibility proxy routes for project explorer list/read: `GET /file` (`explorer.file.list`) and `GET /file/content` (`explorer.file.read`) in `packages/buddy/src/routes/compatibility.ts`.
- 2026-04-09: Added frontend project explorer API contracts and actions in `packages/web/src/state/chat-actions.ts` (`listProjectExplorerDirectory`, `readProjectExplorerFile`).
- 2026-04-09: Implemented browse-first explorer UI with lazy tree, tabs, Monaco read-only text view, image preview, unsupported/large-file fallback, and open-in-default-app action in `packages/web/src/components/project-explorer/project-file-explorer-panel.tsx`.
- 2026-04-09: Wired non-interactive editor panel to the new project explorer in `packages/web/src/components/directory-chat/directory-chat-right-sidebar-panels.tsx`.
- 2026-04-09: Removed persona-only gating from the file surface so project files remain reachable regardless of selected persona, renamed the sidebar tab to `Files`, and added an in-app opener plus first-load auto-open behavior to match vendor discoverability more closely.
- 2026-04-09: Switched project explorer list/read calls onto the generated Buddy SDK client after the initial raw frontend fetch path missed the `/api` base and produced `GET /file?path=` 404s.
- 2026-04-09: Split the right sidebar into independent `Files` and `Editor` surfaces so the project tree no longer disappears into the teaching editor, and moved interactive-lesson controls back to the editor-specific surface.
- 2026-04-09: Refined the file pane toward the vendor side-panel pattern by removing lesson controls from the file browser, simplifying the header chrome, widening the file rail, and showing active file path metadata in the preview pane.
- 2026-04-09: Fixed nested directory loading in the Buddy file tree by replacing the React-local mutable `shouldLoad` pattern with vendor-style “load any expanded directory that is not yet loaded” behavior in `packages/web/src/components/project-explorer/project-file-explorer-panel.tsx`.
- 2026-04-09: Integrated the standalone Foliate reader into the explorer for `pdf`, `epub`, `mobi`, `azw`, `azw3`, `fb2`, `fbz`, and `cbz` files by adding a project-safe raw file stream route in `packages/buddy/src/routes/compatibility.ts` and routing supported file opens through `packages/web/src/components/readers/foliate-reader.tsx`.
- 2026-04-09: Fixed Foliate auth loading by switching the explorer from credentialed reader URLs to authenticated `apiFetch()` blob loading before handing the file to `packages/web/src/components/readers/foliate-reader.tsx`.
- 2026-04-09: Fixed the raw-reader fetch path to target the Buddy compatibility route under `/api/file/raw/...` instead of the non-existent root `/file/raw/...` path when a sidecar base URL is present.
- 2026-04-09: Smoke-tested Foliate directly against real files from `~/Downloads` and confirmed the published `foliate-js@1.0.1` package opened EPUB but failed PDF with `UnsupportedTypeError`, while upstream source commits that include `pdf.js` and bundled `vendor/pdfjs` assets opened both EPUB and PDF successfully.
- 2026-04-09: Aligned `packages/web` to the same `foliate-js` commit used by the official `foliate` app submodule, `399248a67a8862ffb5e6463a33f9d52b317ca2eb`, to keep the current package-managed structure while matching upstream app behavior.
- 2026-04-09: Documented the Foliate licensing boundary, package-vs-submodule decision, smoke-test evidence, and stale `.vite` cache behavior in `docs/guides/foliate-integration-notes.md`.
- 2026-04-09: Excluded `foliate-js/view.js`, `foliate-js/pdf.js`, and `foliate-js/vendor/pdfjs/pdf.mjs` from Vite dependency optimization in both web and Electron renderer configs after Vite generated a broken optimized PDF bundle with the `Invalid glob: "vendor/pdfjs/*"` error.
- 2026-04-09: Added a shared Vite transform plugin that rewrites the upstream `foliate-js/pdf.js` asset URL from `vendor/pdfjs/${path}` to `./vendor/pdfjs/${path}` because Vite rejects the original non-`./` dynamic asset path even after dependency optimization is disabled.
- 2026-04-09: Refined the shared Foliate PDF Vite transform to rewrite `new URL(\`vendor/pdfjs/\${path}\`, import.meta.url)`into`new URL("./vendor/pdfjs/" + path, import.meta.url)`after confirming that the intermediate`./vendor/pdfjs/\${path}`rewrite still triggered Vite glob expansion and bogus`.mjs.map`module imports served as`application/json`.
- 2026-04-09: Extended the shared Foliate compatibility transform to inject a `Map#getOrInsertComputed` polyfill into `foliate-js/vendor/pdfjs/pdf.mjs` and `pdf.worker.mjs`, and to guard the `requestAnimationFrame` background refresh in `foliate-js/paginator.js` so Chromium does not throw after teardown.
- 2026-04-09: Added a Buddy-owned Foliate runtime compatibility shim in `packages/web/src/lib/foliate/ensure-foliate-runtime-compat.ts` and invoke it before `foliate-js/view.js` is imported so the PDF main-thread path no longer depends exclusively on Vite dependency transforms to provide `Map#getOrInsertComputed`.
- 2026-04-09: Added platform default-app integration (`openPath`) in `packages/web/src/context/platform.tsx` and `packages/desktop-electron/src/renderer/platform.ts`.
- 2026-04-09: Added explorer i18n strings in `packages/web/src/i18n/en.ts`.
- 2026-04-09: Validation run completed successfully: `bun fmt`, `bun lint`, `bun run sdk:generate`, and `bun typecheck`.
- 2026-04-09: Validation rerun after the SDK + sidebar split fixes completed successfully: `bun fmt`, `bun lint`, and `bun typecheck`.
- 2026-04-09: Added a Buddy-owned editable project-text-file contract in `packages/buddy/src/project/project-file-editor-service.ts` and exposed it through `GET /file/edit` and `PUT /file/edit` in `packages/buddy/src/routes/compatibility.ts`, with exact-content reads plus version/conflict semantics that preserve whitespace unlike the vendor read route.
- 2026-04-09: Regenerated the SDK for the new `explorer.file.edit.read` and `explorer.file.edit.save` operations and added focused backend route coverage in `packages/buddy/test/project-file-editor-routes.test.ts`.
- 2026-04-09: Replaced the project explorer’s read-only Monaco preview with a reusable versioned Monaco text editor, wired autosave / `Cmd/Ctrl+S` / reload / overwrite handling into the explorer, and guarded tab close so dirty edits are flushed before the tab is discarded.
- 2026-04-09: Scoped validation for the editing pass succeeded for `bun run sdk:generate`, `bun test packages/buddy/test/project-file-editor-routes.test.ts`, `bun run --cwd packages/buddy typecheck`, `bunx oxfmt`, and `bunx oxlint`; `bun run --cwd packages/web typecheck` is still blocked by pre-existing Mermaid ref typing errors in `src/components/chat/tools/render/mermaid/*`, not by the explorer changes.
- 2026-04-09: Moved the file explorer entrypoint into `packages/web/src/components/layout/desktop-titlebar.tsx`, stopped auto-opening files from the generic sidebar flow, widened the files panel sizing rules, and redesigned `packages/web/src/components/project-explorer/project-file-explorer-panel.tsx` around a titlebar-triggered desktop files tool with a right-docked collapsible tree and a denser preview/editor surface.
