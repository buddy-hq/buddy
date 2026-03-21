import { ToolHeader } from '../shared/tool-header'
import { ToolOutputPanel } from '../shared/tool-card'
import { readStringList, unwrapError } from '../shared/utils'
import { cn } from '@buddy/ui'
import type { ToolPartProps } from './registry'

export function ReadTool({ part, state, info }: ToolPartProps) {
  const running = state.status === 'pending' || state.status === 'running'
  const loadedFiles = readStringList(state.metadata.loaded)
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : '')).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : '')

  return (
    <div className="w-full rounded-lg border border-border bg-card p-3">
      <ToolHeader info={info} status={state.status} running={running} />
      {loadedFiles.length > 0 ? (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {loadedFiles.map((loadedFile) => (
            <div key={loadedFile}>Loaded {loadedFile}</div>
          ))}
        </div>
      ) : null}
      {state.status === 'error' && showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </div>
  )
}
