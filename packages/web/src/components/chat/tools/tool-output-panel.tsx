import { CopyAction } from "../copy-action"

type ToolOutputPanelProps = {
  output: string
  copyLabel?: string
}

export function ToolOutputPanel({ output, copyLabel }: ToolOutputPanelProps) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <pre className="max-h-60 overflow-auto rounded-md border border-border-base/45 bg-background-base/85 px-3 py-2 whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-text-weaker">
        {output}
      </pre>
      {copyLabel ? (
        <div className="flex justify-start">
          <CopyAction value={output} label={copyLabel} />
        </div>
      ) : null}
    </div>
  )
}
