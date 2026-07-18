# Known Issues

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
