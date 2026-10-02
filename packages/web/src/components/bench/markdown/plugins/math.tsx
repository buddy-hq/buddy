import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
  type ToMarkdownExtension,
} from "@mdxeditor/editor"
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import type { CompileContext, Extension as MdastExtension } from "mdast-util-from-markdown"
import { mathFromMarkdown, mathToMarkdown, type InlineMath, type Math } from "mdast-util-math"
import { math } from "micromark-extension-math"
import type { Token } from "micromark-util-types"
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react"
import { renderBuddyMathToHtml } from "@/components/markdown/markdown-math"

const SINGLE_DOLLAR_SEQUENCE_SIZE = 1
const DISPLAY_MATH_SEQUENCE_SIZE = 2

declare module "mdast-util-math" {
  interface InlineMathData {
    buddyMathSequenceSize?: number
  }
}

type MdastStackEntry = CompileContext["stack"][number]

type InlineMathHandler = NonNullable<NonNullable<ToMarkdownExtension["handlers"]>["inlineMath"]>

type SerializedBuddyMathNode = Spread<
  {
    displayMode: boolean
    inline?: boolean
    type: "buddy-math"
    value: string
    version: 1
  },
  SerializedLexicalNode
>

type BuddyMathEditorProps = {
  displayMode: boolean
  editor: LexicalEditor
  inline: boolean
  node: BuddyMathNode
  value: string
}

function BuddyMathEditor(props: BuddyMathEditorProps): ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.value)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const html = useMemo(
    () => renderBuddyMathToHtml(props.value, props.displayMode),
    [props.displayMode, props.value],
  )

  useEffect(() => {
    setDraft(props.value)
  }, [props.value])

  useEffect(() => {
    if (editing) {
      const editor = props.inline ? inputRef.current : textareaRef.current
      editor?.focus()
      editor?.select()
    }
  }, [editing, props.inline])

  const updateValue = (value: string) => {
    setDraft(value)
    props.editor.update(() => {
      props.node.setValue(value)
    })
  }

  const finishEditing = () => {
    setEditing(false)
  }

  const inputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault()
      finishEditing()
    }
    event.stopPropagation()
  }

  const activateEditor = () => {
    setEditing(true)
  }

  const renderedMathKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return
    }
    event.preventDefault()
    activateEditor()
  }

  if (!props.inline) {
    return (
      <div
        contentEditable={false}
        data-component="markdown-bench-math"
        data-display="block"
        data-placement="block"
        className="group/math my-4 overflow-x-auto py-1"
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            aria-label="Edit display math"
            className="min-h-20 w-full resize-y rounded border border-border-base bg-background-stronger px-3 py-2 font-mono text-[13px] text-text-base outline-none focus:border-border-interactive-base"
            value={draft}
            onBlur={finishEditing}
            onChange={(event) => updateValue(event.currentTarget.value)}
            onKeyDown={inputKeyDown}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            className="block w-full cursor-text bg-transparent text-inherit"
            title="Edit equation"
            onClick={activateEditor}
            onKeyDown={renderedMathKeyDown}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    )
  }

  return (
    <span
      contentEditable={false}
      data-component="markdown-bench-math"
      data-display={props.displayMode ? "block" : "inline"}
      data-placement="inline"
      className={
        props.displayMode ? "block max-w-full overflow-x-auto py-1" : "inline-block align-baseline"
      }
    >
      {editing ? (
        <input
          ref={inputRef}
          aria-label="Edit inline math"
          className="min-w-32 rounded border border-border-base bg-background-stronger px-1.5 py-0.5 font-mono text-[13px] text-text-base outline-none focus:border-border-interactive-base"
          value={draft}
          onBlur={finishEditing}
          onChange={(event) => updateValue(event.currentTarget.value)}
          onKeyDown={inputKeyDown}
        />
      ) : (
        <span
          role="button"
          tabIndex={0}
          className={
            props.displayMode
              ? "block cursor-text bg-transparent p-0 text-inherit"
              : "cursor-text bg-transparent p-0 text-inherit"
          }
          title="Edit equation"
          onClick={activateEditor}
          onKeyDown={renderedMathKeyDown}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </span>
  )
}

export class BuddyMathNode extends DecoratorNode<ReactElement> {
  mathDisplayMode: boolean
  mathInline: boolean
  latexSource: string

  static getType(): string {
    return "buddy-math"
  }

  static clone(node: BuddyMathNode): BuddyMathNode {
    return new BuddyMathNode(node.latexSource, node.mathDisplayMode, node.mathInline, node.getKey())
  }

  static importJSON(serializedNode: SerializedBuddyMathNode): BuddyMathNode {
    return new BuddyMathNode(
      serializedNode.value,
      serializedNode.displayMode,
      serializedNode.inline ?? !serializedNode.displayMode,
    )
  }

  constructor(value: string, displayMode: boolean, inline: boolean, key?: NodeKey) {
    super(key)
    this.latexSource = value
    this.mathDisplayMode = displayMode
    this.mathInline = inline
  }

  exportJSON(): SerializedBuddyMathNode {
    return {
      ...super.exportJSON(),
      displayMode: this.getDisplayMode(),
      inline: this.isInline(),
      type: "buddy-math",
      value: this.getValue(),
      version: 1,
    }
  }

  createDOM(): HTMLElement {
    return document.createElement(this.mathInline ? "span" : "div")
  }

  updateDOM(previousNode: BuddyMathNode, dom: HTMLElement, _config: EditorConfig): boolean {
    const expectedTagName = this.mathInline ? "SPAN" : "DIV"
    return previousNode.mathInline !== this.mathInline || dom.tagName !== expectedTagName
  }

  getValue(): string {
    return this.getLatest().latexSource
  }

  setValue(value: string): void {
    if (value !== this.latexSource) {
      this.getWritable().latexSource = value
    }
  }

  getDisplayMode(): boolean {
    return this.getLatest().mathDisplayMode
  }

  decorate(editor: LexicalEditor): ReactElement {
    return (
      <BuddyMathEditor
        displayMode={this.getDisplayMode()}
        editor={editor}
        inline={this.isInline()}
        node={this}
        value={this.getValue()}
      />
    )
  }

  isInline(): boolean {
    return this.mathInline
  }
}

function isBuddyMathNode(node: LexicalNode | null | undefined): node is BuddyMathNode {
  return node instanceof BuddyMathNode
}

function isInlineMathEntry(entry: MdastStackEntry): entry is InlineMath {
  return entry.type === "inlineMath"
}

function enterMathTextSequence(this: CompileContext, token: Token): void {
  const mathNode = this.stack.findLast(isInlineMathEntry)
  if (!mathNode) return
  mathNode.data = { ...mathNode.data, buddyMathSequenceSize: this.sliceSerialize(token).length }
}

const mathTextSequenceMdastExtension: MdastExtension = {
  enter: {
    mathTextSequence: enterMathTextSequence,
  },
}

function importedMathNode(mdastNode: Math | InlineMath): BuddyMathNode {
  if (mdastNode.type === "math") return new BuddyMathNode(mdastNode.value, true, false)
  const sequenceSize = mdastNode.data?.buddyMathSequenceSize ?? SINGLE_DOLLAR_SEQUENCE_SIZE
  return new BuddyMathNode(mdastNode.value, sequenceSize >= DISPLAY_MATH_SEQUENCE_SIZE, true)
}

const buddyMathImportVisitor: MdastImportVisitor<Math | InlineMath> = {
  testNode(node) {
    return node.type === "math" || node.type === "inlineMath"
  },
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto(importedMathNode(mdastNode))
  },
}

const buddyMathExportVisitor: LexicalExportVisitor<BuddyMathNode, Math | InlineMath> = {
  testLexicalNode: isBuddyMathNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    if (!lexicalNode.isInline()) {
      actions.appendToParent(mdastParent, {
        type: "math",
        value: lexicalNode.getValue(),
      })
      return
    }

    actions.appendToParent(mdastParent, {
      type: "inlineMath",
      value: lexicalNode.getValue(),
      data: {
        buddyMathSequenceSize: lexicalNode.getDisplayMode()
          ? DISPLAY_MATH_SEQUENCE_SIZE
          : SINGLE_DOLLAR_SEQUENCE_SIZE,
      },
    })
  },
}

const singleDollarMathToMarkdown = mathToMarkdown({ singleDollarTextMath: true })

function inlineMathHandlerOf(extension: ToMarkdownExtension): InlineMathHandler {
  const handler = extension.handlers?.inlineMath
  if (!handler) throw new Error("mdast-util-math no longer serializes inline math")
  return handler
}

const singleDollarInlineMath = inlineMathHandlerOf(singleDollarMathToMarkdown)
const displayInlineMath = inlineMathHandlerOf(mathToMarkdown({ singleDollarTextMath: false }))

const inlineMathToMarkdown: InlineMathHandler = (node: InlineMath, parent, state, info) => {
  const sequenceSize = node.data?.buddyMathSequenceSize ?? SINGLE_DOLLAR_SEQUENCE_SIZE
  const handler =
    sequenceSize >= DISPLAY_MATH_SEQUENCE_SIZE ? displayInlineMath : singleDollarInlineMath
  return handler(node, parent, state, info)
}

const buddyMathToMarkdownExtension: ToMarkdownExtension = {
  ...singleDollarMathToMarkdown,
  handlers: { ...singleDollarMathToMarkdown.handlers, inlineMath: inlineMathToMarkdown },
}

export const buddyMathPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addSyntaxExtension$]: math({ singleDollarTextMath: true }),
      [addMdastExtension$]: [mathFromMarkdown(), mathTextSequenceMdastExtension],
      [addLexicalNode$]: BuddyMathNode,
      [addImportVisitor$]: buddyMathImportVisitor,
      [addExportVisitor$]: buddyMathExportVisitor,
      [addToMarkdownExtension$]: buddyMathToMarkdownExtension,
    })
  },
})
