import { Badge } from "@buddy/ui"
import { Markdown } from "@/components/Markdown"
import {
  BasicTool,
  ToolOutputPanel,
  ToolAttachmentGallery,
  DiagnosticList,
  ApplyPatchFileItem,
  CopyAction,
} from "../shared"
import {
  isRecord,
  readString,
  readNonEmptyString,
  readNonNegativeInt,
  readStringList,
  stripAnsi,
  dirname,
  titleFromToolName,
  unwrapError,
} from "../shared/utils"
import { resolveApiUrl } from "../../../lib/api-client"
import type { ToolPartProps } from "./registry"
import type { ToolDiagnostic, ApplyPatchFile, RenderFigureToolOutput, ToolQuestion } from "./types"
import { registerTool } from "./registry"
import { cn } from "@buddy/ui"

// ============================================================================
// Tool Render Functions
// ============================================================================

function renderSkillTool({ state }: ToolPartProps) {
  const skillName =
    readNonEmptyString(state.metadata.name) ??
    readNonEmptyString(state.input.name) ??
    readNonEmptyString(parseSkillName(state.output))
  const parsedContent = parseSkillContent(state.output)
  const showOutput = parsedContent.trim().length > 0 || !!state.error
  const output = parsedContent || (state.error ? unwrapError(state.error) : "")

  return (
    <BasicTool
      trigger={{ title: "Skill", subtitle: skillName }}
      status={state.status}
      defaultOpen={false}
    >
      {skillName ? (
        <div>
          <Badge variant="outline" className="text-xs text-text-weak">
            {skillName}
          </Badge>
        </div>
      ) : null}
      {showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy skill" />
      ) : null}
      <ToolAttachmentGallery attachments={state.attachments} />
    </BasicTool>
  )
}

function renderBashTool({ state, defaultOpen }: ToolPartProps) {
  const shellCommand = readString(state.input.command) ?? readString(state.metadata.command) ?? ""
  const shellOutput = stripAnsi(state.output || (readString(state.metadata.output) ?? ""))
  const shellText = shellCommand
    ? `$ ${shellCommand}${shellOutput ? `\n\n${shellOutput}` : ""}`
    : shellOutput

  return (
    <BasicTool
      trigger={{ title: "Shell", subtitle: shellCommand || undefined }}
      status={state.status}
      defaultOpen={defaultOpen}
    >
      {shellText ? (
        <ToolOutputPanel output={shellText} status={state.status} copyLabel="Copy shell output" />
      ) : null}
      {!shellText && state.status === "completed" ? (
        <div className="text-xs text-text-weak">No output</div>
      ) : null}
    </BasicTool>
  )
}

function renderPythonCalculatorTool({ state, defaultOpen }: ToolPartProps) {
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const value = state.metadata.value
  const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)

  return (
    <BasicTool
      trigger={{ title: "Python" }}
      status={state.status}
      defaultOpen={defaultOpen ?? state.status !== "pending"}
    >
      {showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy result" />
      ) : null}
      {!showOutput && valueText ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-background-base p-2 text-xs text-text-weak">
          {valueText}
        </pre>
      ) : null}
      <ToolAttachmentGallery attachments={state.attachments} />
    </BasicTool>
  )
}

function renderReadTool({ state, info }: ToolPartProps) {
  const loadedFiles = readStringList(state.metadata.loaded)
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle, args: info.args }}
      status={state.status}
      hideDetails
    >
      {loadedFiles.length > 0 ? (
        <div className="space-y-1 text-xs text-text-weak">
          {loadedFiles.map((loadedFile) => (
            <div key={loadedFile}>Loaded {loadedFile}</div>
          ))}
        </div>
      ) : null}
      {state.status === "error" && showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </BasicTool>
  )
}

function renderEditTool({ state, defaultOpen }: ToolPartProps) {
  const filePath = readString(state.input.filePath)
  const fileDiff = isRecord(state.metadata.filediff) ? state.metadata.filediff : undefined
  const beforeText = typeof fileDiff?.before === "string" ? fileDiff.before : undefined
  const afterText = typeof fileDiff?.after === "string" ? fileDiff.after : undefined
  const writeContent = readString(state.input.content)
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")

  const diagnostics: ToolDiagnostic[] = []
  if (filePath && state.metadata.diagnostics) {
    const rawDiagnosticsByFile = isRecord(state.metadata.diagnostics)
      ? state.metadata.diagnostics
      : undefined
    if (rawDiagnosticsByFile) {
      const rawDiagnostics = rawDiagnosticsByFile[filePath]
      if (Array.isArray(rawDiagnostics)) {
        for (const entry of rawDiagnostics) {
          if (!isRecord(entry)) continue
          if (!isRecord(entry.range)) continue
          if (!isRecord(entry.range.start)) continue
          if (typeof entry.range.start.line !== "number") continue
          if (typeof entry.range.start.character !== "number") continue
          if (typeof entry.message !== "string") continue
          diagnostics.push({
            range: {
              start: {
                line: entry.range.start.line,
                character: entry.range.start.character,
              },
            },
            message: entry.message,
            severity: typeof entry.severity === "number" ? entry.severity : undefined,
          })
        }
      }
    }
  }

  return (
    <BasicTool
      trigger={{
        title: state.input.oldString !== undefined ? "Edit" : "Write",
        subtitle: filePath ? dirname(filePath) : undefined,
      }}
      status={state.status}
      defaultOpen={defaultOpen}
    >
      {beforeText !== undefined || afterText !== undefined ? (
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-text-weak">Before</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-surface-weak/40 p-2 text-xs text-text-weak">
              {beforeText || "(empty)"}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-text-weak">After</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-surface-weak/40 p-2 text-xs text-text-weak">
              {afterText || "(empty)"}
            </pre>
          </div>
        </div>
      ) : null}
      {writeContent ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-background-base p-2 text-xs text-text-weak">
          {writeContent}
        </pre>
      ) : null}
      <DiagnosticList diagnostics={diagnostics.filter((d) => d.severity === 1).slice(0, 3)} />
      {showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </BasicTool>
  )
}

function renderTaskTool({ state, onOpenSession }: ToolPartProps) {
  const childSessionId = readString(state.metadata.sessionId)
  const openChildSession =
    childSessionId && onOpenSession ? () => onOpenSession?.(childSessionId) : undefined
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")

  const content = (
    <BasicTool
      trigger={{ title: "Task" }}
      status={state.status}
      hideDetails={!showOutput || state.status !== "error"}
    >
      {state.status === "error" && showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </BasicTool>
  )

  if (openChildSession && state.status !== "error") {
    return (
      <button
        type="button"
        className={cn(
          "w-full rounded-lg border border-border-base bg-surface-raised-base p-3 text-left transition-colors hover:border-border-hover",
        )}
        onClick={openChildSession}
      >
        {content}
      </button>
    )
  }

  return content
}

function renderApplyPatchTool({ state, defaultOpen }: ToolPartProps) {
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")

  const applyPatchFiles: ApplyPatchFile[] = []
  const files = state.metadata.files
  if (Array.isArray(files)) {
    for (const entry of files) {
      if (!isRecord(entry)) continue
      if (typeof entry.filePath !== "string") continue
      if (typeof entry.relativePath !== "string") continue
      if (
        entry.type !== "add" &&
        entry.type !== "update" &&
        entry.type !== "delete" &&
        entry.type !== "move"
      )
        continue

      applyPatchFiles.push({
        filePath: entry.filePath,
        relativePath: entry.relativePath,
        type: entry.type,
        before: typeof entry.before === "string" ? entry.before : "",
        after: typeof entry.after === "string" ? entry.after : "",
        additions: typeof entry.additions === "number" ? entry.additions : 0,
        deletions: typeof entry.deletions === "number" ? entry.deletions : 0,
        movePath: typeof entry.movePath === "string" ? entry.movePath : undefined,
      })
    }
  }

  const subtitle =
    applyPatchFiles.length > 0
      ? `${applyPatchFiles.length} ${applyPatchFiles.length === 1 ? "file" : "files"}`
      : undefined

  return (
    <BasicTool
      trigger={{ title: "Apply Patch", subtitle }}
      status={state.status}
      defaultOpen={defaultOpen}
    >
      <div>
        {applyPatchFiles.length > 0 ? (
          <div className="space-y-2">
            {applyPatchFiles.map((file) => (
              <ApplyPatchFileItem
                key={file.filePath}
                file={{
                  relativePath: file.relativePath,
                  type: file.type,
                  before: file.before,
                  after: file.after,
                  additions: file.additions,
                  deletions: file.deletions,
                }}
              />
            ))}
          </div>
        ) : null}
        {showOutput ? (
          <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
        ) : null}
      </div>
    </BasicTool>
  )
}

function renderSearchTool({ part, state, defaultOpen, info }: ToolPartProps) {
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const showOutput = output.trim().length > 0

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle }}
      status={state.status}
      defaultOpen={defaultOpen}
    >
      {showOutput ? (
        <div className="rounded-md border border-border-base bg-background-base px-3 py-2">
          <Markdown text={output} cacheKey={`${part.id}:tool-output`} />
        </div>
      ) : null}
    </BasicTool>
  )
}

function renderWebfetchTool({ state, info }: ToolPartProps) {
  const link = readString(state.input.url)

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle }}
      status={state.status}
      hideDetails
    >
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-sm text-text-interactive-base underline-offset-2 hover:underline"
        >
          {link}
        </a>
      ) : null}
    </BasicTool>
  )
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`\)\]]+/g

function extractUrls(text: string): string[] {
  const seen = new Set<string>()
  const matches = text.match(URL_PATTERN) ?? []
  const result: string[] = []

  for (const entry of matches) {
    const normalized = entry.replace(/[),.;:!?]+$/g, "")
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function renderExaSearchTool({ state, defaultOpen, info }: ToolPartProps) {
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const links = extractUrls(output)
  const hasOutput = output.trim().length > 0

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle }}
      status={state.status}
      defaultOpen={defaultOpen}
    >
      {links.length > 0 ? (
        <div className="space-y-1">
          {links.map((link) => (
            <a
              key={link}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm text-text-interactive-base underline-offset-2 hover:underline"
            >
              {link}
            </a>
          ))}
        </div>
      ) : null}
      {state.status === "error" && hasOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </BasicTool>
  )
}

function stripUrlCredentials(value: string): string {
  try {
    const url = new URL(value)
    url.username = ""
    url.password = ""
    return url.toString()
  } catch {
    return value
  }
}

export function parseRenderFigureOutput(
  state: ToolPartProps["state"],
): RenderFigureToolOutput | undefined {
  const artifact = readString(state.metadata.artifact)
  if (artifact !== "RenderFigureOutput" && artifact !== "RenderFreeformFigureOutput")
    return undefined

  const value = isRecord(state.metadata.value) ? state.metadata.value : undefined
  if (!value) return undefined

  const figureID = readNonEmptyString(value.figureID)
  const mime = value.mime === "image/svg+xml" ? "image/svg+xml" : undefined
  const url = readNonEmptyString(value.url)
  const alt = readNonEmptyString(value.alt)
  const caption = readNonEmptyString(value.caption)
  const repairAttempts = readNonNegativeInt(value.repairAttempts)

  if (!figureID || !mime || !url || !alt || repairAttempts === undefined) return undefined

  return { figureID, mime, url, alt, caption, repairAttempts }
}

function renderRenderFigureTool({ state, info }: ToolPartProps) {
  const renderFigure = state.status === "completed" ? parseRenderFigureOutput(state) : undefined
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const showOutput = output.trim().length > 0

  if (!renderFigure) {
    return (
      <BasicTool
        trigger={{ title: info.title, subtitle: info.subtitle }}
        status={state.status}
        hideDetails
      >
        {state.status === "error" && showOutput ? (
          <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
        ) : null}
      </BasicTool>
    )
  }

  const imageUrl = resolveApiUrl(renderFigure.url)
  const copyableImageUrl = stripUrlCredentials(imageUrl)

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle }}
      status={state.status}
      hideDetails
    >
      <figure className="rounded-lg border border-border-base bg-background-base p-2">
        <img
          src={imageUrl}
          alt={renderFigure.alt}
          loading="lazy"
          className="h-auto w-full rounded-md"
        />
      </figure>
      {renderFigure.caption ? (
        <div className="mt-1 text-sm text-text-weak">{renderFigure.caption}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CopyAction value={copyableImageUrl} label="Copy image URL" />
        <span className="text-xs text-text-weak">
          {renderFigure.repairAttempts > 0
            ? `repaired ${renderFigure.repairAttempts} ${renderFigure.repairAttempts === 1 ? "time" : "times"}`
            : "rendered automatically from tool output"}
        </span>
      </div>
    </BasicTool>
  )
}

function readQuestions(input: Record<string, unknown>): ToolQuestion[] {
  const value = input.questions
  if (!Array.isArray(value)) return []

  return value.flatMap((entry): ToolQuestion[] => {
    if (!isRecord(entry)) return []
    if (typeof entry.question !== "string") return []
    return [{ question: entry.question }]
  })
}

function readQuestionAnswers(metadata: Record<string, unknown>): string[][] {
  const value = metadata.answers
  if (!Array.isArray(value)) return []

  return value.map((entry) => {
    if (!Array.isArray(entry)) return []
    return entry.filter((answer): answer is string => typeof answer === "string")
  })
}

function renderQuestionTool({ state, info, defaultOpen }: ToolPartProps) {
  const questions = readQuestions(state.input)
  const questionAnswers = readQuestionAnswers(state.metadata)
  const hasAnswers = questionAnswers.length > 0
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")

  const subtitle =
    questions.length === 0
      ? info.subtitle
      : hasAnswers
        ? `${questions.length} answered`
        : `${questions.length} ${questions.length === 1 ? "question" : "questions"}`

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle }}
      status={state.status}
      defaultOpen={defaultOpen || hasAnswers}
    >
      {hasAnswers ? (
        <div className="space-y-2">
          {questions.map((question, index) => {
            const answers = questionAnswers[index] ?? []
            const questionKey = `${question.question}:${answers.join("|")}`
            return (
              <div
                key={questionKey}
                className="rounded-md border border-border-base bg-background-base p-2"
              >
                <div className="text-sm text-text-base">{question.question}</div>
                <div className="mt-1 text-xs text-text-weak">
                  {answers.join(", ") || "(no answer)"}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
      {showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </BasicTool>
  )
}

function renderBuddyCustomTool({ state, tool, defaultOpen }: ToolPartProps) {
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const artifact = readString(state.metadata.artifact)
  const value = state.metadata.value
  const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)

  return (
    <BasicTool
      trigger={{ title: titleFromToolName(tool) }}
      status={state.status}
      defaultOpen={defaultOpen ?? state.status !== "pending"}
    >
      {artifact ? (
        <div>
          <Badge variant="outline" className="text-xs text-text-weak">
            {artifact}
          </Badge>
        </div>
      ) : null}
      {showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
      {!showOutput && valueText ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-background-base p-2 text-xs text-text-weak">
          {valueText}
        </pre>
      ) : null}
      <ToolAttachmentGallery attachments={state.attachments} />
    </BasicTool>
  )
}

function renderGenericTool({ state, info }: ToolPartProps) {
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle, args: info.args }}
      status={state.status}
      hideDetails
    >
      {state.status === "error" && showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </BasicTool>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseSkillName(output?: string): string | undefined {
  if (!output) return undefined
  const match = output.match(/<skill_content name="([^"]+)">/)
  return match?.[1]
}

function parseSkillContent(output?: string): string {
  if (!output) return ""
  const match = output.match(/<skill_content name="[^"]+">([\s\S]*?)<\/skill_content>/)
  if (!match?.[1]) return output
  return match[1].trim()
}

// ============================================================================
// Tool Registration
// ============================================================================

// Context tools - these are grouped together
registerTool({ name: "read", render: renderReadTool, isContextTool: true })
registerTool({ name: "list", render: renderSearchTool, isContextTool: true })
registerTool({ name: "glob", render: renderSearchTool, isContextTool: true })
registerTool({ name: "grep", render: renderSearchTool, isContextTool: true })

// File operation tools
registerTool({ name: "edit", render: renderEditTool })
registerTool({ name: "write", render: renderEditTool })
registerTool({ name: "apply_patch", render: renderApplyPatchTool })

// Shell and execution tools
registerTool({ name: "bash", render: renderBashTool })
registerTool({ name: "python_calculator", render: renderPythonCalculatorTool })

// Web tools
registerTool({ name: "webfetch", render: renderWebfetchTool })
registerTool({ name: "websearch", render: renderExaSearchTool })
registerTool({ name: "codesearch", render: renderExaSearchTool })

// Agent and task tools
registerTool({ name: "task", render: renderTaskTool })
registerTool({ name: "skill", render: renderSkillTool })

// Visualization tools
registerTool({ name: "render_figure", render: renderRenderFigureTool })
registerTool({
  name: "render_freeform_figure",
  render: renderRenderFigureTool,
})

// Interactive tools
registerTool({ name: "question", render: renderQuestionTool })

// Hidden tools
registerTool({
  name: "todowrite",
  render: () => null,
})
registerTool({
  name: "todoread",
  render: () => null,
})

// Export BuddyCustomTool for external use (e.g., tool-part.tsx)
export { renderBuddyCustomTool as BuddyCustomTool, renderGenericTool as GenericTool }
