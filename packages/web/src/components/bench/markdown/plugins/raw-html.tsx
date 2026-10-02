import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addToMarkdownExtension$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
  type ToMarkdownExtension,
} from "@mdxeditor/editor"
import {
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import type { Extension as MdastExtension } from "mdast-util-from-markdown"
import type { Html, Literal, Parent, RootContent } from "mdast"
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react"
import { MarkdownBenchRawHtmlPreview } from "@/components/bench/markdown/mdx-intrinsic"
import {
  RAW_HTML_BLOCK_LANGUAGE,
  RAW_HTML_TIGHT_META,
  readRawHtmlInlineCarrier,
} from "@/components/bench/markdown/plugins/raw-html-carrier"

const BUDDY_RAW_HTML_TYPE = "buddy-raw-html"
const RAW_HTML_TEXT_TYPE = "buddyRawHtmlText"
const BEFORE_LIBRARY_VISITORS = 1
const INTERACTIVE_RAW_HTML_SELECTOR = "a, summary"

type RawHtmlTextMdastNode = Literal & {
  type: typeof RAW_HTML_TEXT_TYPE
}

declare module "mdast" {
  interface PhrasingContentMap {
    buddyRawHtmlText: RawHtmlTextMdastNode
  }

  interface HtmlData {
    buddyRawHtml?: boolean
    buddyRawHtmlTight?: boolean
  }

  interface RootContentMap {
    buddyRawHtmlText: RawHtmlTextMdastNode
  }
}

type SerializedBuddyRawHtmlNode = Spread<
  {
    inline: boolean
    tight: boolean
    type: typeof BUDDY_RAW_HTML_TYPE
    value: string
    version: 1
  },
  SerializedLexicalNode
>

type BuddyRawHtmlEditorProps = {
  editor: LexicalEditor
  inline: boolean
  node: BuddyRawHtmlNode
  source: string
}

function opensInteractiveContent(event: ReactMouseEvent): boolean {
  return (
    event.target instanceof Element && event.target.closest(INTERACTIVE_RAW_HTML_SELECTOR) !== null
  )
}

function BuddyRawHtmlEditor(props: BuddyRawHtmlEditorProps): ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.source)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(props.source)
  }, [props.source])

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  if (props.inline) {
    return <MarkdownBenchRawHtmlPreview source={props.source} inline />
  }

  const updateSource = (value: string) => {
    setDraft(value)
    props.editor.update(() => {
      props.node.setSource(value)
    })
  }

  const finishEditing = () => {
    setEditing(false)
  }

  const startEditing = () => {
    if (props.editor.isEditable()) setEditing(true)
  }

  const sourceKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault()
      finishEditing()
    }
    event.stopPropagation()
  }

  const previewClick = (event: ReactMouseEvent) => {
    if (opensInteractiveContent(event)) return
    startEditing()
  }

  const previewKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    startEditing()
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        aria-label="Edit HTML"
        data-component="markdown-bench-raw-html-source"
        className="my-2 min-h-20 w-full resize-y rounded border border-border-base bg-background-stronger px-3 py-2 font-mono text-[13px] text-text-base outline-none focus:border-border-interactive-base"
        value={draft}
        onBlur={finishEditing}
        onChange={(event) => updateSource(event.currentTarget.value)}
        onKeyDown={sourceKeyDown}
      />
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title="Edit HTML"
      className="cursor-text"
      onClick={previewClick}
      onKeyDown={previewKeyDown}
    >
      <MarkdownBenchRawHtmlPreview source={props.source} inline={false} />
    </div>
  )
}

export class BuddyRawHtmlNode extends DecoratorNode<ReactElement> {
  htmlSource: string
  htmlInline: boolean
  htmlTight: boolean

  static getType(): string {
    return BUDDY_RAW_HTML_TYPE
  }

  static clone(node: BuddyRawHtmlNode): BuddyRawHtmlNode {
    return new BuddyRawHtmlNode(node.htmlSource, node.htmlInline, node.htmlTight, node.getKey())
  }

  static importJSON(serializedNode: SerializedBuddyRawHtmlNode): BuddyRawHtmlNode {
    return new BuddyRawHtmlNode(serializedNode.value, serializedNode.inline, serializedNode.tight)
  }

  constructor(source: string, inline: boolean, tight: boolean, key?: NodeKey) {
    super(key)
    this.htmlSource = source
    this.htmlInline = inline
    this.htmlTight = tight
  }

  exportJSON(): SerializedBuddyRawHtmlNode {
    return {
      ...super.exportJSON(),
      inline: this.isInline(),
      tight: this.isTight(),
      type: BUDDY_RAW_HTML_TYPE,
      value: this.getSource(),
      version: 1,
    }
  }

  createDOM(): HTMLElement {
    return document.createElement(this.htmlInline ? "span" : "div")
  }

  updateDOM(): false {
    return false
  }

  getSource(): string {
    return this.getLatest().htmlSource
  }

  setSource(value: string): void {
    if (value !== this.getSource()) this.getWritable().htmlSource = value
  }

  isTight(): boolean {
    return this.getLatest().htmlTight
  }

  decorate(editor: LexicalEditor): ReactElement {
    return (
      <BuddyRawHtmlEditor
        editor={editor}
        inline={this.isInline()}
        node={this}
        source={this.getSource()}
      />
    )
  }

  isInline(): boolean {
    return this.htmlInline
  }

  isKeyboardSelectable(): true {
    return true
  }
}

function isBuddyRawHtmlNode(node: LexicalNode | null | undefined): node is BuddyRawHtmlNode {
  return node instanceof BuddyRawHtmlNode
}

function exportedRawHtml(node: BuddyRawHtmlNode): Html | RawHtmlTextMdastNode {
  if (node.isInline()) return { type: RAW_HTML_TEXT_TYPE, value: node.getSource() }
  return Object.assign(
    { type: "html" as const, value: node.getSource() },
    node.isTight() ? { data: { buddyRawHtmlTight: true } } : undefined,
  )
}

function rawHtmlFromCarrier(node: RootContent): Html | RawHtmlTextMdastNode | undefined {
  if (node.type === "code" && node.lang === RAW_HTML_BLOCK_LANGUAGE) {
    return {
      type: "html",
      value: node.value,
      data: Object.assign(
        { buddyRawHtml: true },
        node.meta === RAW_HTML_TIGHT_META ? { buddyRawHtmlTight: true } : undefined,
      ),
    }
  }
  if (node.type !== "inlineCode") return undefined
  const value = readRawHtmlInlineCarrier(node.value)
  return value === undefined ? undefined : { type: RAW_HTML_TEXT_TYPE, value }
}

function replaceRawHtmlCarriers(parent: Parent): void {
  for (const [index, child] of parent.children.entries()) {
    const html = rawHtmlFromCarrier(child)
    if (html) {
      parent.children[index] = html
      continue
    }
    if ("children" in child) replaceRawHtmlCarriers(child)
  }
}

const rawHtmlMdastExtension: MdastExtension = {
  transforms: [replaceRawHtmlCarriers],
}

const rawHtmlImportVisitor: MdastImportVisitor<Html | RawHtmlTextMdastNode> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testNode: (node) =>
    node.type === RAW_HTML_TEXT_TYPE || (node.type === "html" && node.data?.buddyRawHtml === true),
  visitNode({ mdastNode, actions }) {
    const tight = mdastNode.type === "html" && mdastNode.data?.buddyRawHtmlTight === true
    actions.addAndStepInto(
      new BuddyRawHtmlNode(mdastNode.value, mdastNode.type === RAW_HTML_TEXT_TYPE, tight),
    )
  },
}

const rawHtmlExportVisitor: LexicalExportVisitor<BuddyRawHtmlNode, Html | RawHtmlTextMdastNode> = {
  testLexicalNode: isBuddyRawHtmlNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, exportedRawHtml(lexicalNode))
  },
}

function rawHtmlText(node: RawHtmlTextMdastNode): string {
  return node.value
}

const rawHtmlToMarkdownExtension: ToMarkdownExtension = {
  handlers: { [RAW_HTML_TEXT_TYPE]: rawHtmlText },
  join: [(_, right) => (right.type === "html" && right.data?.buddyRawHtmlTight ? 0 : undefined)],
}

export const buddyRawHtmlPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addMdastExtension$]: rawHtmlMdastExtension,
      [addLexicalNode$]: BuddyRawHtmlNode,
      [addImportVisitor$]: rawHtmlImportVisitor,
      [addExportVisitor$]: rawHtmlExportVisitor,
      [addToMarkdownExtension$]: rawHtmlToMarkdownExtension,
    })
  },
})
