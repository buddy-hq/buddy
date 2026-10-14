import { useRef, useState } from "react"
import { Separator, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import { FileTextIcon } from "@/icons/app-icons"
import { MarkdownBenchEditor, type MarkdownBenchEditorHandle } from "@/components/bench/markdown/editor"
import type { MarkdownBenchContentsState } from "@/components/bench/markdown/use-contents"
import { ReaderTocPopover } from "@/components/readers/ui/reader-toc-popover"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"

type FrameWidth = "docked" | "wide"
type DocumentExample = "workshop" | "short" | "empty"

const EXAMPLES = {
  workshop: {
    title: "Workshop objectives",
    markdown: `# Objectives and decisions

Start with the change we want in the student. The workshop should leave them able to direct a coding agent, check its work, and decide what to do next.

## Workshop end goals

Make Buddy useful to the students who try it. Give them a process they can repeat after the workshop, with enough understanding to judge the result.

### A useful outcome

Students can make a small software change, test the behavior, and explain what the evidence tells them. Finishing a demo is only the beginning.

### Evidence of learning

Ask students to change one behavior in a small project. Let them predict the outcome first, then compare that prediction with the result.

## Agentic software engineering: session plan

The session moves from a concrete goal to a working example. Introduce a new idea when it helps explain something students have just seen.

### Understand the agent loop

A coding agent reads the task, chooses a tool, observes the result, and continues. The student supplies direction and checks the evidence along the way.

### Build, check, improve

Start with a small change whose result is visible. Read the diff together. Run the relevant check, then decide whether another change is needed.

### Questions & discussion

Leave room for students to explain what surprised them. Use their questions to revisit the parts of the process that need another example.

## Setup and delivery

Prepare a small starter project and a clear setup path. Make the first successful action easy to reach, so attention stays on learning.

### Before the workshop

Check the project on both macOS and Windows. Share installation steps ahead of time and make the example files available locally.

### A fallback plan

Keep a recorded walkthrough and a completed example ready. Students should still be able to inspect the work when a network or account is unavailable.

## Questions & discussion

Return to the outcome at the end. Ask what students can now do on their own, what they would check next, and where they still need help.
`,
  },
  short: {
    title: "One useful idea",
    markdown: `## Retrieval before rereading

Close the page and try to explain the idea in your own words. Notice what you remember and where the explanation becomes uncertain.

Return to the source with one specific question. Write a short note after answering it.
`,
  },
  empty: {
    title: "A note without headings",
    markdown: "A small note does not need an outline. Write down the idea you want to keep, then return to it when you need it.",
  },
} satisfies Record<DocumentExample, { title: string; markdown: string }>

function PrototypeDocument(props: { example: DocumentExample; format: MarkdownBenchDocumentFormat }) {
  const editorRef = useRef<MarkdownBenchEditorHandle>(null)
  const [contents, setContents] = useState<MarkdownBenchContentsState>({
    items: [],
    activeItemId: undefined,
  })
  const [contentsOpen, setContentsOpen] = useState(false)
  const [markdown, setMarkdown] = useState(EXAMPLES[props.example].markdown)
  const document = EXAMPLES[props.example]

  function jumpToHeading(id: string) {
    editorRef.current?.scrollToHeading(id)
    setContentsOpen(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-base">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-weaker-base px-3">
        <ReaderTocPopover
          items={contents.items}
          activeItemId={contents.activeItemId}
          emptyMessage="No headings in this document."
          onSelect={jumpToHeading}
          open={contentsOpen}
          onOpenChange={setContentsOpen}
        />
        <Separator orientation="vertical" className="my-3" />
        <FileTextIcon className="size-4 shrink-0 text-text-weaker" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs text-text-weak">{document.title}.{props.format === "mdx" ? "mdx" : "md"}</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          <MarkdownBenchEditor
            ref={editorRef}
            appearance="plain"
            markdown={markdown}
            version="easel"
            dirty={false}
            saving={false}
            conflict={false}
            directory="."
            documentFormat={props.format}
            path={props.format === "mdx" ? "easel-markdown-contents.mdx" : "easel-markdown-contents.md"}
            title={document.title}
            readOnly
            onChange={setMarkdown}
            onContentsChange={setContents}
          />
        </div>
      </div>
    </div>
  )
}

/** Native Markdown TOC preview using the book-reader Contents popover. */
export function MarkdownContentsEasel() {
  const [width, setWidth] = useState<FrameWidth>("docked")
  const [example, setExample] = useState<DocumentExample>("workshop")
  const [format, setFormat] = useState<MarkdownBenchDocumentFormat>("markdown")
  return (
    <div className="flex min-h-0 w-full flex-col overflow-y-auto bg-background-base p-5">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium text-text-strong">Markdown · Contents</h2>
          <p className="text-sm text-text-weak">The book-reader Contents popover, with a heading outline for Markdown and MDX.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup type="single" size="sm" variant="outline" value={width} aria-label="Preview width" onValueChange={(value) => {
            if (value === "docked" || value === "wide") setWidth(value)
          }}>
            <ToggleGroupItem value="docked">Docked · 480</ToggleGroupItem>
            <ToggleGroupItem value="wide">Wide · 960</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" size="sm" variant="outline" value={example} aria-label="Document example" onValueChange={(value) => {
            if (value === "workshop" || value === "short" || value === "empty") setExample(value)
          }}>
            <ToggleGroupItem value="workshop">Workshop</ToggleGroupItem>
            <ToggleGroupItem value="short">One heading</ToggleGroupItem>
            <ToggleGroupItem value="empty">No headings</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" size="sm" variant="outline" value={format} aria-label="Document format" onValueChange={(value) => {
            if (value === "markdown" || value === "mdx") setFormat(value)
          }}>
            <ToggleGroupItem value="markdown">Markdown</ToggleGroupItem>
            <ToggleGroupItem value="mdx">MDX</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <p className="text-xs text-text-weaker">Open Contents to jump between sections. The popover highlights the current heading and closes after selection.</p>
        <div className="max-w-full overflow-x-auto pb-2">
          <div className={cn("mx-auto h-[min(70vh,720px)] min-h-[400px] overflow-hidden rounded-xl border border-border-base", width === "docked" ? "w-[480px]" : "w-[960px]")}>
            <PrototypeDocument key={`${example}:${format}`} example={example} format={format} />
          </div>
        </div>
      </div>
    </div>
  )
}
