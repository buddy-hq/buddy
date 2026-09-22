import { MDXEditor, type MDXEditorMethods } from "@mdxeditor/editor"
import "@mdxeditor/editor/style.css"
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { cn, toast } from "@buddy/ui"
import type { Citation, CitationTextSelector } from "@buddy/citation-contract"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import {
  prepareMarkdownForMdxEditor,
  prepareMdxForMdxEditor,
  restoreMarkdownFromMdxEditor,
} from "@/components/bench/markdown/compatibility"
import { MarkdownBenchIntrinsicScope } from "@/components/bench/markdown/mdx-intrinsic"
import { readBenchSurfaceViewport, writeBenchSurfaceViewport } from "@/state/bench-surface-ui-state"
import {
  MarkdownBenchChemistryViewProvider,
  type MarkdownBenchChemistryViewOptions,
} from "@/components/bench/markdown/plugins/chemistry"
import {
  MarkdownBenchMermaidViewProvider,
  type MarkdownBenchMermaidViewOptions,
} from "@/components/bench/markdown/plugins/mermaid"
import {
  buildMarkdownBenchContentThemeCss,
  sanitizeMarkdownBenchThemeScopeID,
  type MarkdownBenchContentTheme,
} from "@/components/bench/markdown/document-theme"
import { restoreObsidianCalloutsFromMdxEditor } from "@/components/bench/markdown/obsidian-callouts"
import { resolveMarkdownBenchNoteTitle } from "@/components/bench/markdown/note-title"
import {
  EXPLORER_EMBEDDED_MARKDOWN_LOADER,
  type ObsidianWikiLinkContext,
} from "@/components/bench/markdown/plugins/obsidian"
import { findMarkdownBenchFragmentTarget } from "@/components/bench/markdown/editor-fragments"
import { resolveSelectionHeadingPath } from "@/components/bench/markdown/editor-selection"
import {
  MARKDOWN_BENCH_DOCUMENT_GUTTER_CLASS,
  MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME,
  MARKDOWN_BENCH_MDX_POPUP_LAYER_CSS,
  MARKDOWN_BENCH_PAPER_CARD_CLASS_NAME,
  MARKDOWN_BENCH_PAPER_PLAIN_CLASS_NAME,
  MARKDOWN_BENCH_TABLE_CSS,
  MARKDOWN_CONTENT_BASE_CLASS_NAME,
  MARKDOWN_CONTENT_PAPER_LAYOUT_CLASS_NAME,
  MARKDOWN_CONTENT_PLAIN_LAYOUT_CLASS_NAME,
  MARKDOWN_DOCUMENT_PAPER_INSET_CLASS_NAME,
  MARKDOWN_DOCUMENT_PLAIN_INSET_CLASS_NAME,
  MARKDOWN_NOTE_TITLE_BASE_CLASS_NAME,
  MARKDOWN_NOTE_TITLE_INPUT_CLASS_NAME,
  MARKDOWN_NOTE_TITLE_PAPER_LAYOUT_CLASS_NAME,
  MARKDOWN_NOTE_TITLE_PLAIN_LAYOUT_CLASS_NAME,
  MDX_EDITOR_THEME_CLASS_NAME,
} from "@/components/bench/markdown/editor-styles"
import {
  EMPTY_MARKDOWN_BENCH_HISTORY_CONTROLS,
  type MarkdownBenchHistoryControls,
  type MarkdownBenchHistoryControlsState,
} from "@/components/bench/markdown/plugins/editor-runtime"
import { MarkdownBenchToolbarContainerContext } from "@/components/bench/markdown/editor-toolbar-portal"
import { useMarkdownBenchEditorPlugins } from "@/components/bench/markdown/use-editor-plugins"
import {
  MarkdownBenchPropertiesToggle,
  MarkdownBenchPropertiesView,
} from "@/components/bench/markdown/properties"
import type { MarkdownBenchProperty } from "@/components/bench/markdown/property-values"
import { CitationSelectionToolbar } from "@/components/citations/citation-selection-toolbar"
import type { OpenLinkOptions } from "@/components/directory-chat/use-open-link"
import {
  captureRenderedTextSelection,
  resolveRenderedTextRange,
} from "@buddy/citation-contract/rendered-text"
import { observeSelectionActions } from "@buddy/citation-contract/selection-actions"
import { registerCitationNavigationHandler } from "@/lib/citations/navigation"
import { registerCitationSurfaceRevealer } from "@/lib/citations/surface-revealers"
import { useBenchRouteContextOptional } from "@/components/bench/bench-route-context"
import { benchTargetKey } from "@/lib/bench-navigation"
import { revealCitationRange } from "@/lib/citations/highlight"
import type { CitationCommentSource } from "@/lib/citations/comment-request"
import { rangeCitationCommentSource } from "@/lib/citations/comment-source"
import { filterStagedQuotes, useStagedQuotes } from "@/lib/citations/staged-quotes"
import {
  QUOTE_COMMENT_MARKER_SIZE_PX,
  QuoteCommentMarkers,
} from "@/components/citations/quote-comment-markers"
import { useRenderedTextCommentAnchors } from "@/components/citations/use-rendered-text-comment-anchors"

export type { MarkdownBenchHistoryControlsState }

export type MarkdownBenchEditorContract = {
  markdown: string
  version: string
  dirty: boolean
  saving: boolean
  conflict: boolean
  onChange(markdown: string): void
  onSave(markdown: string, expectedVersion: string): void
  onReload(): void
  getMarkdown(): string
  getSelectionMarkdown(): string
  setMarkdown(markdown: string): void
  focus(): void
}

export type MarkdownBenchEditorHandle = Pick<
  MarkdownBenchEditorContract,
  "getMarkdown" | "getSelectionMarkdown" | "setMarkdown" | "focus"
> & {
  redo(): void
  scrollToFragment(fragment: string): boolean
  undo(): void
}

export type MarkdownBenchDocumentSelection = {
  text: string
  selector: CitationTextSelector
  headingPath?: string[]
}

export type MarkdownBenchProcessingResult = {
  markdown: string
  error: string | undefined
}

export type MarkdownBenchEditorAppearance = "paper" | "plain"

type MarkdownBenchEditorProps = Pick<
  MarkdownBenchEditorContract,
  "markdown" | "version" | "dirty" | "saving" | "conflict" | "onChange"
> & {
  advancedToolbarContainer?: HTMLElement | null
  /** "paper" (default) shows the document card chrome; "plain" renders a flush, minimal surface. */
  appearance?: MarkdownBenchEditorAppearance
  className?: string
  contentFontScale?: number
  contentTheme?: MarkdownBenchContentTheme
  directory: string
  documentFormat: MarkdownBenchDocumentFormat
  path: string
  title?: string
  placeholder?: ReactNode
  /** Frontmatter revealed by the info control on the title. */
  properties?: readonly MarkdownBenchProperty[]
  readOnly?: boolean
  resolveImageSrc?(src: string): string
  viewportKey?: string
  obsidianWikiLinkContext?: ObsidianWikiLinkContext
  onHistoryControlsChange?(controls: MarkdownBenchHistoryControlsState): void
  onOpenLink?(href: string, options: OpenLinkOptions): void
  onProcessingResult?(result: MarkdownBenchProcessingResult): void
  onRenameTitle?(title: string): Promise<void>
  onCiteSelection?(
    selection: MarkdownBenchDocumentSelection,
    commentSource: CitationCommentSource,
  ): void
  renamingTitle?: boolean
}

const MARKDOWN_SERIALIZATION_OPTIONS = {
  listItemIndent: "one",
  resourceLink: false,
} as const

function revealDocumentCitation(
  editorRoot: HTMLElement | null,
  excerpt: string,
  selector: CitationTextSelector,
) {
  const contentRoot = editorRoot?.querySelector<HTMLElement>('[contenteditable="true"]')
  if (!contentRoot) return false
  const range = resolveRenderedTextRange(contentRoot, excerpt, selector)
  if (!range) {
    contentRoot.scrollIntoView({ block: "center" })
    toast.warning("The quoted text changed. Showing its source document instead.")
    return true
  }
  revealCitationRange(range)
  return true
}

export const MarkdownBenchEditor = forwardRef<MarkdownBenchEditorHandle, MarkdownBenchEditorProps>(
  function MarkdownBenchEditor(props, ref) {
    const appearance = props.appearance ?? "paper"
    const isPlainAppearance = appearance === "plain"
    const editorRef = useRef<MDXEditorMethods>(null)
    const editorRootRef = useRef<HTMLDivElement>(null)
    const paperRef = useRef<HTMLDivElement>(null)
    const stagedQuotes = useStagedQuotes()
    const documentQuotes = useMemo(
      () =>
        filterStagedQuotes(
          stagedQuotes,
          (citation) => citation.source.kind === "document" && citation.source.path === props.path,
        ),
      [stagedQuotes, props.path],
    )
    const commentAnchors = useRenderedTextCommentAnchors({
      quotes: documentQuotes,
      overlayRef: paperRef,
      textRootSelector: '[contenteditable="true"]',
      markerOffset: -QUOTE_COMMENT_MARKER_SIZE_PX - 2,
    })
    const [citationCandidate, setCitationCandidate] = useState<{
      selection: MarkdownBenchDocumentSelection
      commentSource: CitationCommentSource
      position: { x: number; y: number }
    }>()
    const citationActionRef = useRef<HTMLDivElement>(null)
    const applyingExternalMarkdownRef = useRef(false)
    const historyControlsRef = useRef<MarkdownBenchHistoryControls>(
      EMPTY_MARKDOWN_BENCH_HISTORY_CONTROLS,
    )
    const onHistoryControlsChangeRef = useRef(props.onHistoryControlsChange)
    const onProcessingResultRef = useRef(props.onProcessingResult)
    const processingMarkdownRef = useRef(props.markdown)
    onProcessingResultRef.current = props.onProcessingResult
    processingMarkdownRef.current = props.markdown

    useLayoutEffect(() => {
      const editorRoot = editorRootRef.current
      const viewportKey = props.viewportKey
      if (!editorRoot || !viewportKey) return
      const restoredViewport = readBenchSurfaceViewport(viewportKey)
      if (restoredViewport?.scrollTop !== undefined) {
        editorRoot.scrollTop = restoredViewport.scrollTop
      }
      if (restoredViewport?.scrollLeft !== undefined) {
        editorRoot.scrollLeft = restoredViewport.scrollLeft
      }
      return () => {
        writeBenchSurfaceViewport(viewportKey, {
          scrollTop: editorRoot.scrollTop,
          scrollLeft: editorRoot.scrollLeft,
        })
      }
    }, [props.viewportKey])
    const rawThemeScopeID = useId()
    const themeScopeID = useMemo(
      () => sanitizeMarkdownBenchThemeScopeID(rawThemeScopeID),
      [rawThemeScopeID],
    )
    const scopedThemeCss = useMemo(() => {
      if (!props.contentTheme) return undefined
      return buildMarkdownBenchContentThemeCss({
        contentFontScale: props.contentFontScale,
        scopeID: themeScopeID,
        theme: props.contentTheme,
      })
    }, [props.contentFontScale, props.contentTheme, themeScopeID])
    const mermaidViewOptions = useMemo<MarkdownBenchMermaidViewOptions | undefined>(() => {
      if (!props.contentTheme) return undefined
      return {
        presentation: props.contentTheme.mode === "print" ? "static" : "interactive",
        themeConfig: props.contentTheme.mermaidThemeConfig,
      }
    }, [props.contentTheme])
    const isPrintView = props.contentTheme?.mode === "print"
    const onRenameTitle = props.onRenameTitle
    const noteTitle = useMemo(
      () => props.title ?? resolveMarkdownBenchNoteTitle(props.path),
      [props.path, props.title],
    )
    const [noteTitleDraft, setNoteTitleDraft] = useState(noteTitle)
    const [propertiesOpen, setPropertiesOpen] = useState(false)
    const hasProperties = (props.properties?.length ?? 0) > 0
    const cancelTitleCommitRef = useRef(false)
    useEffect(() => {
      setNoteTitleDraft(noteTitle)
    }, [noteTitle])
    useEffect(() => {
      setPropertiesOpen(false)
    }, [props.path])
    const commitNoteTitle = useCallback(
      async (event: ReactFocusEvent<HTMLInputElement>) => {
        if (cancelTitleCommitRef.current) {
          cancelTitleCommitRef.current = false
          return
        }
        const nextTitle = event.currentTarget.value.trim()
        if (!onRenameTitle || nextTitle === noteTitle) {
          setNoteTitleDraft(noteTitle)
          return
        }
        try {
          await onRenameTitle(nextTitle)
        } catch {
          setNoteTitleDraft(noteTitle)
        }
      },
      [noteTitle, onRenameTitle],
    )
    const handleNoteTitleKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
          return
        }
        if (event.key !== "Escape") return
        event.preventDefault()
        cancelTitleCommitRef.current = true
        setNoteTitleDraft(noteTitle)
        event.currentTarget.blur()
      },
      [noteTitle],
    )
    const chemistryViewOptions = useMemo<MarkdownBenchChemistryViewOptions>(
      () => ({
        directory: props.directory,
      }),
      [props.directory],
    )
    const fallbackObsidianWikiLinkContext = useMemo<ObsidianWikiLinkContext>(
      () => ({
        directory: props.directory,
        documentPath: props.path,
        compatible: false,
        resolutions: new Map(),
        embeddedMarkdownLoader: EXPLORER_EMBEDDED_MARKDOWN_LOADER,
        openResolution() {},
      }),
      [props.directory, props.path],
    )
    const obsidianWikiLinkContext = props.obsidianWikiLinkContext ?? fallbackObsidianWikiLinkContext
    const editorMarkdown = useMemo(
      () =>
        props.documentFormat === "mdx"
          ? prepareMdxForMdxEditor(props.markdown)
          : prepareMarkdownForMdxEditor(props.markdown),
      [props.documentFormat, props.markdown],
    )
    const restoreEditorMarkdown = useCallback(
      (markdown: string) => {
        const restoredCallouts = restoreObsidianCalloutsFromMdxEditor(markdown)
        return props.documentFormat === "mdx"
          ? restoredCallouts
          : restoreMarkdownFromMdxEditor(restoredCallouts)
      },
      [props.documentFormat],
    )
    const handleHistoryControlsChange = useCallback((controls: MarkdownBenchHistoryControls) => {
      historyControlsRef.current = controls
      onHistoryControlsChangeRef.current?.({
        canRedo: controls.canRedo,
        canUndo: controls.canUndo,
      })
    }, [])
    const handleProcessingErrorChange = useCallback((message: string | undefined) => {
      const result = {
        markdown: processingMarkdownRef.current,
        error: message,
      } satisfies MarkdownBenchProcessingResult
      queueMicrotask(() => {
        onProcessingResultRef.current?.(result)
      })
    }, [])
    const onCiteSelection = props.onCiteSelection
    useEffect(() => {
      const editorRoot = editorRootRef.current
      if (!editorRoot || !onCiteSelection) return
      const observer = observeSelectionActions({
        element: editorRoot,
        getActionElement: () => citationActionRef.current,
        onDismiss: () => setCitationCandidate(undefined),
        onSelection: (pointer) => {
          const contentRoot = editorRoot.querySelector<HTMLElement>('[contenteditable="true"]')
          if (!contentRoot) return
          const captured = captureRenderedTextSelection(contentRoot, window.getSelection())
          if (!captured) {
            setCitationCandidate(undefined)
            return
          }
          const headingPath = resolveSelectionHeadingPath(editorRoot, captured.range)
          const selection = Object.assign(
            { text: captured.excerpt, selector: captured.selector },
            headingPath ? { headingPath } : undefined,
          )
          const rects = captured.range.getClientRects()
          const rect = rects.item(rects.length - 1) ?? captured.range.getBoundingClientRect()
          setCitationCandidate({
            selection,
            commentSource: rangeCitationCommentSource({
              range: captured.range,
              observe: editorRoot,
              resolve: () => {
                const nextContentRoot = editorRoot.querySelector<HTMLElement>(
                  '[contenteditable="true"]',
                )
                return nextContentRoot
                  ? resolveRenderedTextRange(nextContentRoot, captured.excerpt, captured.selector)
                  : undefined
              },
            }),
            position: pointer ?? { x: rect.right, y: rect.bottom },
          })
        },
      })
      return observer.dispose
    }, [onCiteSelection])
    const benchTarget = useBenchRouteContextOptional()?.state.target
    const citationSurfaceKey = benchTarget ? benchTargetKey(benchTarget) : undefined
    useEffect(() => {
      const revealCitation = (citation: Citation) =>
        citation.source.kind === "document" && citation.source.path === props.path
          ? revealDocumentCitation(
              editorRootRef.current,
              citation.excerpt,
              citation.source.selector,
            )
          : false
      const unregisterNavigation = registerCitationNavigationHandler(revealCitation)
      const unregisterRevealer = citationSurfaceKey
        ? registerCitationSurfaceRevealer(citationSurfaceKey, revealCitation)
        : undefined
      return () => {
        unregisterNavigation()
        unregisterRevealer?.()
      }
    }, [citationSurfaceKey, props.path])
    const onOpenLink = props.onOpenLink
    const openLink = useCallback(
      (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!onOpenLink || !(event.target instanceof Element)) return
        const anchor = event.target.closest("a")
        if (!(anchor instanceof HTMLAnchorElement)) return
        const href = anchor.getAttribute("href")
        if (!href) return
        onOpenLink(href, { modified: event.metaKey || event.ctrlKey })
        event.preventDefault()
        event.stopPropagation()
      },
      [onOpenLink],
    )

    const plugins = useMarkdownBenchEditorPlugins({
      directory: props.directory,
      documentFormat: props.documentFormat,
      path: props.path,
      obsidianWikiLinkContext,
      onHistoryControlsChange: handleHistoryControlsChange,
      onProcessingErrorChange: handleProcessingErrorChange,
      resolveImageSrc: props.resolveImageSrc,
    })

    useEffect(() => {
      onHistoryControlsChangeRef.current = props.onHistoryControlsChange
    }, [props.onHistoryControlsChange])

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown() {
          return restoreEditorMarkdown(editorRef.current?.getMarkdown() ?? "")
        },
        getSelectionMarkdown() {
          return editorRef.current?.getSelectionMarkdown() ?? ""
        },
        setMarkdown(markdown: string) {
          applyingExternalMarkdownRef.current = true
          processingMarkdownRef.current = markdown
          editorRef.current?.setMarkdown(
            props.documentFormat === "mdx"
              ? prepareMdxForMdxEditor(markdown)
              : prepareMarkdownForMdxEditor(markdown),
          )
          window.queueMicrotask(() => {
            applyingExternalMarkdownRef.current = false
          })
        },
        focus() {
          editorRef.current?.focus()
        },
        redo() {
          historyControlsRef.current.redo()
        },
        scrollToFragment(fragment: string) {
          const editorRoot = editorRootRef.current
          if (!editorRoot) return false
          const target = findMarkdownBenchFragmentTarget(editorRoot, fragment)
          if (!target) return false
          target.scrollIntoView({ block: "center" })
          return true
        },
        undo() {
          historyControlsRef.current.undo()
        },
      }),
      [props.documentFormat, restoreEditorMarkdown],
    )

    useEffect(() => {
      const editor = editorRef.current
      if (!editor) return
      const currentMarkdown = restoreEditorMarkdown(editor.getMarkdown())
      if (currentMarkdown === props.markdown) {
        return
      }

      applyingExternalMarkdownRef.current = true
      editor.setMarkdown(editorMarkdown)
      window.queueMicrotask(() => {
        applyingExternalMarkdownRef.current = false
      })
    }, [editorMarkdown, props.markdown, restoreEditorMarkdown])

    const mdxEditorElement = (
      <div
        ref={paperRef}
        data-component="markdown-bench-paper"
        className={cn(
          "relative",
          isPlainAppearance
            ? MARKDOWN_BENCH_PAPER_PLAIN_CLASS_NAME
            : MARKDOWN_BENCH_PAPER_CARD_CLASS_NAME,
        )}
      >
        <div data-markdown-export-ignore>
          <QuoteCommentMarkers anchors={commentAnchors} />
        </div>
        <div
          data-component="markdown-bench-document-content"
          className={cn(
            isPlainAppearance
              ? MARKDOWN_DOCUMENT_PLAIN_INSET_CLASS_NAME
              : MARKDOWN_DOCUMENT_PAPER_INSET_CLASS_NAME,
          )}
        >
          <div
            data-component="markdown-bench-note-title-row"
            className={cn(
              "flex items-center gap-3",
              propertiesOpen ? "pb-[0.5em]" : "pb-[2em]",
              isPlainAppearance
                ? MARKDOWN_NOTE_TITLE_PLAIN_LAYOUT_CLASS_NAME
                : MARKDOWN_NOTE_TITLE_PAPER_LAYOUT_CLASS_NAME,
            )}
          >
            <div
              role="heading"
              aria-level={1}
              data-component="markdown-bench-note-title"
              data-markdown-export-ignore
              className={cn(MARKDOWN_NOTE_TITLE_BASE_CLASS_NAME, "mb-0 min-w-0 flex-1")}
            >
              <input
                type="text"
                aria-label="Note title"
                aria-busy={props.renamingTitle ? "true" : undefined}
                data-component="markdown-bench-note-title-input"
                className={MARKDOWN_NOTE_TITLE_INPUT_CLASS_NAME}
                readOnly={props.readOnly || !onRenameTitle || props.renamingTitle || isPrintView}
                spellCheck={false}
                value={noteTitleDraft}
                onBlur={commitNoteTitle}
                onChange={(event) => setNoteTitleDraft(event.currentTarget.value)}
                onKeyDown={handleNoteTitleKeyDown}
              />
            </div>
            {hasProperties && !isPrintView ? (
              <MarkdownBenchPropertiesToggle
                open={propertiesOpen}
                onOpenChange={setPropertiesOpen}
              />
            ) : null}
          </div>
          {hasProperties && propertiesOpen && !isPrintView && props.properties ? (
            <MarkdownBenchPropertiesView properties={props.properties} />
          ) : null}
          <MarkdownBenchToolbarContainerContext.Provider
            value={props.advancedToolbarContainer ?? null}
          >
            <MDXEditor
              ref={editorRef}
              className={cn(
                "min-h-full bg-background-base text-text-base",
                MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME,
                MDX_EDITOR_THEME_CLASS_NAME,
              )}
              markdown={editorMarkdown}
              plugins={plugins}
              readOnly={props.readOnly || isPrintView || props.renamingTitle}
              placeholder={props.placeholder}
              suppressHtmlProcessing={props.documentFormat === "mdx"}
              toMarkdownOptions={MARKDOWN_SERIALIZATION_OPTIONS}
              onChange={(nextMarkdown, initialMarkdownNormalize) => {
                if (initialMarkdownNormalize || applyingExternalMarkdownRef.current) {
                  return
                }
                props.onChange(restoreEditorMarkdown(nextMarkdown))
              }}
              contentEditableClassName={cn(
                MARKDOWN_CONTENT_BASE_CLASS_NAME,
                isPlainAppearance
                  ? MARKDOWN_CONTENT_PLAIN_LAYOUT_CLASS_NAME
                  : MARKDOWN_CONTENT_PAPER_LAYOUT_CLASS_NAME,
              )}
            />
          </MarkdownBenchToolbarContainerContext.Provider>
        </div>
      </div>
    )

    return (
      <div
        ref={editorRootRef}
        data-component="markdown-bench-editor"
        data-appearance={appearance}
        data-dirty={props.dirty ? "true" : "false"}
        data-saving={props.saving ? "true" : "false"}
        data-conflict={props.conflict ? "true" : "false"}
        data-version={props.version}
        data-content-theme={props.contentTheme?.mode}
        data-obsidian-vault={obsidianWikiLinkContext.compatible ? "true" : "false"}
        data-markdown-bench-theme-scope={themeScopeID}
        className={cn(
          "markdown-bench-editor relative h-full min-h-0 overflow-y-auto text-text-base",
          isPlainAppearance
            ? "bg-background-base"
            : cn("bg-background-base pb-48", MARKDOWN_BENCH_DOCUMENT_GUTTER_CLASS),
          props.className,
        )}
        onClickCapture={openLink}
      >
        <CitationSelectionToolbar
          actionRef={citationActionRef}
          position={citationCandidate?.position}
          onCite={() => {
            if (!citationCandidate) return
            props.onCiteSelection?.(citationCandidate.selection, citationCandidate.commentSource)
            setCitationCandidate(undefined)
            window.getSelection()?.removeAllRanges()
          }}
        />
        {scopedThemeCss ? (
          <style data-markdown-bench-content-theme-style data-markdown-export-ignore>
            {scopedThemeCss}
          </style>
        ) : null}
        <style data-markdown-bench-mdx-popup-layer-style data-markdown-export-ignore>
          {MARKDOWN_BENCH_MDX_POPUP_LAYER_CSS}
        </style>
        <style data-markdown-bench-table-style data-markdown-export-ignore>
          {MARKDOWN_BENCH_TABLE_CSS}
        </style>
        <MarkdownBenchChemistryViewProvider value={chemistryViewOptions}>
          {mermaidViewOptions ? (
            <MarkdownBenchMermaidViewProvider value={mermaidViewOptions}>
              <MarkdownBenchIntrinsicScope
                value={{
                  directory: props.directory,
                  documentPath: props.path,
                  resolveImageSrc: props.resolveImageSrc,
                }}
              >
                {mdxEditorElement}
              </MarkdownBenchIntrinsicScope>
            </MarkdownBenchMermaidViewProvider>
          ) : (
            <MarkdownBenchIntrinsicScope
              value={{
                directory: props.directory,
                documentPath: props.path,
                resolveImageSrc: props.resolveImageSrc,
              }}
            >
              {mdxEditorElement}
            </MarkdownBenchIntrinsicScope>
          )}
        </MarkdownBenchChemistryViewProvider>
      </div>
    )
  },
)
