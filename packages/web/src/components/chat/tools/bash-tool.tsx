import { ToolCardWithDetails, ToolOutputPanel } from '../shared/tool-card'
import { readString } from '../shared/utils'
import { stripAnsi } from '../shared/utils'
import type { ToolPartProps } from './registry'

export function BashTool({ state, info, defaultOpen }: ToolPartProps) {
  const running = state.status === 'pending' || state.status === 'running'
  const shellCommand = readString(state.input.command) ?? readString(state.metadata.command) ?? ''
  const shellOutput = stripAnsi(state.output || (readString(state.metadata.output) ?? ''))
  const shellText = shellCommand
    ? `$ ${shellCommand}${shellOutput ? `\n\n${shellOutput}` : ''}`
    : shellOutput

  return (
    <ToolCardWithDetails
      info={info}
      status={state.status}
      running={running}
      defaultOpen={defaultOpen}
    >
      {shellText ? (
        <ToolOutputPanel output={shellText} status={state.status} copyLabel="Copy shell output" />
      ) : null}
      {!shellText && state.status === 'completed' ? (
        <div className="mt-2 text-xs text-muted-foreground">No output</div>
      ) : null}
    </ToolCardWithDetails>
  )
}
