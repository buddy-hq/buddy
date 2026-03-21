import { ToolHeader } from '../shared/tool-header'
import { ToolOutputPanel } from '../shared/tool-card'
import { readString, unwrapError } from '../shared/utils'
import { cn } from '@buddy/ui'
import type { ToolPartProps } from './registry'

export function TaskTool({ state, info, onOpenSession }: ToolPartProps) {
  const running = state.status === 'pending' || state.status === 'running'
  const childSessionId = readString(state.metadata.sessionId)
  const openChildSession =
    childSessionId && onOpenSession ? () => onOpenSession?.(childSessionId) : undefined
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : '')).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : '')

  const content = (
    <>
      <ToolHeader info={info} status={state.status} running={running} />
      {state.status === 'error' && showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </>
  )

  const cardClassName = 'w-full rounded-lg border border-border bg-card p-3'

  if (openChildSession && state.status !== 'error') {
    return (
      <button
        type="button"
        className={cn(cardClassName, 'text-left transition-colors hover:border-foreground/30')}
        onClick={openChildSession}
      >
        {content}
      </button>
    )
  }

  return <div className={cardClassName}>{content}</div>
}
