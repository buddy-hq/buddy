import { NestedLexicalEditor, type DirectiveDescriptor, type DirectiveEditorProps } from "@mdxeditor/editor"
import type { RootContent } from "mdast"
import { cn } from "@buddy/ui"

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

const MARKDOWN_BENCH_ADMONITION_TONE_CLASS_NAMES = {
  critical:
    "border-border-critical-base/45 border-l-border-critical-base bg-surface-critical-weak text-text-on-critical-weak",
  info:
    "border-border-info-base/45 border-l-border-info-base bg-surface-info-weak text-text-on-info-weak",
  neutral:
    "border-border-weak-base border-l-border-strong-base bg-surface-weak text-text-base",
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

const MARKDOWN_BENCH_DIRECTIVE_CONTENT_CLASS_NAME = [
  "min-w-0 text-sm leading-6",
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

function MarkdownBenchContainerDirectiveBody({
  mdastNode,
}: {
  mdastNode: ContainerDirectiveNode
}) {
  return (
    <div
      data-slot="markdown-bench-directive-content"
      className={MARKDOWN_BENCH_DIRECTIVE_CONTENT_CLASS_NAME}
    >
      <NestedLexicalEditor<typeof mdastNode>
        block
        getContent={(node) => node.children}
        getUpdatedMdastNode={(node, children) => ({
          ...node,
          children: children.filter(isContainerDirectiveChild),
        })}
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

const MARKDOWN_BENCH_ADMONITION_DIRECTIVE_DESCRIPTOR: DirectiveDescriptor<ContainerDirectiveNode> = {
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

export const MARKDOWN_BENCH_DIRECTIVE_DESCRIPTORS: DirectiveDescriptor<ContainerDirectiveNode>[] = [
  MARKDOWN_BENCH_ADMONITION_DIRECTIVE_DESCRIPTOR,
  MARKDOWN_BENCH_CONTAINER_DIRECTIVE_DESCRIPTOR,
]
