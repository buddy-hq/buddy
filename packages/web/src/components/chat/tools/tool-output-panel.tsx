import { CopyAction } from "../copy-action"

interface ToolOutputPanelProps {
  output: string
  copyLabel: string
}

export function ToolOutputPanel({ output, copyLabel }: ToolOutputPanelProps) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-background-base px-3 py-2 text-xs text-text-weak">
        {output}
      </pre>
      <div className="flex justify-start">
        <CopyAction value={output} label={copyLabel} />
      </div>
    </div>
  )
}
