# Present Media — Caveman Data Flow

## 1. Agent calls `present_media`

- passes: items[{path}]
- paths can be workspace-relative, absolute, `file://`, or `~` home-relative
- Buddy validates schema, asks permission, resolves every path on the local backend

## 2. Backend per file

- normalize input path to a real absolute filesystem path
- check the file exists and is a regular file
- classify by extension + MIME:
  - extension → image, pdf, presentation, document, spreadsheet, audio, video, archive, other
  - renderMode → image, audio, video, pdf, file
- check workspace containment via `OpenCodeInstance.containsPath`:
  - contained → `workspacePath` = relative path, `canOpenInWorkspacePanel` = true
  - not contained → `workspacePath` = null, `canOpenInWorkspacePanel` = false
- register an in-memory reference: `{ id: randomUUID(), absolutePath, fileName }`
  - no disk persistence, no caching, no hashing
  - reference lives only as long as the backend process
- build one raw route for all files: `/api/presented-media/<uuid>/raw?fileName=<name>`
- the frontend uses `GET /api/presented-media/resolve?path=<path>` to re-resolve files after stale references
- derive 3 action capabilities:
  - `canOpenDefaultApp` — always true
  - `canRevealInFileManager` — always true
  - `canOpenInWorkspacePanel` — only if file is inside workspace
- displayPath:
  - workspace-contained files → workspace-relative path
  - other files → absolute path
- no source file copy, no persistent registry, no thumbnail previews, no content hash

## 3. Backend returns

```
PresentedMediaOutput {
  presentationID: random UUID
  kind: "media.presentation.v1"
  layout: "single" | "gallery" | "deck" | "list"
  items: PresentedMediaItem[]
}

PresentedMediaItem {
  id: string                   // `media_item_${index + 1}`
  inputPath: string            // exactly what agent passed
  absolutePath: string         // real local path for native actions
  displayPath: string          // shown in UI (relative or absolute)
  workspacePath: string | null // relative path, null if external
  fileName: string
  mediaKind: string
  renderMode: "image" | "audio" | "video" | "pdf" | "file"
  mimeType: string | null
  sizeBytes: number | null
  modifiedAt: string | null
  rawUrl: string               // /api/presented-media/<uuid>/raw?fileName=<name>
  actionCapabilities: {
    canOpenDefaultApp: boolean
    canRevealInFileManager: boolean
    canOpenInWorkspacePanel: boolean
  }
  availability: {
    status: "available" | "missing" | "error"
    message: string | null
  }
}
```

## 4. Frontend renders

- parse `PresentedMediaOutput` from tool metadata
- resolve each item's availability with React Query via `HEAD rawUrl`
- if `HEAD rawUrl` returns `404`, try re-resolving from stored file paths
  - if the file still exists, refresh the item and treat it as `available`
  - if the file does not exist anymore, keep it as `missing`
- fetch inline media through authenticated server transport → blob → `URL.createObjectURL()`
  - same path for all files, no workspace/external fork
- route by `mediaKind` (not by the `layout` field — the backend-computed `layout` is not consumed by the frontend):
  - image → inline image or gallery grid + dialog with zoom, prev/next, keyboard nav
  - audio → `<audio>` controls when MIME is safe
  - video → `<video>` controls when MIME is safe
  - pdf/presentation/document/spreadsheet/archive/other → file row with `react-file-icon` + actions
  - non-workspace file rows do nothing on click (use the context menu instead)
- if an image is too large for inline preview, keep it as a file row instead of dropping it
- no auto-open behavior

## 5. Action buttons

| Button | When shown | What it does |
|---|---|---|
| Open in files | `canOpenInWorkspacePanel` and availability is `"available"` | queues file in workspace sidebar |
| Open default app | `canOpenDefaultApp` | `platform.openPath(absolutePath)` → Electron IPC → OS opens file |
| Reveal in file manager | `canRevealInFileManager` | `platform.revealPath(absolutePath)` → Electron IPC → Finder/Explorer |
| Copy path | always | copies `absolutePath` to clipboard |

Rows stay actionable even when a file is not inline-previewable. Only genuinely missing files are faded.

## 6. Fallback (agent forgot tool)

- markdown rendering scans assistant text for path-like local file mentions
- supported path forms include workspace-relative, absolute, `file://`, and `~`
- matching works in both inline code and plain text nodes
- matching requires a file extension — extensionless paths like `/etc/hosts` are never matched
- matching is whitespace-tolerant for full filenames
- `normalizePresentedMediaCandidatePath` silently prepends `/` to bare Unix paths like `Users/foo/file.pdf` that start with common top-level directory names
- upgraded matches render inline as:
  - file-type icon from `react-file-icon`
  - basename label only
- clicking an upgraded path:
  - opens the workspace file panel when possible
  - otherwise falls back to `platform.openPath(absolutePath)`

## 7. Why workspace containment is a capability, not an identity

Buddy does not have internal/external file species. Every file is a local file with a real path and a raw route. Workspace containment only decides one thing: can this file open in the workspace file panel? That is expressed as `canOpenInWorkspacePanel: true/false`. The frontend never branches logic on where the file lives. It reads `rawUrl`, `actionCapabilities`, and `availability` and renders accordingly.
