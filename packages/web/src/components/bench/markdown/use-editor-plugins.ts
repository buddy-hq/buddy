import { useMemo } from "react"
import {
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  directivesPlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  jsxPlugin,
  linkPlugin,
  linkDialogPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import { BUDDY_CODE_MIRROR_EXTENSIONS } from "@/components/bench/markdown/code-theme"
import { MarkdownBenchToolbarContents } from "@/components/bench/markdown/editor-toolbar-portal"
import { GENERIC_MDX_COMPONENT_DESCRIPTOR } from "@/components/bench/markdown/mdx-generic-component"
import { buddyChemistryPlugin } from "@/components/bench/markdown/plugins/chemistry"
import { MARKDOWN_BENCH_DIRECTIVE_DESCRIPTORS } from "@/components/bench/markdown/plugins/directives"
import {
  markdownBenchErrorRecoveryPlugin,
  markdownBenchHistoryControlsPlugin,
  type MarkdownBenchHistoryControls,
} from "@/components/bench/markdown/plugins/editor-runtime"
import { buddyHardBreakPlugin } from "@/components/bench/markdown/plugins/hard-breaks"
import { buddyFrontmatterPlugin } from "@/components/bench/markdown/plugins/frontmatter"
import { buddyFormattingRunsPlugin } from "@/components/bench/markdown/plugins/formatting-runs"
import { buddyListFidelityPlugin } from "@/components/bench/markdown/plugins/list-fidelity"
import { buddyMathPlugin } from "@/components/bench/markdown/plugins/math"
import { buddyMdxEsmPlugin } from "@/components/bench/markdown/plugins/mdx-esm"
import { buddyObsidianPlainSyntaxPlugin } from "@/components/bench/markdown/plugins/obsidian-plain-syntax"
import { buddyProseDirectivePlugin } from "@/components/bench/markdown/plugins/prose-directives"
import { buddyRawHtmlPlugin } from "@/components/bench/markdown/plugins/raw-html"
import { buddyMermaidPlugin } from "@/components/bench/markdown/plugins/mermaid"
import {
  buddyObsidianWikiLinkPlugin,
  type ObsidianWikiLinkContext,
} from "@/components/bench/markdown/plugins/obsidian"
import { buddyMarkdownSvgPlugin } from "@/components/bench/markdown/plugins/svg"
import { resolveMarkdownBenchImageSrc } from "@/lib/markdown-bench-image-src"

const CODE_BLOCK_LANGUAGES = {
  txt: "Plain text",
  js: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  css: "CSS",
  html: "HTML",
  json: "JSON",
  markdown: "Markdown",
  bash: "Bash",
  python: "Python",
} satisfies Record<string, string>

export function useMarkdownBenchEditorPlugins(input: {
  directory: string
  documentFormat: MarkdownBenchDocumentFormat
  path: string
  resolveImageSrc?(src: string): string
  obsidianWikiLinkContext: ObsidianWikiLinkContext
  onHistoryControlsChange(controls: MarkdownBenchHistoryControls): void
  onProcessingErrorChange(message: string | undefined): void
}) {
  const {
    directory,
    documentFormat,
    obsidianWikiLinkContext,
    onHistoryControlsChange,
    onProcessingErrorChange,
    path,
    resolveImageSrc,
  } = input

  return useMemo(
    () => [
      diffSourcePlugin({
        codeMirrorExtensions: BUDDY_CODE_MIRROR_EXTENSIONS,
        viewMode: "rich-text",
      }),
      headingsPlugin(),
      listsPlugin(),
      buddyListFidelityPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      buddyHardBreakPlugin(),
      buddyFormattingRunsPlugin(),
      buddyMathPlugin(),
      ...(documentFormat === "markdown" ? [buddyMarkdownSvgPlugin(), buddyRawHtmlPlugin()] : []),
      buddyMermaidPlugin(),
      buddyChemistryPlugin(),
      buddyObsidianWikiLinkPlugin({ context: obsidianWikiLinkContext }),
      buddyObsidianPlainSyntaxPlugin(),
      linkPlugin(),
      linkDialogPlugin({
        showLinkTitleField: true,
      }),
      tablePlugin(),
      codeBlockPlugin(),
      codeMirrorPlugin({
        codeBlockLanguages: CODE_BLOCK_LANGUAGES,
        codeMirrorExtensions: BUDDY_CODE_MIRROR_EXTENSIONS,
      }),
      frontmatterPlugin(),
      buddyFrontmatterPlugin(),
      imagePlugin({
        imagePreviewHandler: (src) =>
          Promise.resolve(
            resolveImageSrc?.(src) ??
              resolveMarkdownBenchImageSrc({
                directory: directory,
                documentPath: path,
                src,
              }),
          ),
      }),
      directivesPlugin({
        directiveDescriptors: MARKDOWN_BENCH_DIRECTIVE_DESCRIPTORS,
      }),
      buddyProseDirectivePlugin(),
      ...(documentFormat === "mdx"
        ? [
            jsxPlugin({
              allowFragment: false,
              jsxComponentDescriptors: [GENERIC_MDX_COMPONENT_DESCRIPTOR],
            }),
            buddyMdxEsmPlugin(),
          ]
        : []),
      markdownBenchErrorRecoveryPlugin({
        onProcessingErrorChange: onProcessingErrorChange,
      }),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarClassName: "!hidden",
        toolbarContents: MarkdownBenchToolbarContents,
      }),
      markdownBenchHistoryControlsPlugin({
        onChange: onHistoryControlsChange,
      }),
    ],
    [
      directory,
      documentFormat,
      obsidianWikiLinkContext,
      onHistoryControlsChange,
      onProcessingErrorChange,
      path,
      resolveImageSrc,
    ],
  )
}
