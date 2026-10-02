import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from "@mdxeditor/editor"
import {
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import type { Extension as MdastExtension } from "mdast-util-from-markdown"
import type { Literal, Root } from "mdast"
import type { JSX } from "react"

const MDX_ESM_TYPE = "mdxjsEsm"
const BUDDY_MDX_ESM_TYPE = "buddy-mdx-esm"
const BEFORE_LIBRARY_VISITORS = 1

type MdxEsmMdastNode = Literal & {
  type: typeof MDX_ESM_TYPE
}

type SerializedBuddyMdxEsmNode = Spread<{ value: string }, SerializedLexicalNode>

declare module "mdast" {
  interface RootContentMap {
    mdxjsEsm: MdxEsmMdastNode
  }
}

class BuddyMdxEsmNode extends DecoratorNode<JSX.Element> {
  esmSource: string

  static getType(): string {
    return BUDDY_MDX_ESM_TYPE
  }

  static clone(node: BuddyMdxEsmNode): BuddyMdxEsmNode {
    return new BuddyMdxEsmNode(node.esmSource, node.getKey())
  }

  static importJSON(serializedNode: SerializedBuddyMdxEsmNode): BuddyMdxEsmNode {
    return new BuddyMdxEsmNode(serializedNode.value)
  }

  constructor(source: string, key?: NodeKey) {
    super(key)
    this.esmSource = source
  }

  exportJSON(): SerializedBuddyMdxEsmNode {
    return {
      ...super.exportJSON(),
      type: BUDDY_MDX_ESM_TYPE,
      value: this.getSource(),
      version: 1,
    }
  }

  createDOM(): HTMLElement {
    return document.createElement("div")
  }

  updateDOM(): false {
    return false
  }

  getSource(): string {
    return this.getLatest().esmSource
  }

  decorate(): JSX.Element {
    return (
      <pre
        data-component="markdown-bench-mdx-esm"
        className="my-2 overflow-x-auto whitespace-pre rounded-md bg-surface-inset-base px-3 py-2 font-mono text-xs text-text-weak"
      >
        {this.getSource()}
      </pre>
    )
  }

  isInline(): false {
    return false
  }

  isIsolated(): true {
    return true
  }
}

function isBuddyMdxEsmNode(node: LexicalNode | null | undefined): node is BuddyMdxEsmNode {
  return node instanceof BuddyMdxEsmNode
}

function forgetParsedEsmPrograms(tree: Root) {
  for (const node of tree.children) {
    if (node.type === MDX_ESM_TYPE) node.data = undefined
  }
}

const mdxEsmMdastExtension: MdastExtension = {
  transforms: [forgetParsedEsmPrograms],
}

const mdxEsmImportVisitor: MdastImportVisitor<MdxEsmMdastNode> = {
  testNode: MDX_ESM_TYPE,
  priority: BEFORE_LIBRARY_VISITORS,
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto(new BuddyMdxEsmNode(mdastNode.value))
  },
}

const mdxEsmExportVisitor: LexicalExportVisitor<BuddyMdxEsmNode, MdxEsmMdastNode> = {
  testLexicalNode: isBuddyMdxEsmNode,
  visitLexicalNode({ lexicalNode, actions }) {
    actions.addAndStepInto(MDX_ESM_TYPE, { value: lexicalNode.getSource() }, false)
  },
}

export const buddyMdxEsmPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addMdastExtension$]: mdxEsmMdastExtension,
      [addLexicalNode$]: BuddyMdxEsmNode,
      [addImportVisitor$]: mdxEsmImportVisitor,
      [addExportVisitor$]: mdxEsmExportVisitor,
    })
  },
})
