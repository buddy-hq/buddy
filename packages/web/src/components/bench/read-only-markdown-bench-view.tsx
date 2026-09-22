import { useCallback, useMemo } from "react"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import { BenchMediaMessage } from "@/components/bench/bench-media-preview"
import { BenchSurfacePending } from "@/components/bench/bench-surface-pending"
import type { BenchViewerAction } from "@/components/bench/bench-viewer-shell"
import { BenchSurfaceViewer } from "@/components/bench/bench-viewer-shell"
import { resolveMarkdownBenchContentTheme } from "@/components/bench/markdown/document-theme"
import { MarkdownBenchEditor } from "@/components/bench/markdown/editor"
import type {
  ObsidianEmbeddedMarkdownLoader,
  ObsidianWikiLinkContext,
} from "@/components/bench/markdown/plugins/obsidian"
import { useOpenLink, type OpenLinkOptions } from "@/components/directory-chat/use-open-link"
import { usePlatform } from "@/context/platform"
import {
  resolvePresentedMediaMarkdownImageSrc,
  resolvePresentedMediaMarkdownLink,
} from "@/lib/presented-media-markdown"
import { useMarkdownBenchPreferences } from "@/state/markdown-bench-preferences"
import { useTheme } from "@/theme"

/** Props for the read-only Markdown Bench surface used for external presented files. */
export type TReadOnlyMarkdownBenchViewProps = {
  /** Dock actions shown on the Bench surface. */
  actions?: BenchViewerAction[]
  /** Notebook directory used by Markdown plugins for relative media. */
  directory: string
  /** Markdown vs MDX document format. */
  documentFormat: MarkdownBenchDocumentFormat
  /** Source-load failure message, when the file could not be decoded. */
  error: string | undefined
  /** True while the raw source request is in flight. */
  loading: boolean
  /** Decoded Markdown source. Undefined until the request succeeds. */
  markdown: string | undefined
  /** Absolute or display path shown in the subtitle and editor. */
  path: string
  /** Raw URL for the owning media item, used as the authority for relative image reads. */
  sourceRawUrl: string | undefined
  /** Surface title. */
  title: string
  /** Version token used to reset the editor when the source changes. */
  version: string
  /** Scroll restoration key for this Bench tab. */
  viewportKey: string
}

/** External presented Markdown is not writable through this surface. */
function ignoreReadOnlyMarkdownChange(): void {}

const EXTERNAL_MARKDOWN_EMBED_LOADER: ObsidianEmbeddedMarkdownLoader = {
  queryKey: ({ path }) => ["external-presented-markdown-embed-disabled", path],
  async read() {
    return { content: "" }
  },
}

/**
 * Read-only Markdown/MDX Bench surface for external presented files.
 *
 * This is the same editor used by notes, without save/rename. Edits are discarded.
 */
export function ReadOnlyMarkdownBenchView(props: TReadOnlyMarkdownBenchViewProps) {
  const platform = usePlatform()
  const { themeId, themes } = useTheme()
  const contentFontScale = useMarkdownBenchPreferences((state) => state.contentFontScale)
  const contentThemeMode = useMarkdownBenchPreferences((state) => state.contentThemeMode)
  const contentTheme = useMemo(() => {
    const theme = themes[themeId]
    if (!theme) return undefined
    return resolveMarkdownBenchContentTheme({ mode: contentThemeMode, theme })
  }, [contentThemeMode, themeId, themes])
  const markdown = props.markdown
  const showPending = props.loading || (markdown === undefined && props.error === undefined)
  const resolveImageSrc = useCallback(
    (src: string) => resolvePresentedMediaMarkdownImageSrc({ rawUrl: props.sourceRawUrl, src }),
    [props.sourceRawUrl],
  )
  const openExternalLink = useOpenLink(props.directory)
  const openLink = useCallback(
    (href: string, options: OpenLinkOptions): void => {
      if (href.trim().startsWith("#")) return
      const target = resolvePresentedMediaMarkdownLink(props.path, href)
      if (!target) return
      if (target.type === "external-url") {
        openExternalLink(target.url, options)
      } else {
        void platform.openPath?.(target.path)
      }
    },
    [openExternalLink, platform, props.path],
  )
  const wikiLinkContext = useMemo<ObsidianWikiLinkContext>(
    () => ({
      directory: "",
      documentPath: props.path,
      compatible: false,
      resolutions: new Map(),
      embeddedMarkdownLoader: EXTERNAL_MARKDOWN_EMBED_LOADER,
      openResolution() {},
    }),
    [props.path],
  )

  return (
    <BenchSurfaceViewer
      title={props.title}
      subtitle={props.path}
      actions={props.actions}
      controlsPlacement="dock"
      hideHeader
    >
      {showPending ? (
        <BenchSurfacePending />
      ) : props.error !== undefined || markdown === undefined ? (
        <BenchMediaMessage title="File could not be opened" className="text-icon-critical-base">
          {props.error ?? "This file is not available."}
        </BenchMediaMessage>
      ) : (
        <div
          data-component="read-only-markdown-bench-view"
          className="flex h-full min-h-0 flex-col"
        >
          <div className="border-b border-border-base bg-surface-weak/40 px-4 py-1.5 text-xs text-text-weak">
            External file · Read-only
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <MarkdownBenchEditor
              markdown={markdown}
              version={props.version}
              dirty={false}
              saving={false}
              conflict={false}
              contentFontScale={contentFontScale}
              contentTheme={contentTheme}
              directory={props.directory}
              documentFormat={props.documentFormat}
              path={props.path}
              title={props.title}
              readOnly
              resolveImageSrc={resolveImageSrc}
              viewportKey={props.viewportKey}
              obsidianWikiLinkContext={wikiLinkContext}
              onChange={ignoreReadOnlyMarkdownChange}
              onOpenLink={openLink}
            />
          </div>
        </div>
      )}
    </BenchSurfaceViewer>
  )
}
