import {
  NestedLexicalEditor,
  type JsxComponentDescriptor,
  type JsxEditorProps,
} from "@mdxeditor/editor"
import type { RootContent } from "mdast"
import {
  canRenderMdxIntrinsic,
  MarkdownBenchMdxIntrinsicPreview,
} from "@/components/bench/markdown/mdx-intrinsic"

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
      <span
        data-component="markdown-bench-mdx-component"
        className="inline-flex items-baseline gap-1"
      >
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

export const GENERIC_MDX_COMPONENT_DESCRIPTOR = {
  name: "*",
  kind: "flow",
  props: [],
  hasChildren: true,
  Editor: GenericMdxComponentEditor,
} satisfies JsxComponentDescriptor
