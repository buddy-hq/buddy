# Display Media

## Status

Display media is implemented.

Buddy now has two real ways to surface local files in chat:

1. `present_media`
   - the authoritative, structured path
2. Markdown path interception
   - a convenience fallback for path mentions in assistant text

This document reflects the current implementation, not the earlier proposal.

## What Exists

### `present_media` tool

The model-facing schema is intentionally minimal:

```ts
{
  items: [{
    path: string
  }] // min 1, max 12
}
```

Current behavior:

- accepts workspace-relative paths
- accepts absolute local paths
- accepts `file://` URLs
- accepts `~` home-relative paths
- rejects missing files
- rejects empty paths
- supports up to 12 items per call

Relevant files:

- `packages/buddy/src/learning/features/media-presentations/tools/present-media.ts`
- `packages/buddy/src/learning/features/media-presentations/service/file-media.ts`

### Backend artifact shape

Buddy enriches each file into a structured artifact:

```ts
type PresentedMediaOutput = {
  presentationID: string
  kind: "media.presentation.v1"
  layout: "single" | "gallery" | "deck" | "list"
  items: PresentedMediaItem[]
}
```

Note: `layout` is computed (`deriveLayout` only returns `single`, `gallery`, or `list`) but the frontend does not consume it — it renders by grouping items by `mediaKind`.

Important notes:

- the artifact is file-derived
- the model only supplies paths

### Raw file serving

Presented media is served through opaque Buddy routes:

- `GET /api/presented-media/:id/raw?fileName=<name>`
- `HEAD /api/presented-media/:id/raw?fileName=<name>`
- `GET /api/presented-media/resolve?path=<path>` — used by the frontend to re-resolve files after a stale reference

Relevant file:

- `packages/buddy/src/routes/compatibility.ts`

## Current Rendering Behavior

Relevant file:

- `packages/web/src/components/chat/tools/render/present-media/index.tsx`

### Images

- one image renders inline
- multiple images render as a gallery
- gallery images open in a zoomable dialog
- very large images do not disappear; they fall back to file rows
- image inline preview uses a large guard: `512MB`

### Audio and video

- audio renders with a native `<audio>` player when the MIME type is safe
- video renders with a native `<video>` player when the MIME type is safe
- otherwise they fall back to file rows

### PDFs, EPUBs, documents, spreadsheets, presentations, archives, other files

- these currently render as file rows
- file rows show a file-type icon and basename
- if the file is a workspace file and the workspace panel supports it, clicking the row opens it there
- non-workspace file rows do nothing on click (use the context menu instead)
- the context menu exposes:
  - reveal in Finder
  - open in default app
  - copy path

### Availability behavior

Availability is now only:

- `available`
- `missing`
- `error`

Important current behavior:

- rows are not disabled just because a file is not inline-previewable
- deleted or moved files remain faded
- existing local files remain actionable
- if a raw presented-media reference goes stale after a backend restart, Buddy re-resolves the file from its stored path
- if the file still exists, it becomes available again
- if the file no longer exists, it stays `missing`

## Markdown Interception

Relevant files:

- `packages/web/src/components/markdown/markdown-html-segment.tsx`
- `packages/web/src/lib/presented-media.ts`

This is a fallback convenience layer, not the authoritative presentation contract.

Current behavior:

- path-like local file mentions in markdown can be upgraded inline
- supported path forms include:
  - workspace-relative paths
  - absolute Unix paths
  - absolute Windows paths
  - `file://` URLs
  - `~` home-relative paths
- interception now works for both:
  - inline code path mentions
  - plain markdown text nodes
- upgraded links render inline with:
  - a small file-type icon from `react-file-icon`
  - basename only, not the full path label
- clicking an intercepted link:
  - opens the workspace file panel when possible
  - otherwise falls back to `platform.openPath` when available

Current implementation details:

- the full path is still kept in the link target and tooltip
- the visible text is the basename only
- matching requires a file extension — extensionless paths like `/etc/hosts` are never matched
- `normalizePresentedMediaCandidatePath` silently prepends `/` to bare Unix paths like `Users/foo/file.pdf` that start with common top-level directory names

## Recommended Usage

Use `present_media` when the agent intentionally wants to show learner-facing files.

Use markdown path mentions only as a fallback convenience.

The product contract is:

- structured tool artifact first
- markdown interception second

## Source Map

Core backend:

- `packages/buddy/src/learning/features/media-presentations/tools/present-media.ts`
- `packages/buddy/src/learning/features/media-presentations/service/file-media.ts`
- `packages/buddy/src/routes/compatibility.ts`

Core frontend:

- `packages/web/src/components/chat/tools/render/present-media/index.tsx`
- `packages/web/src/components/markdown/markdown-html-segment.tsx`
- `packages/web/src/lib/presented-media.ts`
