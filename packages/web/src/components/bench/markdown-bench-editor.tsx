import {
  KitchenSinkToolbar,
  MDXEditor,
  NestedLexicalEditor,
  createActiveEditorSubscription$,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  directivesPlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  jsxPlugin,
  linkPlugin,
  linkDialogPlugin,
  listsPlugin,
  markdownProcessingError$,
  markdownShortcutPlugin,
  quotePlugin,
  realmPlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  viewMode$,
  type MDXEditorMethods,
  type JsxComponentDescriptor,
  type JsxEditorProps,
} from "@mdxeditor/editor"
import "@mdxeditor/editor/style.css"
import { createPortal } from "react-dom"
import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical"
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { RootContent } from "mdast"
import { cn } from "@buddy/ui"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import { markdownClassName } from "@/components/markdown/markdown-html-segment"
import {
  prepareMarkdownForMdxEditor,
  prepareMdxForMdxEditor,
} from "@/components/bench/markdown-bench-compatibility"
import {
  canRenderMdxIntrinsic,
  MarkdownBenchIntrinsicScope,
  MarkdownBenchMdxIntrinsicPreview,
} from "@/components/bench/markdown-bench-mdx-intrinsic"
import { resolveMarkdownBenchImageSrc } from "@/lib/markdown-bench-image-src"
import { BUDDY_CODE_MIRROR_EXTENSIONS } from "@/components/bench/markdown-bench-code-theme"
import { buddyMathPlugin } from "@/components/bench/markdown-bench-math-plugin"
import {
  MarkdownBenchMermaidViewProvider,
  buddyMermaidPlugin,
  type MarkdownBenchMermaidViewOptions,
} from "@/components/bench/markdown-bench-mermaid-plugin"
import {
  buildMarkdownBenchContentThemeCss,
  sanitizeMarkdownBenchThemeScopeID,
  type MarkdownBenchContentTheme,
} from "@/components/bench/markdown-bench-document-theme"
import { MARKDOWN_BENCH_DIRECTIVE_DESCRIPTORS } from "@/components/bench/markdown-bench-directives"

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
  undo(): void
}

export type MarkdownBenchHistoryControlsState = {
  canRedo: boolean
  canUndo: boolean
}

export type MarkdownBenchDocumentSelection = {
  text: string
  headingPath?: string[]
}

type MarkdownBenchHistoryControls = MarkdownBenchHistoryControlsState & {
  redo(): void
  undo(): void
}

type MarkdownBenchHistoryPluginParams = {
  onChange(controls: MarkdownBenchHistoryControls): void
}

type MarkdownBenchEditorProps = Pick<
  MarkdownBenchEditorContract,
  "markdown" | "version" | "dirty" | "saving" | "conflict" | "onChange"
> & {
  advancedToolbarContainer?: HTMLElement | null
  className?: string
  contentFontScale?: number
  contentTheme?: MarkdownBenchContentTheme
  directory: string
  documentFormat: MarkdownBenchDocumentFormat
  path: string
  placeholder?: ReactNode
  onHistoryControlsChange?(controls: MarkdownBenchHistoryControlsState): void
  onSelectionChange?(selection: MarkdownBenchDocumentSelection): void
}

const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  txt: "Plain text",
  js: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  css: "CSS",
  html: "HTML",
  json: "JSON",
  markdown: "Markdown",
  bash: "Bash",
  python: "Python",
}

const MARKDOWN_SERIALIZATION_OPTIONS = {
  listItemIndent: "one",
  resourceLink: false,
} as const

type MdxFlowChild = Extract<
  JsxEditorProps["mdastNode"],
  { type: "mdxJsxFlowElement" }
>["children"][number]
type MdxTextChild = Extract<
  JsxEditorProps["mdastNode"],
  { type: "mdxJsxTextElement" }
>["children"][number]

function isMdxFlowChild(node: RootContent): node is MdxFlowChild {
  switch (node.type) {
    case "blockquote":
    case "code":
    case "definition":
    case "footnoteDefinition":
    case "heading":
    case "html":
    case "list":
    case "math":
    case "mdxJsxFlowElement":
    case "paragraph":
    case "table":
    case "thematicBreak":
    case "yaml":
      return true
    default:
      return false
  }
}

function isMdxTextChild(node: RootContent): node is MdxTextChild {
  switch (node.type) {
    case "break":
    case "delete":
    case "emphasis":
    case "html":
    case "image":
    case "imageReference":
    case "inlineCode":
    case "link":
    case "linkReference":
    case "mdxJsxTextElement":
    case "strong":
    case "text":
      return true
    default:
      return false
  }
}

function GenericMdxComponentEditor({ mdastNode }: JsxEditorProps) {
  if (canRenderMdxIntrinsic(mdastNode.name)) {
    return <MarkdownBenchMdxIntrinsicPreview mdastNode={mdastNode} />
  }

  const label = (
    <code className="rounded bg-surface-inset-base px-1.5 py-0.5 text-xs text-text-weak">
      {mdastNode.name ?? "Fragment"}
    </code>
  )

  if (mdastNode.type === "mdxJsxTextElement") {
    const content = mdastNode.children.length > 0 && (
      <NestedLexicalEditor<typeof mdastNode>
        getContent={(node) => node.children}
        getUpdatedMdastNode={(node, children) => ({
          ...node,
          children: children.filter(isMdxTextChild),
        })}
      />
    )

    return (
      <span data-component="markdown-bench-mdx-component" className="inline-flex items-baseline gap-1">
        {label}
        {content}
      </span>
    )
  }

  const content = mdastNode.children.length > 0 && (
    <NestedLexicalEditor<typeof mdastNode>
      block
      getContent={(node) => node.children}
      getUpdatedMdastNode={(node, children) => ({
        ...node,
        children: children.filter(isMdxFlowChild),
      })}
    />
  )

  return (
    <div
      data-component="markdown-bench-mdx-component"
      className="my-2 rounded-md border border-border-weak-base bg-surface-weak p-3"
    >
      {label}
      {content}
    </div>
  )
}

const GENERIC_MDX_COMPONENT_DESCRIPTOR = {
  name: "*",
  kind: "flow",
  props: [],
  hasChildren: true,
  Editor: GenericMdxComponentEditor,
} satisfies JsxComponentDescriptor

const EMPTY_MARKDOWN_BENCH_HISTORY_CONTROLS: MarkdownBenchHistoryControls = {
  canRedo: false,
  canUndo: false,
  redo() {},
  undo() {},
}

const MDX_EDITOR_THEME_CLASS_NAME = [
  "![--accentBase:var(--surface-interactive-weak)]",
  "![--accentBgSubtle:var(--surface-interactive-weak)]",
  "![--accentBg:var(--surface-interactive-base)]",
  "![--accentBgHover:var(--surface-interactive-base-hover)]",
  "![--accentBgActive:var(--surface-interactive-hover)]",
  "![--accentLine:var(--border-interactive-base)]",
  "![--accentBorder:var(--border-interactive-base)]",
  "![--accentBorderHover:var(--border-interactive-hover)]",
  "![--accentSolid:var(--button-primary-base)]",
  "![--accentSolidHover:var(--button-primary-hover)]",
  "![--accentText:var(--text-interactive-base)]",
  "![--accentTextContrast:var(--text-strong)]",
  "![--basePageBg:var(--background-base)]",
  "![--baseBase:var(--background-base)]",
  "![--baseBgSubtle:var(--surface-inset-base)]",
  "![--baseBg:var(--surface-base)]",
  "![--baseBgHover:var(--surface-base-hover)]",
  "![--baseBgActive:var(--surface-raised-base)]",
  "![--baseLine:var(--border-weaker-base)]",
  "![--baseBorder:var(--border-base)]",
  "![--baseBorderHover:var(--border-hover)]",
  "![--baseSolid:var(--icon-weak)]",
  "![--baseSolidHover:var(--icon-base)]",
  "![--baseText:var(--text-weak)]",
  "![--baseTextContrast:var(--text-strong)]",
  "![--color-text-base:var(--markdown-text)]",
  "![--color-text-strong:var(--markdown-heading)]",
  "![--color-text-weak:var(--markdown-block-quote)]",
  "![--color-text-weaker:var(--text-weaker)]",
  "![--color-text-interactive-base:var(--markdown-link-text)]",
  "![--color-syntax-string:var(--markdown-code)]",
  "![--error-color:var(--text-critical-base)]",
  "![--font-body:var(--font-sans)]",
  "![--font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace]",
  "[&_.cm-editor]:!bg-background-stronger [&_.cm-editor]:!text-text-base",
  "[&_.cm-gutters]:!border-border-weaker-base [&_.cm-gutters]:!bg-background-stronger",
].join(" ")

function MarkdownBenchAdvancedToolbarPortal(props: { container?: HTMLElement | null }) {
  if (!props.container) return null
  return createPortal(
    <div
      data-component="markdown-bench-advanced-toolbar"
      className={cn(
        "mdxeditor flex min-w-max items-center gap-1 px-1 [&_[data-toolbar-item]]:mx-0.5 [&_[role='separator']]:mx-2",
        MDX_EDITOR_THEME_CLASS_NAME,
      )}
    >
      <KitchenSinkToolbar />
    </div>,
    props.container,
  )
}

const MARKDOWN_CONTENT_CLASS_NAME = [
  markdownClassName,
  "min-h-[calc(100vh-12rem)] px-[clamp(0px,calc((100%_-_28rem)/6),2rem)] py-[clamp(0px,calc((100%_-_28rem)/4),3rem)] focus:outline-none",
  // MDXEditor uses --text-base for font sizing, which shadows Buddy's color token alias.
  "![color:var(--markdown-text)]",
  "![font-size:calc(var(--buddy-font-size-sm)*var(--markdown-bench-document-font-scale))]",
  // Lexical can apply its code-format class to nested strong/em nodes inside semantic <code>.
  "[&_code]:!bg-transparent [&_code]:!p-0 [&_code]:!text-[var(--color-syntax-string)]",
  "[&_code_*]:!bg-transparent [&_code_*]:!p-0 [&_code_*]:!text-inherit",
].join(" ")

const MARKDOWN_BENCH_SELECTION_EDGE_WIDTH_PX = 3
const MARKDOWN_BENCH_SELECTION_EDGE_MIN_HEIGHT_PX = 3
const MARKDOWN_BENCH_DOCUMENT_GUTTER_CLASS =
  "px-[clamp(0px,calc((100%_-_28rem)/8),1.5rem)] pt-[clamp(0px,calc((100%_-_28rem)/8),1.5rem)]"

type MarkdownBenchSelectionSection = {
  top: number
  height: number
}

function headingLevel(element: Element): number | undefined {
  const match = element.tagName.match(/^H([1-6])$/u)
  if (!match?.[1]) return undefined
  const level = Number.parseInt(match[1], 10)
  return Number.isFinite(level) ? level : undefined
}

function isHeadingBeforeSelectionStart(heading: Element, startContainer: Node): boolean {
  if (heading === startContainer) return true
  const position = heading.compareDocumentPosition(startContainer)
  return (
    (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ||
    (position & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0
  )
}

function resolveSelectionHeadingPath(editorRoot: HTMLElement, range: Range): string[] | undefined {
  const headingPath: string[] = []
  const headings = editorRoot.querySelectorAll("h1,h2,h3,h4,h5,h6")

  for (const heading of headings) {
    if (!isHeadingBeforeSelectionStart(heading, range.startContainer)) {
      break
    }

    const level = headingLevel(heading)
    const text = heading.textContent?.trim()
    if (level === undefined || !text) {
      continue
    }

    headingPath.splice(level - 1)
    headingPath[level - 1] = text
  }

  const compactHeadingPath = headingPath.filter((entry) => entry.length > 0)
  return compactHeadingPath.length > 0 ? compactHeadingPath : undefined
}

function resolveMarkdownBenchSelectionSection(input: {
  range: Range
  scrollRoot: HTMLElement
}): MarkdownBenchSelectionSection | undefined {
  const rootRect = input.scrollRoot.getBoundingClientRect()
  const rects = Array.from(input.range.getClientRects())
    .map((rect) => ({
      top: rect.top - rootRect.top + input.scrollRoot.scrollTop,
      height: rect.height,
    }))
    .filter((rect) => rect.height >= MARKDOWN_BENCH_SELECTION_EDGE_MIN_HEIGHT_PX)
    .toSorted((left, right) => left.top - right.top)

  if (rects.length === 0) {
    return undefined
  }

  const first = rects[0]
  const last = rects.at(-1)
  if (!first || !last) {
    return undefined
  }

  return {
    top: first.top,
    height: last.top + last.height - first.top,
  }
}

const markdownBenchHistoryControlsPlugin = realmPlugin<MarkdownBenchHistoryPluginParams>({
  init(realm, params) {
    realm.pub(createActiveEditorSubscription$, (editor) => {
      let active = true
      let canRedo = false
      let canUndo = false

      const publish = () => {
        const controls = {
          canRedo,
          canUndo,
          redo() {
            editor.dispatchCommand(REDO_COMMAND, undefined)
          },
          undo() {
            editor.dispatchCommand(UNDO_COMMAND, undefined)
          },
        }
        queueMicrotask(() => {
          if (active) params?.onChange(controls)
        })
      }

      publish()

      const unregisterCanUndo = editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          canUndo = payload
          publish()
          return false
        },
        COMMAND_PRIORITY_CRITICAL,
      )
      const unregisterCanRedo = editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          canRedo = payload
          publish()
          return false
        },
        COMMAND_PRIORITY_CRITICAL,
      )

      return () => {
        active = false
        unregisterCanUndo()
        unregisterCanRedo()
      }
    })
  },
})

const markdownBenchErrorRecoveryPlugin = realmPlugin({
  init(realm) {
    realm.sub(markdownProcessingError$, (error) => {
      if (!error) return
      queueMicrotask(() => {
        realm.pub(viewMode$, "source")
      })
    })
  },
})

export const MarkdownBenchEditor = forwardRef<MarkdownBenchEditorHandle, MarkdownBenchEditorProps>(
  function MarkdownBenchEditor(props, ref) {
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
    const editorMarkdown = useMemo(
      () =>
        props.documentFormat === "mdx"
          ? prepareMdxForMdxEditor(props.markdown)
          : prepareMarkdownForMdxEditor(props.markdown),
      [props.documentFormat, props.markdown],
    )
    const onSelectionChange = props.onSelectionChange
    const handleHistoryControlsChange = useCallback((controls: MarkdownBenchHistoryControls) => {
      historyControlsRef.current = controls
      onHistoryControlsChangeRef.current?.({
        canRedo: controls.canRedo,
        canUndo: controls.canUndo,
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
        onSelectionChange({
          text: selection.toString().trim(),
          ...(headingPath ? { headingPath } : {}),
        })
      })
    }, [onSelectionChange])
    const plugins = useMemo(
      () => [
        diffSourcePlugin({
          codeMirrorExtensions: BUDDY_CODE_MIRROR_EXTENSIONS,
          viewMode: "rich-text",
        }),
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        buddyMathPlugin(),
        buddyMermaidPlugin(),
        linkPlugin(),
        linkDialogPlugin({
          showLinkTitleField: true,
        }),
        tablePlugin(),
        codeBlockPlugin(),
        codeMirrorPlugin({
          codeBlockLanguages: CODE_BLOCK_LANGUAGES,
          codeMirrorExtensions: BUDDY_CODE_MIRROR_EXTENSIONS,
        }),
        frontmatterPlugin(),
        imagePlugin({
          imagePreviewHandler: (src) =>
            Promise.resolve(
              resolveMarkdownBenchImageSrc({
                directory: props.directory,
                documentPath: props.path,
                src,
              }),
            ),
        }),
        directivesPlugin({
          directiveDescriptors: MARKDOWN_BENCH_DIRECTIVE_DESCRIPTORS,
        }),
        ...(props.documentFormat === "mdx"
          ? [
              jsxPlugin({
                allowFragment: false,
                jsxComponentDescriptors: [GENERIC_MDX_COMPONENT_DESCRIPTOR],
              }),
            ]
          : []),
        markdownBenchErrorRecoveryPlugin(),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarClassName: "!hidden",
          toolbarContents: () => (
            <MarkdownBenchAdvancedToolbarPortal
              container={props.advancedToolbarContainer}
            />
          ),
        }),
        markdownBenchHistoryControlsPlugin({
          onChange: handleHistoryControlsChange,
        }),
      ],
      [
        handleHistoryControlsChange,
        props.advancedToolbarContainer,
        props.directory,
        props.documentFormat,
        props.path,
      ],
    )

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
          return editorRef.current?.getMarkdown() ?? ""
        },
        getSelectionMarkdown() {
          return editorRef.current?.getSelectionMarkdown() ?? ""
        },
        setMarkdown(markdown: string) {
          applyingExternalMarkdownRef.current = true
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
        undo() {
          historyControlsRef.current.undo()
        },
      }),
      [props.documentFormat],
    )

    useEffect(() => {
      const editor = editorRef.current
      if (!editor) return
      const currentMarkdown = editor.getMarkdown()
      if (currentMarkdown === props.markdown) {
        return
      }

      applyingExternalMarkdownRef.current = true
      editor.setMarkdown(editorMarkdown)
      window.queueMicrotask(() => {
        applyingExternalMarkdownRef.current = false
      })
    }, [editorMarkdown, props.markdown])

    const mdxEditorElement = (
      <div
        data-component="markdown-bench-paper"
        className="mx-auto w-full max-w-3xl min-h-full overflow-hidden rounded-lg border border-border-weak-base bg-background-base shadow-sm"
      >
        <MDXEditor
          ref={editorRef}
          className={cn(
            "min-h-full bg-background-base text-text-base",
            MDX_EDITOR_THEME_CLASS_NAME,
          )}
          markdown={editorMarkdown}
          plugins={plugins}
          readOnly={isPrintView}
          placeholder={props.placeholder}
          suppressHtmlProcessing={props.documentFormat === "mdx"}
          toMarkdownOptions={MARKDOWN_SERIALIZATION_OPTIONS}
          onChange={(nextMarkdown, initialMarkdownNormalize) => {
            if (initialMarkdownNormalize || applyingExternalMarkdownRef.current) {
              return
            }
            props.onChange(nextMarkdown)
          }}
          contentEditableClassName={MARKDOWN_CONTENT_CLASS_NAME}
        />
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
        data-markdown-bench-theme-scope={themeScopeID}
        className={cn(
          "markdown-bench-editor relative h-full min-h-0 overflow-y-auto bg-background-weak pb-48 text-text-base",
          MARKDOWN_BENCH_DOCUMENT_GUTTER_CLASS,
          props.className,
        )}
        onPointerUp={notifySelectionChange}
        onKeyUp={notifySelectionChange}
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
      </div>
    )
  },
)
