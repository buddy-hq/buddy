# View Image — Caveman Data Flow

## 1. Model is selected, image capability is known

- model catalog (models.dev) provides `modalities.input: ["text", "image", ...]` per model
- vendor maps it to `model.capabilities.input.image: boolean`
- frontend normalizes it into `ProviderModelInfo.capabilities.input.image`
- `DirectoryChatModelOption.acceptsImages` is set from this boolean
- `selectedModelAcceptsImages` is computed from the effective model in `use-directory-chat-state.ts`

## 2. Composer gates image attachment entry by model capability

- all ingress points (picker, paste, drop) route through `usePromptComposerAttachments.addAttachments()`
- `addAttachments` filters out `image/*` files when `acceptsImages` is false
- dropped/pasted unsupported images fire `onUnsupportedImages` → `toast.error`
- file picker `accept` attribute switches between images+PDF and PDF-only
- already-attached images become "unsupported" when user switches to non-vision model
- unsupported chips get warning border + "unsupported" badge, send button is disabled

## 3. Model selector shows image icon in dropdown

- image-capable models get `ImageIcon` on the right side of dropdown rows
- collapsed trigger shows plain text (no icon) — `SelectValue` children override item auto-render
- selected model uses background highlight (`bg-surface-raised-base-active`) instead of checkmark

## 4. Agent calls `read` on an image file

- vendor `read` tool checks `isImageAttachment(mime)` — returns `false` for SVG (`image/svg+xml` excluded) and `image/vnd.fastbidsheet`
- raster images (PNG, JPG, GIF, WebP): returns `attachments: [{ mime, url: "data:..." }]`
- SVG: `isImageAttachment` is false → read as raw text → `output: "<svg>...</svg>"`
- on next turn, image attachments reach model as base64 data URLs (media-in-tool-results or synthetic user message, per provider)

## 5. Tool title changes to Viewing / Viewed

- `tool-info.ts` `getToolInfo` for `read` checks file extension (`.png|.jpg|.jpeg|.gif|.webp|.svg`) or tool attachments for `image/*` MIME
- image read: "Viewing" while running, "Viewed" when done
- text read: "Reading" / "Read" (unchanged)

## 6. Hidden steps toggle shows View icon for image reads

- `HiddenSteps` `toggleIcon` checks the active preview entry for image attachments or image filename extension
- image read → `View` icon (eye from lucide)
- text read → `FileText` icon

## 7. While streaming, images appear inside the live preview panel

- `showLivePreview` is true (tool is active or assistant is still busy)
- `HiddenStepsPreviewPanel` receives `imageAttachments` prop
- images render inside `previewContentRef` flex container, directly after the live preview text — no gap
- thumbnail size is `small` (`max-h-16`) to fit within the 80px viewport height
- 80px fixed height is preserved for layout stability; content starts at top, scrolls when viewport fills

## 8. When the tool completes, images move outside the collapsible

- `showLivePreview` becomes false → title switches from "Viewing" to collapsed summary label
- external image row renders below the preview panel (only when `!isOpen && !showLivePreview`)
- thumbnails use full size (`max-h-28`) in horizontal scrollable flex row
- the external row has `px-2` indentation matching the expanded content

## 9. Hidden steps expanded: images render inline inside the card

- when user clicks to expand (`isOpen = true`), external image row hides
- `CollapsibleContent` renders each read entry via `AssistantPartRenderer` → `renderReadTool`
- tool row shows `[Eye icon] filename` with image thumbnails below
- SVG files: detected by `.svg` filename, raw markup from `state.output` converted to `data:image/svg+xml,...` URL, rendered as `<img>`

## 10. Collapsed summary splits text and image reads

- `tool-summary-resolver.ts` `resolveToolSummary` "read" case checks `isImageRead()`
- image reads bucket under aggregate key `"view-image"` → "Viewed 2 images"
- text reads bucket under aggregate key `"read"` → "Read 1 file"
- final collapsed label: `Read 1 file · Viewed 2 images`

## Source Map

Composer:
- `packages/web/src/components/prompt/prompt-composer.tsx` — unsupported detection, canSubmit gating, file input accept, toast, warning banner
- `packages/web/src/components/prompt/use-prompt-composer-attachments.ts` — image filtering, unsupported callback
- `packages/web/src/components/prompt/attachment-utils.ts` — ACCEPTED_IMAGE_TYPES, ACCEPTED_NON_IMAGE_FILE_TYPES
- `packages/web/src/components/prompt/image-attachments.tsx` — AttachmentItem with warning state
- `packages/web/src/components/prompt/components/prompt-composer-toolbar.tsx` — ImageIcon, View icon, selectedModelAcceptsImages
- `packages/web/src/components/prompt/use-prompt-composer-view-state.ts` — acceptsImages in modelOptions
- `packages/web/src/components/prompt/prompt-types.ts` — PromptComposerAttachment type

Model state:
- `packages/web/src/lib/directory-chat/use-directory-chat-state.ts` — DirectoryChatModelOption.acceptsImages, selectedModelAcceptsImages
- `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts` — selectedModelAcceptsImages wiring
- `packages/web/src/state/chat-actions.ts` — ProviderModelInfo.capabilities normalization
- `packages/web/src/state/chat-types.ts` — ProviderModelInfo type

UI components:
- `packages/ui/src/components/ui/select.tsx` — background highlight instead of checkmark
- `packages/web/src/components/chat/tools/render/read.tsx` — Eye icon, SVG rendering, thumbnail row
- `packages/web/src/components/chat/tools/hidden-steps/index.tsx` — HiddenStepsImageRow, visibleImageAttachments, preview panel integration, View icon toggle, px-2 indentation
- `packages/web/src/components/chat/tools/tool-info.ts` — isImageFilePath, hasImageAttachments, Viewing/Viewed titles
- `packages/web/src/components/chat/tools/tool-summary-resolver.ts` — isImageRead, split aggregate keys
- `packages/web/src/i18n/en.ts` — chatTools.info.read.image and chatTools.info.read.image.running

Vendor:
- `vendor/opencode/packages/opencode/src/util/media.ts` — isImageAttachment excludes SVG
- `vendor/opencode/packages/opencode/src/provider/provider.ts` — capabilities.input.image from modalities
- `vendor/opencode/packages/opencode/src/provider/transform.ts` — unsupportedParts gate
- `vendor/opencode/packages/opencode/src/session/message-v2.ts` — tool result → model message image flow
- `vendor/opencode/packages/opencode/src/tool/read.ts` — image attachment return

Buddy backend:
- `packages/buddy/src/learning/prompt/runtime-context/model-context.ts` — vision hint in runtime context
- `packages/buddy/src/learning/prompt/runtime-context/model-context.t.md` — template with `{{ vision }}`
- `packages/buddy/src/learning/prompt/context.ts` — PromptModel.image, resolvePromptModel
