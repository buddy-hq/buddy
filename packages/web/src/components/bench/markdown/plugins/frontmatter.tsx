import {
  FrontmatterNode,
  addImportVisitor$,
  addLexicalNode$,
  createRootEditorSubscription$,
  realmPlugin,
  type MdastImportVisitor,
  type SerializedFrontmatterNode,
} from "@mdxeditor/editor"
import type { JSX } from "react"
import type { LexicalEditor } from "lexical"
import type { Yaml } from "mdast"

const BUDDY_FRONTMATTER_TYPE = "buddyFrontmatter"
const BEFORE_LIBRARY_VISITORS = 1

class BuddyFrontmatterNode extends FrontmatterNode {
  static getType(): string {
    return BUDDY_FRONTMATTER_TYPE
  }

  static clone(node: BuddyFrontmatterNode): BuddyFrontmatterNode {
    return new BuddyFrontmatterNode(node.getYaml(), node.getKey())
  }

  static importJSON(serializedNode: SerializedFrontmatterNode): BuddyFrontmatterNode {
    return new BuddyFrontmatterNode(serializedNode.yaml)
  }

  exportJSON(): SerializedFrontmatterNode {
    return { ...super.exportJSON(), type: BUDDY_FRONTMATTER_TYPE }
  }

  decorate(): JSX.Element {
    return <></>
  }

  isIsolated(): true {
    return true
  }
}

const frontmatterImportVisitor: MdastImportVisitor<Yaml> = {
  testNode: "yaml",
  priority: BEFORE_LIBRARY_VISITORS,
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto(new BuddyFrontmatterNode(mdastNode.value))
  },
}

function replaceLibraryFrontmatterNode(node: FrontmatterNode) {
  if (node instanceof BuddyFrontmatterNode) return
  node.replace(new BuddyFrontmatterNode(node.getYaml()))
}

function registerFrontmatterNodeReplacement(editor: LexicalEditor) {
  return editor.registerNodeTransform(FrontmatterNode, replaceLibraryFrontmatterNode)
}

export const buddyFrontmatterPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: BuddyFrontmatterNode,
      [addImportVisitor$]: frontmatterImportVisitor,
      [createRootEditorSubscription$]: registerFrontmatterNodeReplacement,
    })
  },
})
