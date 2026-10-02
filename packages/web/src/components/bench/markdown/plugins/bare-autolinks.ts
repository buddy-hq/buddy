import type { LexicalExportVisitor, ToMarkdownExtension } from "@mdxeditor/editor"
import { $isElementNode, type ElementNode, type LexicalNode } from "lexical"
import type { Parent, PhrasingContent } from "mdast"

const BEFORE_LIBRARY_VISITORS = 1
const LEXICAL_AUTOLINK_TYPE = "autolink"
const AUTOLINK_MDAST_TYPE = "buddyAutolink"
const HTTP_LINK_TEXT_PATTERN = /^https?:\/\//u
const WWW_LINK_TEXT_PATTERN = /^www\./u
const EMAIL_LINK_TEXT_PATTERN = /^[^@]+@[^@]+$/u
const BARE_LINK_CHARACTERS_PATTERN = /^[A-Za-z0-9._~:/?#@%+&=()-]+$/u
const NON_INTRAWORD_UNDERSCORE_PATTERN = /(?<![A-Za-z0-9])_|_(?![A-Za-z0-9])/u
const TILDE_PATTERN = /~/gu
const MAX_BARE_LINK_TILDES = 1

type LexicalAutoLinkNode = ElementNode & {
  getTitle(): string | null
  getURL(): string
}

interface AutolinkMdastNode extends Parent {
  type: typeof AUTOLINK_MDAST_TYPE
  url: string
  title: string | null
  children: PhrasingContent[]
}

declare module "mdast" {
  interface PhrasingContentMap {
    buddyAutolink: AutolinkMdastNode
  }

  interface RootContentMap {
    buddyAutolink: AutolinkMdastNode
  }
}

type AutolinkHandler = NonNullable<
  NonNullable<ToMarkdownExtension["handlers"]>[typeof AUTOLINK_MDAST_TYPE]
>
type MarkdownSerializerState = Parameters<AutolinkHandler>[2]

function isLexicalAutoLinkNode(node: LexicalNode): node is LexicalAutoLinkNode {
  return (
    $isElementNode(node) &&
    node.getType() === LEXICAL_AUTOLINK_TYPE &&
    "getURL" in node &&
    "getTitle" in node
  )
}

function autoLinkUrlOf(text: string): string | undefined {
  if (HTTP_LINK_TEXT_PATTERN.test(text)) return text
  if (WWW_LINK_TEXT_PATTERN.test(text)) return `https://${text}`
  if (EMAIL_LINK_TEXT_PATTERN.test(text)) return `mailto:${text}`
  return undefined
}

function keepsMeaningWhenWrittenBare(text: string): boolean {
  return (
    BARE_LINK_CHARACTERS_PATTERN.test(text) &&
    !NON_INTRAWORD_UNDERSCORE_PATTERN.test(text) &&
    (text.match(TILDE_PATTERN)?.length ?? 0) <= MAX_BARE_LINK_TILDES
  )
}

function bareLinkText(node: AutolinkMdastNode, state: MarkdownSerializerState): string | undefined {
  if (state.options.resourceLink || node.title) return undefined
  const [only, ...rest] = node.children
  if (rest.length > 0 || only?.type !== "text") return undefined
  const text = only.value
  if (node.url !== autoLinkUrlOf(text)) return undefined
  return keepsMeaningWhenWrittenBare(text) ? text : undefined
}

export const bareAutolinkExportVisitor: LexicalExportVisitor<
  LexicalAutoLinkNode,
  AutolinkMdastNode
> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testLexicalNode: isLexicalAutoLinkNode,
  visitLexicalNode({ lexicalNode, actions }) {
    actions.addAndStepInto(AUTOLINK_MDAST_TYPE, {
      url: lexicalNode.getURL(),
      title: lexicalNode.getTitle(),
    })
  },
}

export const bareAutolinkToMarkdownExtension: ToMarkdownExtension = {
  handlers: {
    buddyAutolink(node: AutolinkMdastNode, parent, state, info) {
      const bare = bareLinkText(node, state)
      if (bare !== undefined) return bare
      return state.handle({ ...node, type: "link" }, parent, state, info)
    },
  },
}
