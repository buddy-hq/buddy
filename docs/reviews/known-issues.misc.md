# Known Issues

## DEV-001 — Electron can retain an obsolete Vite optimized-dependency graph

- **Status:** Open — recovery documented; permanent mitigation pending
- **Priority:** P1 for development reliability
- **Area:** Electron development, Vite dependency optimization, renderer HTTP cache
- **Production impact:** None known; packaged builds do not use Vite's development optimizer

### Summary

While `bun dev:desktop` is running, Vite may regenerate its optimized dependencies after a source,
generated SDK, lockfile, or dependency-graph change. Electron can retain an older optimized parent
module in its persistent HTTP cache even after the desktop development command is restarted. The
cached parent then imports a chunk that no longer belongs to Vite's current optimizer graph.

The renderer fails during the dynamic import of `@buddy/web/app`, and Buddy displays:

```text
Failed to start Buddy backend: Failed to fetch dynamically imported module: .../packages/web/src/app.tsx
```

The message is misleading: the backend may be healthy and responding successfully. The actual
failure is a downstream frontend module request returning:

```text
504 Outdated Optimize Dep
```

### Confirmed causal chain

1. Electron caches an optimized dependency such as
   `@mdxeditor_editor.js?v=<browserHash>`. Vite serves these responses as immutable.
2. That cached parent module references an optimizer chunk such as `chunk-RZHUIJH5.js`.
3. Vite regenerates the dependency graph and the current parent module now references a different
   chunk, such as `chunk-KVSSDLBZ.js`.
4. The optimized parent module retains the same browser-hash URL.
5. An ordinary renderer reload or a restart of `bun dev:desktop` reuses Electron's cached parent
   module.
6. Electron requests the obsolete child chunk. Vite rejects it with `504 Outdated Optimize Dep`, so
   the top-level `app.tsx` dynamic import fails.

Restarting the Buddy backend or the Vite process does not necessarily recover the renderer because
the stale response is stored in Electron's renderer cache, outside those process lifecycles.

### Diagnosis

Open Electron DevTools and inspect the Console or Network panel. This issue is present when all of
the following are true:

- backend health requests succeed;
- `app.tsx` is reported as a failed dynamic import;
- a request below `node_modules/.vite/deps/` returns `504 Outdated Optimize Dep`; and
- the initiating optimized dependency was served from Electron's disk cache.

### Immediate recovery

1. Open Electron DevTools.
2. Select the Network panel.
3. Enable **Disable cache** while DevTools remains open.
4. Reload the Buddy renderer.

This forces Electron to fetch the current optimized parent module and its matching chunks. A normal
reload may continue to reproduce the failure because Vite marks optimized dependencies immutable.

### Permanent mitigation

Development mode should not allow persistent Electron HTTP caching to trap the renderer on an old
Vite optimizer graph. Preferred options, in order:

1. Disable the Electron renderer's HTTP cache in development mode.
2. If that is too broad, clear the development renderer cache before loading the Vite URL.
3. Add a one-shot recovery path for an `Outdated Optimize Dep`/dynamic-import startup failure that
   clears the renderer cache and reloads without cache, with a loop guard.

The bootstrap error boundary should also distinguish backend initialization failures from frontend
module-loading failures so this incident is not reported as a backend startup failure.

## BENCH-001 — External source files presented on Bench do not open as source files

- **Status:** Open — product behavior undecided
- **Priority:** TBD
- **Area:** Bench, external files, source editor

### Summary

`bench_present` accepts an approved local file outside the active workspace, but a readable source file such as `.tsx` opens as a generic file card rather than in the source editor. The card shows only the file icon, filename, and absolute path.

### Reproduction

1. Start a session whose workspace is different from the target file's directory.
2. Ask Buddy to present an existing external local source file using an absolute path, a `file://` URL, or a `~/` path that resolves outside the workspace.
3. Approve the external-directory permission request.
4. Open the presented file on Bench.

### Actual behavior

Buddy authorizes the file and presents it successfully, but code and other readable text files are displayed as an unopenable generic file card. The source is neither visible nor editable in Bench.

### Expected behavior

This is undecided. External readable source files must have a deliberate Bench behavior rather than falling through to the generic media-file card. It is not yet decided whether that behavior should permit inspection only or also editing and saving back to the external file.

### Scope

- Affected only when the resolved file is outside the active workspace, including external symlink targets.
- Affects readable source and text formats that are classified as a generic file: code, plain text, Markdown, JSON, YAML, and similar files.
- Does not affect ordinary readable source files inside the active workspace; they use the workspace-file source editor.
- Images, audio, video, PDF, and SVG have existing Bench previews.
- Documents, spreadsheets, archives, and other non-source generic files also show a generic card, but no in-app source-editor behavior is necessarily expected for those formats.
- Raw HTML files are explicitly rejected by `bench_present` and follow a separate HTML-widget flow.

### Possible reasons

- External files are intentionally represented as managed `media-presentation` external-reference objects so the app can retain the external-directory permission boundary and avoid arbitrary-path routes.
- The media-presentation Bench surface currently handles previews and then falls back to a generic file card for any item that is not image, audio, video, PDF, or SVG.
- The source editor is currently connected only to workspace-file targets. Its read, status, and save operations enforce workspace containment, so an external object does not enter that path.

### Decision pending

Decide whether external readable source files are view-only or editable in Bench. Until that decision is made, their current successful presentation is misleading: it appears as though Buddy opened the file, but the file's source is inaccessible in Bench.
