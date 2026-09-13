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
import { cn } from "@buddy/ui"
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
import {
  resolveMarkdownBenchSelectionSection,
  resolveSelectionHeadingPath,
  type MarkdownBenchSelectionSection,
} from "@/components/bench/markdown/editor-selection"
import {
  MARKDOWN_BENCH_DOCUMENT_GUTTER_CLASS,
  MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME,
  MARKDOWN_BENCH_MDX_POPUP_LAYER_CSS,
  MARKDOWN_BENCH_PAPER_CARD_CLASS_NAME,
  MARKDOWN_BENCH_PAPER_PLAIN_CLASS_NAME,
  MARKDOWN_BENCH_SELECTION_EDGE_WIDTH_PX,
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
  readOnly?: boolean
  viewportKey?: string
  obsidianWikiLinkContext?: ObsidianWikiLinkContext
  onHistoryControlsChange?(controls: MarkdownBenchHistoryControlsState): void
  onOpenLink?(href: string): void
  onProcessingResult?(result: MarkdownBenchProcessingResult): void
  onRenameTitle?(title: string): Promise<void>
  onSelectionChange?(selection: MarkdownBenchDocumentSelection): void
  renamingTitle?: boolean
}

const MARKDOWN_SERIALIZATION_OPTIONS = {
  listItemIndent: "one",
  resourceLink: false,
} as const

export const MarkdownBenchEditor = forwardRef<MarkdownBenchEditorHandle, MarkdownBenchEditorProps>(
  function MarkdownBenchEditor(props, ref) {
    const appearance = props.appearance ?? "paper"
    const isPlainAppearance = appearance === "plain"
    const editorRef = useRef<MDXEditorMethods>(null)
    const editorRootRef = useRef<HTMLDivElement>(null)
    const [selectionSection, setSelectionSection] = useState<
      MarkdownBenchSelectionSection | undefined
    >(undefined)
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
    const cancelTitleCommitRef = useRef(false)
    useEffect(() => {
      setNoteTitleDraft(noteTitle)
    }, [noteTitle])
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
    const onSelectionChange = props.onSelectionChange
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
    const notifySelectionChange = useCallback(() => {
      if (!onSelectionChange) return
      window.requestAnimationFrame(() => {
        const editorRoot = editorRootRef.current
        const selection = window.getSelection()
        if (
          !editorRoot ||
          !selection ||
          selection.isCollapsed ||
          selection.rangeCount === 0 ||
          !selection.anchorNode ||
          !selection.focusNode ||
          !editorRoot.contains(selection.anchorNode) ||
          !editorRoot.contains(selection.focusNode)
        ) {
          setSelectionSection(undefined)
          onSelectionChange({ text: "" })
          return
        }

        const range = selection.getRangeAt(0)
        setSelectionSection(resolveMarkdownBenchSelectionSection({ range, scrollRoot: editorRoot }))
        const headingPath = resolveSelectionHeadingPath(editorRoot, range)
        onSelectionChange(
          Object.assign(
            { text: selection.toString().trim() },
            headingPath ? { headingPath } : undefined,
          ),
        )
      })
    }, [onSelectionChange])
    const onOpenLink = props.onOpenLink
    const openLink = useCallback(
      (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!onOpenLink || !(event.target instanceof Element)) return
        const anchor = event.target.closest("a")
        if (!(anchor instanceof HTMLAnchorElement)) return
        const href = anchor.getAttribute("href")
        if (!href) return
        event.preventDefault()
        event.stopPropagation()
        onOpenLink(href)
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
    })

    useEffect(() => {
      setSelectionSection(undefined)
    }, [props.markdown])

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
        data-component="markdown-bench-paper"
        className={
          isPlainAppearance
            ? MARKDOWN_BENCH_PAPER_PLAIN_CLASS_NAME
            : MARKDOWN_BENCH_PAPER_CARD_CLASS_NAME
        }
      >
        <div
          data-component="markdown-bench-document-content"
          className={cn(
            isPlainAppearance
              ? MARKDOWN_DOCUMENT_PLAIN_INSET_CLASS_NAME
              : MARKDOWN_DOCUMENT_PAPER_INSET_CLASS_NAME,
          )}
        >
          <div
            role="heading"
            aria-level={1}
            data-component="markdown-bench-note-title"
            data-markdown-export-ignore
            className={cn(
              MARKDOWN_NOTE_TITLE_BASE_CLASS_NAME,
              isPlainAppearance
                ? MARKDOWN_NOTE_TITLE_PLAIN_LAYOUT_CLASS_NAME
                : MARKDOWN_NOTE_TITLE_PAPER_LAYOUT_CLASS_NAME,
            )}
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
            : cn("bg-background-weak pb-48", MARKDOWN_BENCH_DOCUMENT_GUTTER_CLASS),
          props.className,
        )}
        onPointerUp={notifySelectionChange}
        onKeyUp={notifySelectionChange}
        onClickCapture={openLink}
      >
        {selectionSection ? (
          <div
            aria-hidden
            data-component="markdown-bench-selection-section-overlay"
            className="pointer-events-none absolute left-1/2 top-0 z-20 w-full max-w-3xl -translate-x-1/2"
          >
            <div
              data-component="markdown-bench-selection-section"
              className="absolute left-0 right-0 bg-[color:color-mix(in_oklab,var(--surface-warning-base)_42%,transparent)]"
              style={{
                top: selectionSection.top,
                height: selectionSection.height,
              }}
            >
              <div
                data-component="markdown-bench-selection-edge"
                className="absolute inset-y-0 left-0 rounded-r-sm bg-border-warning-base"
                style={{ width: MARKDOWN_BENCH_SELECTION_EDGE_WIDTH_PX }}
              />
            </div>
          </div>
        ) : null}
        {scopedThemeCss ? (
          <style data-markdown-bench-content-theme-style data-markdown-export-ignore>
            {scopedThemeCss}
          </style>
        ) : null}
        <style data-markdown-bench-mdx-popup-layer-style data-markdown-export-ignore>
          {MARKDOWN_BENCH_MDX_POPUP_LAYER_CSS}
        </style>
        <MarkdownBenchChemistryViewProvider value={chemistryViewOptions}>
          {mermaidViewOptions ? (
            <MarkdownBenchMermaidViewProvider value={mermaidViewOptions}>
              <MarkdownBenchIntrinsicScope
                value={{ directory: props.directory, documentPath: props.path }}
              >
                {mdxEditorElement}
              </MarkdownBenchIntrinsicScope>
            </MarkdownBenchMermaidViewProvider>
          ) : (
            <MarkdownBenchIntrinsicScope
              value={{ directory: props.directory, documentPath: props.path }}
            >
              {mdxEditorElement}
            </MarkdownBenchIntrinsicScope>
          )}
        </MarkdownBenchChemistryViewProvider>
      </div>
    )
  },
)
