import { $getNearestNodeFromDOMNode, getNearestEditorFromDOMNode, type LexicalNode } from "lexical"

const LEXICAL_LINK_NODE_TYPES = new Set(["link", "autolink"])

type LexicalLinkNode = LexicalNode & { getURL(): string }

function isLexicalLinkNode(node: LexicalNode | null): node is LexicalLinkNode {
  return node !== null && LEXICAL_LINK_NODE_TYPES.has(node.getType()) && "getURL" in node
}

export function readEditorLinkUrl(anchor: HTMLAnchorElement): string | undefined {
  const renderedHref = anchor.getAttribute("href") ?? undefined
  const lexicalEditor = getNearestEditorFromDOMNode(anchor)
  if (!lexicalEditor) return renderedHref
  const documentUrl = lexicalEditor.read(() => {
    const node = $getNearestNodeFromDOMNode(anchor)
    if (!isLexicalLinkNode(node)) return undefined
    return lexicalEditor.getElementByKey(node.getKey()) === anchor ? node.getURL() : undefined
  })
  return documentUrl ?? renderedHref
}
