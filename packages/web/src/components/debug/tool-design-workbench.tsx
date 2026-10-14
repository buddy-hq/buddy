import { useRef, type ReactNode } from "react"
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Z_INDEX,
} from "@buddy/ui"
import { CHAT_BODY_TEXT_STYLE } from "@/components/chat/chat-text-styles"
import { useDevToolsNavigation } from "./devtools-navigation-store"
import { TOOL_DESIGNS, TOOL_PROMPTS } from "./tool-designs"
import type { RegisteredToolPrompt, ToolDesignStatus, ToolPrompt } from "./tool-designs/model"
import {
  formatToolSignature,
  type ToolSignatureLine,
  type ToolSignatureTokenRole,
} from "./tool-designs/signature"

const TOOL_DESIGN_STATUS_SUFFIX = {
  proposed: "",
  applied: " (applied)",
  historical: " (historical)",
} satisfies Record<ToolDesignStatus, string>

const TOOL_STAGE_LABEL = {
  today: "Today",
  proposed: "Proposed",
} satisfies Record<ToolPrompt["stage"], string>

function ToolSection(props: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-border-base last:border-b-0">
      <h3 className="border-b border-border-weaker-base bg-surface-raised-base px-4 py-2 text-xs font-medium text-text-weak">
        {props.title}
      </h3>
      {props.children}
    </div>
  )
}

const TOOL_SIGNATURE_TOKEN_COLOR = {
  tool: "var(--syntax-keyword)",
  field: "var(--syntax-property)",
  optional: "var(--syntax-operator)",
  type: "var(--syntax-type)",
  literal: "var(--syntax-string)",
  punctuation: "var(--syntax-punctuation)",
} satisfies Record<ToolSignatureTokenRole, string>

function ToolSignature(props: { lines: readonly ToolSignatureLine[] }) {
  return (
    <div className="flex flex-col px-4 py-3 font-mono text-xs leading-5 text-text-base">
      {props.lines.map((line) => {
        if (line.kind === "gap") return <div key={line.id} className="h-3" />
        return (
          <div key={line.id} className="flex" style={{ paddingLeft: `${line.depth * 2}ch` }}>
            {line.kind === "note" ? (
              <>
                <span
                  aria-hidden
                  className="shrink-0 select-none whitespace-pre"
                  style={{ color: "var(--syntax-comment)" }}
                >
                  {"// "}
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words font-sans text-[13px] text-text-base">
                  {line.text}
                </span>
              </>
            ) : (
              <span className="whitespace-pre">
                {line.tokens.map((part) => (
                  <span key={part.id} style={{ color: TOOL_SIGNATURE_TOKEN_COLOR[part.role] }}>
                    {part.text}
                  </span>
                ))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ToolPromptCard(props: { tool: ToolPrompt }) {
  const { tool } = props
  return (
    <section
      aria-label={tool.name}
      className="rounded-lg border border-border-base bg-background-base"
    >
      <header className="flex items-center gap-2 rounded-t-lg border-b border-border-base bg-surface-raised-base px-4 py-3">
        <h2 className="font-mono text-sm font-medium text-text-strong">{tool.name}</h2>
        <Badge variant="outline">{TOOL_STAGE_LABEL[tool.stage]}</Badge>
      </header>

      <ToolSection title="Description">
        <p
          data-chat-typography
          className="whitespace-pre-wrap break-words px-4 py-3"
          style={CHAT_BODY_TEXT_STYLE}
        >
          {tool.description}
        </p>
      </ToolSection>

      <ToolSection title="Parameters">
        <ToolSignature lines={formatToolSignature(tool.name, tool.parameters)} />
        <details className="border-t border-border-weaker-base">
          <summary className="cursor-pointer px-4 py-2 text-xs text-text-weak">
            Raw JSON schema the model receives
          </summary>
          <pre className="whitespace-pre-wrap break-words px-4 pb-3 font-mono text-xs text-text-base">
            {tool.parameters}
          </pre>
        </details>
      </ToolSection>

      <ToolSection title="Returns to Buddy">
        <ul className="flex flex-col">
          {tool.returns.map((example) => (
            <li
              key={example.situation}
              className="flex flex-col gap-1.5 border-b border-border-weaker-base px-4 py-3 last:border-b-0"
            >
              <span className="text-xs text-text-weak">{example.situation}</span>
              <pre className="whitespace-pre-wrap break-words rounded-md bg-surface-raised-base px-3 py-2 font-mono text-xs text-text-base">
                {example.text}
              </pre>
            </li>
          ))}
        </ul>
      </ToolSection>
    </section>
  )
}

function ToolPromptList(props: { entries: readonly RegisteredToolPrompt[] }) {
  return (
    <>
      {(["today", "proposed"] as const).map((stage) => {
        const entries = props.entries.filter((entry) => entry.tool.stage === stage)
        if (entries.length === 0) return null
        return (
          <div key={stage} className="flex flex-col gap-1">
            <p className="px-3 pb-1 pt-2 text-xs font-medium text-text-weaker">
              {TOOL_STAGE_LABEL[stage]}
            </p>
            {entries.map(({ id, tool }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="h-auto min-h-0 w-full flex-none rounded-md px-3 py-2.5 text-left font-mono"
              >
                {tool.name}
              </TabsTrigger>
            ))}
          </div>
        )
      })}
    </>
  )
}

export function ToolDesignWorkbench() {
  const selectedToolPromptID = useDevToolsNavigation((state) => state.toolPromptID)
  const setToolPromptID = useDevToolsNavigation((state) => state.setToolPromptID)
  const mainScrollRef = useRef<HTMLDivElement>(null)
  const activeEntry =
    TOOL_PROMPTS.find((entry) => entry.id === selectedToolPromptID) ?? TOOL_PROMPTS.at(0)
  const activeDesign = activeEntry?.design
  const activeToolPrompts = TOOL_PROMPTS.filter((entry) => entry.design.id === activeDesign?.id)

  function selectToolPrompt(id: string) {
    setToolPromptID(id)
    mainScrollRef.current?.scrollTo({ top: 0, left: 0 })
  }

  if (!activeEntry || !activeDesign) return null

  return (
    <Tabs
      orientation="vertical"
      value={activeEntry.id}
      onValueChange={(value) => {
        if (TOOL_PROMPTS.some((entry) => entry.id === value)) selectToolPrompt(value)
      }}
      className="h-full min-h-0 w-full gap-0 bg-background-base text-text-base"
    >
      <aside className="flex min-h-0 w-72 shrink-0 flex-col border-r border-border-base bg-surface-raised-base">
        <div className="border-b border-border-base p-2">
          <Select
            value={activeDesign.id}
            onValueChange={(designID) => {
              const firstEntry = TOOL_PROMPTS.find((entry) => entry.design.id === designID)
              if (firstEntry) selectToolPrompt(firstEntry.id)
            }}
          >
            <SelectTrigger aria-label="Tool design" className="w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ zIndex: Z_INDEX.devtoolsFloating }} position="popper">
              {TOOL_DESIGNS.toReversed().map((design) => (
                <SelectItem key={design.id} value={design.id} className="text-sm">
                  {design.label} · {design.title}
                  {TOOL_DESIGN_STATUS_SUFFIX[design.status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TabsList
          aria-label={`${activeDesign.label} tools`}
          className="min-h-0 w-full flex-col items-stretch justify-start gap-2 overflow-y-auto rounded-none p-2"
        >
          <ToolPromptList entries={activeToolPrompts} />
        </TabsList>
      </aside>

      <div ref={mainScrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          <header className="flex flex-col gap-2">
            <p className="text-xs text-text-weaker">{activeDesign.label}</p>
            <h1 className="text-lg font-medium text-text-strong">{activeDesign.title}</h1>
            <p data-chat-typography style={CHAT_BODY_TEXT_STYLE}>
              {activeDesign.summary}
            </p>
            <ul
              data-chat-typography
              className="flex list-disc flex-col gap-1 pl-5"
              style={CHAT_BODY_TEXT_STYLE}
            >
              {activeDesign.why.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </header>

          {activeToolPrompts.map((entry) => (
            <TabsContent key={entry.id} value={entry.id} className="mt-0 min-w-0">
              <ToolPromptCard tool={entry.tool} />
            </TabsContent>
          ))}
        </div>
      </div>
    </Tabs>
  )
}
