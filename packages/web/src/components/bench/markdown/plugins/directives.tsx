import {
  NestedLexicalEditor,
  NESTED_EDITOR_UPDATED_COMMAND,
  editorInFocus$,
  exportLexicalTreeToMdast,
  exportVisitors$,
  jsxComponentDescriptors$,
  jsxIsAvailable$,
  useNestedEditorContext,
  useRealm,
  type DirectiveDescriptor,
  type DirectiveEditorProps,
} from "@mdxeditor/editor"
import { Marked, type Token, type TokenizerExtension } from "marked"
import type { RootContent } from "mdast"
import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import {
  $getNodeByKey,
  $getRoot,
  BLUR_COMMAND,
  COMMAND_PRIORITY_HIGH,
  HISTORIC_TAG,
  getNearestEditorFromDOMNode,
} from "lexical"
import { cn } from "@buddy/ui"
import { ObsidianWikiLinkView } from "@/components/bench/markdown/plugins/obsidian"
import { parseTString } from "@/components/chat/tools/types"
import { registerMarkdownBenchNestedListFidelity } from "@/components/bench/markdown/plugins/list-fidelity"

type ContainerDirectiveNode = Extract<
  DirectiveEditorProps["mdastNode"],
  { type: "containerDirective" }
>

type ContainerDirectiveChild = ContainerDirectiveNode["children"][number]

type MarkdownBenchAdmonitionTone = "critical" | "info" | "neutral" | "success" | "warning"

type MarkdownBenchAdmonitionConfig = {
  label: string
  tone: MarkdownBenchAdmonitionTone
}

/** Keep clean nested bodies in their imported form for source-preserving editors. */
export const MarkdownBenchSourcePreservationContext = createContext(false)

const MARKDOWN_BENCH_ADMONITION_CONFIGS = {
  abstract: { label: "Abstract", tone: "neutral" },
  bug: { label: "Bug", tone: "critical" },
  caution: { label: "Caution", tone: "warning" },
  danger: { label: "Danger", tone: "critical" },
  error: { label: "Error", tone: "critical" },
  example: { label: "Example", tone: "neutral" },
  failure: { label: "Failure", tone: "critical" },
  important: { label: "Important", tone: "info" },
  info: { label: "Info", tone: "info" },
  note: { label: "Note", tone: "neutral" },
  question: { label: "Question", tone: "info" },
  quote: { label: "Quote", tone: "neutral" },
  success: { label: "Success", tone: "success" },
  tip: { label: "Tip", tone: "success" },
  warning: { label: "Warning", tone: "warning" },
} as const satisfies Record<string, MarkdownBenchAdmonitionConfig>

const MARKDOWN_BENCH_OBSIDIAN_CALLOUT_KIND_ALIASES = {
  attention: "warning",
  check: "success",
  cite: "quote",
  done: "success",
  faq: "question",
  fail: "failure",
  help: "question",
  hint: "tip",
  missing: "failure",
  summary: "abstract",
  tldr: "abstract",
} as const satisfies Record<string, keyof typeof MARKDOWN_BENCH_ADMONITION_CONFIGS>

const MARKDOWN_BENCH_ADMONITION_TONE_CLASS_NAMES = {
  critical:
    "border-border-critical-base/45 border-l-border-critical-base bg-surface-critical-weak text-text-on-critical-weak",
  info: "border-border-info-base/45 border-l-border-info-base bg-surface-info-weak text-text-on-info-weak",
  neutral: "border-border-weak-base border-l-border-strong-base bg-surface-weak text-text-base",
  success:
    "border-border-success-base/45 border-l-border-success-base bg-surface-success-weak text-text-on-success-weak",
  warning:
    "border-border-warning-base/55 border-l-border-warning-base bg-surface-warning-weak text-text-on-warning-weak",
} as const satisfies Record<MarkdownBenchAdmonitionTone, string>

const MARKDOWN_BENCH_ADMONITION_LABEL_CLASS_NAMES = {
  critical: "text-text-critical-strong",
  info: "text-text-info-strong",
  neutral: "text-text-strong",
  success: "text-text-success-base",
  warning: "text-text-warning-base",
} as const satisfies Record<MarkdownBenchAdmonitionTone, string>

const MARKDOWN_BENCH_DIRECTIVE_SHELL_CLASS_NAME =
  "my-4 overflow-hidden rounded-md border border-l-[3px] px-4 py-3 shadow-sm"

const MARKDOWN_BENCH_DIRECTIVE_LABEL_CLASS_NAME =
  "mb-2 flex min-h-4 items-center text-xs font-semibold leading-none"

const MARKDOWN_BENCH_CALLOUT_TITLE_CLASS_NAME = [
  "min-w-0 break-words",
  "[&_code]:rounded-sm [&_code]:bg-surface-inset-base [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]",
  "[&_a]:text-text-interactive-base [&_a]:underline [&_a]:underline-offset-2",
].join(" ")

const MARKDOWN_BENCH_CALLOUT_TITLE_WIKILINK_TYPE = "obsidianWikiLink"
const MARKDOWN_BENCH_CALLOUT_TITLE_WIKILINK_START_PATTERN = /!?\[\[/u
const MARKDOWN_BENCH_CALLOUT_TITLE_WIKILINK_PATTERN = /^(!?)\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/u
const MARKDOWN_BENCH_CALLOUT_TITLE_LINK_HREF_PATTERN =
  /^(?:(?:https?|mailto|obsidian):|[^:/?#]*(?:[/?#]|$))/iu
const MARKDOWN_BENCH_CALLOUT_TITLE_CHARACTER_REFERENCE_PATTERN =
  /&(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/giu

const MARKDOWN_BENCH_CALLOUT_TITLE_WIKILINK_EXTENSION: TokenizerExtension = {
  name: MARKDOWN_BENCH_CALLOUT_TITLE_WIKILINK_TYPE,
  level: "inline",
  start(src) {
    return src.search(MARKDOWN_BENCH_CALLOUT_TITLE_WIKILINK_START_PATTERN)
  },
  tokenizer(src) {
    const match = MARKDOWN_BENCH_CALLOUT_TITLE_WIKILINK_PATTERN.exec(src)
    const target = match?.[2]?.trim()
    if (!match || !target) return undefined
    return {
      type: MARKDOWN_BENCH_CALLOUT_TITLE_WIKILINK_TYPE,
      raw: match[0],
      target,
      alias: match[3]?.trim(),
      embed: match[1] === "!",
    }
  },
}

const MARKDOWN_BENCH_CALLOUT_TITLE_MARKED = new Marked({
  extensions: [MARKDOWN_BENCH_CALLOUT_TITLE_WIKILINK_EXTENSION],
})

const MARKDOWN_BENCH_DIRECTIVE_CONTENT_CLASS_NAME = [
  "min-w-0 text-[0.875em] leading-[1.7142857]",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_[contenteditable]>*:first-child]:mt-0 [&_[contenteditable]>*:last-child]:mb-0",
].join(" ")

const MARKDOWN_BENCH_NESTED_DIRECTIVE_EDITOR_CLASS_NAME = [
  "min-w-0 max-w-full break-words !rounded-none !bg-transparent !p-0 outline-none",
  "[&_p]:my-0 [&_p+p]:mt-3",
  "[&_h1]:mt-0 [&_h1]:mb-3 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:leading-6",
  "[&_h2]:mt-0 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-6",
  "[&_h3]:mt-0 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:leading-6",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_li]:my-1 [&_li]:pl-1 [&_li>p]:my-0",
  "[&_strong]:font-semibold",
  "[&_code]:rounded-sm [&_code]:bg-surface-inset-base [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]",
].join(" ")

function isMarkdownBenchAdmonitionName(
  name: string | null,
): name is keyof typeof MARKDOWN_BENCH_ADMONITION_CONFIGS {
  return name !== null && Object.hasOwn(MARKDOWN_BENCH_ADMONITION_CONFIGS, name)
}

function isMarkdownBenchObsidianCalloutKindAlias(
  name: string,
): name is keyof typeof MARKDOWN_BENCH_OBSIDIAN_CALLOUT_KIND_ALIASES {
  return Object.hasOwn(MARKDOWN_BENCH_OBSIDIAN_CALLOUT_KIND_ALIASES, name)
}

function resolveMarkdownBenchObsidianCalloutConfig(kind: string): MarkdownBenchAdmonitionConfig {
  const normalizedKind = kind.toLowerCase()
  if (isMarkdownBenchAdmonitionName(normalizedKind)) {
    return MARKDOWN_BENCH_ADMONITION_CONFIGS[normalizedKind]
  }
  if (isMarkdownBenchObsidianCalloutKindAlias(normalizedKind)) {
    return MARKDOWN_BENCH_ADMONITION_CONFIGS[
      MARKDOWN_BENCH_OBSIDIAN_CALLOUT_KIND_ALIASES[normalizedKind]
    ]
  }
  return MARKDOWN_BENCH_ADMONITION_CONFIGS.note
}

function isContainerDirectiveChild(node: RootContent): node is ContainerDirectiveChild {
  switch (node.type) {
    case "blockquote":
    case "code":
    case "containerDirective":
    case "definition":
    case "footnoteDefinition":
    case "heading":
    case "html":
    case "leafDirective":
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

const CHECK_LIST_ITEM_EVENT_TYPES = ["click", "pointerdown"] as const

function keepCheckListItemEventInNestedEditor(event: Event) {
  const target = event.target
  if (
    target instanceof HTMLElement &&
    target.tagName === "LI" &&
    target.getAttribute("role") === "checkbox"
  ) {
    event.stopPropagation()
  }
}

function MarkdownBenchContainerDirectiveBody({ mdastNode }: { mdastNode: ContainerDirectiveNode }) {
  const preserveSource = useContext(MarkdownBenchSourcePreservationContext)
  const nestedContext = useNestedEditorContext<ContainerDirectiveNode>()
  const realm = useRealm()
  const contentRef = useRef<HTMLDivElement>(null)
  const contentChangedRef = useRef(false)
  const currentRef = useRef({ mdastNode, nestedContext, preserveSource })
  currentRef.current = { mdastNode, nestedContext, preserveSource }
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const editable = content.querySelector<HTMLElement>('[data-lexical-editor="true"]')
    const editor = editable ? getNearestEditorFromDOMNode(editable) : undefined
    if (!editor) return
    const unregisterListFidelity = registerMarkdownBenchNestedListFidelity(editor)
    let active = true
    let initialized = !editor.getEditorState().isEmpty()
    let previousContent = JSON.stringify(editor.getEditorState().toJSON())
    const commitContent = () => {
      const current = currentRef.current
      if (current.preserveSource && !contentChangedRef.current) return
      const children = editor.getEditorState().read(() =>
        exportLexicalTreeToMdast({
          root: $getRoot(),
          visitors: realm.getValue(exportVisitors$),
          jsxComponentDescriptors: realm.getValue(jsxComponentDescriptors$),
          jsxIsAvailable: realm.getValue(jsxIsAvailable$),
          addImportStatements: false,
        }).children.filter(isContainerDirectiveChild),
      )
      const updated = { ...current.mdastNode, children }
      const { parentEditor, lexicalNode } = current.nestedContext
      parentEditor.update(
        () => {
          if ($getNodeByKey(lexicalNode.getKey())) lexicalNode.getLatest().setMdastNode(updated)
        },
        { discrete: true, tag: HISTORIC_TAG },
      )
    }
    const unregisterChanges = editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
        const nextContent = JSON.stringify(editorState.toJSON())
        if (!initialized) {
          initialized = true
          previousContent = nextContent
          return
        }
        if (nextContent === previousContent) return
        previousContent = nextContent
        contentChangedRef.current = true
        // NestedLexicalEditor commits on blur. Checkbox clicks can change a cold
        // editor without focusing its body, so publish content changes directly.
        queueMicrotask(() => {
          if (active) commitContent()
        })
      },
    )
    // The library's parent updater pushes a second history entry. The nested
    // editor already owns this edit in the shared history; its parent is only
    // a serialized projection and must not add another Undo step.
    const unregisterNestedUpdates = editor.registerCommand(
      NESTED_EDITOR_UPDATED_COMMAND,
      () => {
        commitContent()
        return true
      },
      COMMAND_PRIORITY_HIGH,
    )
    const unregisterBlur = editor.registerCommand(
      BLUR_COMMAND,
      (event) => {
        const related = event.relatedTarget
        if (
          related instanceof Element &&
          related.closest("[data-editor-dialog], [data-toolbar-item], [data-editor-dropdown]")
        ) {
          return false
        }
        commitContent()
        realm.pub(editorInFocus$, null)
        return true
      },
      COMMAND_PRIORITY_HIGH,
    )
    for (const type of CHECK_LIST_ITEM_EVENT_TYPES) {
      content.addEventListener(type, keepCheckListItemEventInNestedEditor)
    }
    return () => {
      active = false
      unregisterChanges()
      unregisterListFidelity()
      unregisterNestedUpdates()
      unregisterBlur()
      for (const type of CHECK_LIST_ITEM_EVENT_TYPES) {
        content.removeEventListener(type, keepCheckListItemEventInNestedEditor)
      }
    }
  }, [realm])
  return (
    <div
      ref={contentRef}
      data-slot="markdown-bench-directive-content"
      className={MARKDOWN_BENCH_DIRECTIVE_CONTENT_CLASS_NAME}
    >
      <NestedLexicalEditor<typeof mdastNode>
        block
        getContent={(node) => node.children}
        getUpdatedMdastNode={(node, children) =>
          !preserveSource || contentChangedRef.current
            ? {
                ...node,
                children: children.filter(isContainerDirectiveChild),
              }
            : node
        }
        contentEditableProps={{
          className: MARKDOWN_BENCH_NESTED_DIRECTIVE_EDITOR_CLASS_NAME,
        }}
      />
    </div>
  )
}

function MarkdownBenchAdmonitionEditor({
  mdastNode,
}: DirectiveEditorProps<ContainerDirectiveNode>) {
  const config = isMarkdownBenchAdmonitionName(mdastNode.name)
    ? MARKDOWN_BENCH_ADMONITION_CONFIGS[mdastNode.name]
    : MARKDOWN_BENCH_ADMONITION_CONFIGS.note

  return (
    <section
      data-component="markdown-bench-admonition"
      data-admonition-kind={mdastNode.name ?? undefined}
      data-admonition-tone={config.tone}
      className={cn(
        MARKDOWN_BENCH_DIRECTIVE_SHELL_CLASS_NAME,
        MARKDOWN_BENCH_ADMONITION_TONE_CLASS_NAMES[config.tone],
      )}
    >
      <div
        data-slot="markdown-bench-directive-label"
        className={cn(
          MARKDOWN_BENCH_DIRECTIVE_LABEL_CLASS_NAME,
          MARKDOWN_BENCH_ADMONITION_LABEL_CLASS_NAMES[config.tone],
        )}
      >
        {config.label}
      </div>
      <MarkdownBenchContainerDirectiveBody mdastNode={mdastNode} />
    </section>
  )
}

function readDirectiveAttribute(node: ContainerDirectiveNode, name: string): string | undefined {
  const value = node.attributes?.[name]
  if (value === null || value === undefined || value.length === 0) return undefined
  return value
}

function decodeMarkdownBenchCharacterReference(reference: string): string {
  const decoder = document.createElement("textarea")
  decoder.innerHTML = reference
  return decoder.value
}

function tokenOffset(tokens: readonly Token[], position: number): number {
  return tokens.slice(0, position).reduce((offset, token) => offset + token.raw.length, 0)
}

function MarkdownBenchCalloutTitleTokens({ tokens }: { tokens: readonly Token[] }) {
  return (
    <>
      {tokens.map((token, position) => (
        <MarkdownBenchCalloutTitleToken key={`${tokenOffset(tokens, position)}`} token={token} />
      ))}
    </>
  )
}

function MarkdownBenchCalloutTitleToken({ token }: { token: Token }) {
  switch (token.type) {
    case "text":
      return (
        <>
          {(parseTString(token.text) ?? token.raw).replace(
            MARKDOWN_BENCH_CALLOUT_TITLE_CHARACTER_REFERENCE_PATTERN,
            decodeMarkdownBenchCharacterReference,
          )}
        </>
      )
    case "escape":
      return <>{parseTString(token.text) ?? token.raw}</>
    case "codespan":
      return <code>{parseTString(token.text) ?? token.raw}</code>
    case "em":
      return (
        <em>
          <MarkdownBenchCalloutTitleTokens tokens={token.tokens ?? []} />
        </em>
      )
    case "strong":
      return (
        <strong>
          <MarkdownBenchCalloutTitleTokens tokens={token.tokens ?? []} />
        </strong>
      )
    case "del":
      return (
        <del>
          <MarkdownBenchCalloutTitleTokens tokens={token.tokens ?? []} />
        </del>
      )
    case "link": {
      const href = parseTString(token.href)
      const content = <MarkdownBenchCalloutTitleTokens tokens={token.tokens ?? []} />
      if (href === undefined || !MARKDOWN_BENCH_CALLOUT_TITLE_LINK_HREF_PATTERN.test(href)) {
        return content
      }
      return (
        <a href={href} title={parseTString(token.title)}>
          {content}
        </a>
      )
    }
    case MARKDOWN_BENCH_CALLOUT_TITLE_WIKILINK_TYPE: {
      const target = parseTString(token.target)
      if (target === undefined || token.embed === true) return <>{token.raw}</>
      return (
        <ObsidianWikiLinkView target={target} alias={parseTString(token.alias)} embed={false} />
      )
    }
    default:
      return <>{token.raw}</>
  }
}

function MarkdownBenchCalloutTitle({ title }: { title: string }) {
  const tokens = useMemo(
    () =>
      MARKDOWN_BENCH_CALLOUT_TITLE_MARKED.Lexer.lexInline(
        title,
        MARKDOWN_BENCH_CALLOUT_TITLE_MARKED.defaults,
      ),
    [title],
  )
  return (
    <span
      data-slot="markdown-bench-callout-title"
      className={MARKDOWN_BENCH_CALLOUT_TITLE_CLASS_NAME}
    >
      <MarkdownBenchCalloutTitleTokens tokens={tokens} />
    </span>
  )
}

function MarkdownBenchObsidianCalloutEditor({
  mdastNode,
}: DirectiveEditorProps<ContainerDirectiveNode>) {
  const kind = readDirectiveAttribute(mdastNode, "kind") ?? "note"
  const fold = readDirectiveAttribute(mdastNode, "fold")
  const customTitle = readDirectiveAttribute(mdastNode, "title")
  const config = resolveMarkdownBenchObsidianCalloutConfig(kind)
  const label = customTitle ? <MarkdownBenchCalloutTitle title={customTitle} /> : config.label
  const shellClassName = cn(
    MARKDOWN_BENCH_DIRECTIVE_SHELL_CLASS_NAME,
    MARKDOWN_BENCH_ADMONITION_TONE_CLASS_NAMES[config.tone],
  )
  const labelClassName = cn(
    MARKDOWN_BENCH_DIRECTIVE_LABEL_CLASS_NAME,
    MARKDOWN_BENCH_ADMONITION_LABEL_CLASS_NAMES[config.tone],
  )

  if (fold === "+" || fold === "-") {
    return (
      <details
        data-component="markdown-bench-obsidian-callout"
        data-admonition-kind={kind}
        data-admonition-tone={config.tone}
        data-callout-fold={fold}
        className={shellClassName}
        open={fold === "+"}
      >
        <summary className={cn(labelClassName, "cursor-pointer select-none")}>{label}</summary>
        <MarkdownBenchContainerDirectiveBody mdastNode={mdastNode} />
      </details>
    )
  }

  return (
    <section
      data-component="markdown-bench-obsidian-callout"
      data-admonition-kind={kind}
      data-admonition-tone={config.tone}
      className={shellClassName}
    >
      <div className={labelClassName}>{label}</div>
      <MarkdownBenchContainerDirectiveBody mdastNode={mdastNode} />
    </section>
  )
}

function MarkdownBenchGenericContainerDirectiveEditor({
  mdastNode,
}: DirectiveEditorProps<ContainerDirectiveNode>) {
  return (
    <section
      data-component="markdown-bench-container-directive"
      data-directive-name={mdastNode.name ?? undefined}
      className="my-4 border-l-2 border-border-weak-base py-1 pl-4 text-text-base"
    >
      <MarkdownBenchContainerDirectiveBody mdastNode={mdastNode} />
    </section>
  )
}

const MARKDOWN_BENCH_ADMONITION_DIRECTIVE_DESCRIPTOR: DirectiveDescriptor<ContainerDirectiveNode> =
  {
    name: "admonition",
    attributes: [],
    hasChildren: true,
    type: "containerDirective",
    testNode(node) {
      return node.type === "containerDirective" && isMarkdownBenchAdmonitionName(node.name)
    },
    Editor: MarkdownBenchAdmonitionEditor,
  }

const MARKDOWN_BENCH_CONTAINER_DIRECTIVE_DESCRIPTOR: DirectiveDescriptor<ContainerDirectiveNode> = {
  name: "container",
  attributes: [],
  hasChildren: true,
  type: "containerDirective",
  testNode(node) {
    return node.type === "containerDirective"
  },
  Editor: MarkdownBenchGenericContainerDirectiveEditor,
}

const MARKDOWN_BENCH_OBSIDIAN_CALLOUT_DESCRIPTOR: DirectiveDescriptor<ContainerDirectiveNode> = {
  name: "obsidian-callout",
  attributes: ["kind", "fold", "title"],
  hasChildren: true,
  type: "containerDirective",
  testNode(node) {
    return node.type === "containerDirective" && node.name === "obsidian-callout"
  },
  Editor: MarkdownBenchObsidianCalloutEditor,
}

export const MARKDOWN_BENCH_DIRECTIVE_DESCRIPTORS: DirectiveDescriptor<ContainerDirectiveNode>[] = [
  MARKDOWN_BENCH_OBSIDIAN_CALLOUT_DESCRIPTOR,
  MARKDOWN_BENCH_ADMONITION_DIRECTIVE_DESCRIPTOR,
  MARKDOWN_BENCH_CONTAINER_DIRECTIVE_DESCRIPTOR,
]
