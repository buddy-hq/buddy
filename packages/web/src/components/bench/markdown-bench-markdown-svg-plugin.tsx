import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  realmPlugin,
  type JsxEditorProps,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from "@mdxeditor/editor"
import { $isElementNode, DecoratorNode, type LexicalNode } from "lexical"
import type { NodeKey, SerializedLexicalNode, Spread } from "lexical"
import type { Nodes } from "mdast"
import type { ReactElement } from "react"
import { MarkdownBenchMdxIntrinsicPreview } from "@/components/bench/markdown-bench-mdx-intrinsic"

type MarkdownSvgMdastNode = JsxEditorProps["mdastNode"]

type SerializedBuddyMarkdownSvgNode = Spread<
  {
    mdastNode: MarkdownSvgMdastNode
    type: "buddy-markdown-svg"
    version: 1
  },
  SerializedLexicalNode
>

const MARKDOWN_SVG_IMPORT_PRIORITY = 100

export class BuddyMarkdownSvgNode extends DecoratorNode<ReactElement> {
  svgMdastNode: MarkdownSvgMdastNode

  static getType(): string {
    return "buddy-markdown-svg"
  }

  static clone(node: BuddyMarkdownSvgNode): BuddyMarkdownSvgNode {
    return new BuddyMarkdownSvgNode(node.svgMdastNode, node.getKey())
  }

  static importJSON(serializedNode: SerializedBuddyMarkdownSvgNode): BuddyMarkdownSvgNode {
    return new BuddyMarkdownSvgNode(serializedNode.mdastNode)
  }

  constructor(mdastNode: MarkdownSvgMdastNode, key?: NodeKey) {
    super(key)
    this.svgMdastNode = mdastNode
  }

  exportJSON(): SerializedBuddyMarkdownSvgNode {
    return {
      ...super.exportJSON(),
      mdastNode: this.getMdastNode(),
      type: "buddy-markdown-svg",
      version: 1,
    }
  }

  createDOM(): HTMLElement {
    return document.createElement(this.isInline() ? "span" : "div")
  }

  updateDOM(): false {
    return false
  }

  getMdastNode(): MarkdownSvgMdastNode {
    return this.getLatest().svgMdastNode
  }

  decorate(): ReactElement {
    return <MarkdownBenchMdxIntrinsicPreview mdastNode={this.getMdastNode()} />
  }

  isInline(): boolean {
    return this.getMdastNode().type === "mdxJsxTextElement"
  }

  isKeyboardSelectable(): true {
    return true
  }
}

function isMarkdownSvgMdastNode(node: Nodes): node is MarkdownSvgMdastNode {
  if (!("name" in node)) return false
  return (
    (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
    node.name === "svg"
  )
}

function createBuddyMarkdownSvgNode(mdastNode: MarkdownSvgMdastNode): BuddyMarkdownSvgNode {
  return new BuddyMarkdownSvgNode(mdastNode)
}

function isBuddyMarkdownSvgNode(
  node: LexicalNode | null | undefined,
): node is BuddyMarkdownSvgNode {
  return node instanceof BuddyMarkdownSvgNode
}

const buddyMarkdownSvgImportVisitor: MdastImportVisitor<MarkdownSvgMdastNode> = {
  priority: MARKDOWN_SVG_IMPORT_PRIORITY,
  testNode: isMarkdownSvgMdastNode,
  visitNode({ lexicalParent, mdastNode }) {
    if (!$isElementNode(lexicalParent)) return
    lexicalParent.append(createBuddyMarkdownSvgNode(mdastNode))
  },
}

const buddyMarkdownSvgExportVisitor: LexicalExportVisitor<
  BuddyMarkdownSvgNode,
  MarkdownSvgMdastNode
> = {
  testLexicalNode: isBuddyMarkdownSvgNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, lexicalNode.getMdastNode())
  },
}

export const buddyMarkdownSvgPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: BuddyMarkdownSvgNode,
      [addImportVisitor$]: buddyMarkdownSvgImportVisitor,
      [addExportVisitor$]: buddyMarkdownSvgExportVisitor,
    })
  },
})
