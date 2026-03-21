import type { AssistantMessageInfo, MessageWithParts, ProviderInfo } from './chat-types'

export type TokenContextMetrics = {
  used: number
  remaining?: number
  limit?: number
}

export type SessionContextMetrics = {
  totalCost: number
  context:
    | {
        message: AssistantMessageInfo
        provider?: ProviderInfo
        model?: ProviderInfo['models'][number]
        providerLabel: string
        modelLabel: string
        limit: number | undefined
        input: number
        output: number
        reasoning: number
        cacheRead: number
        cacheWrite: number
        total: number
        usage: number | null
        remaining: number | undefined
      }
    | undefined
}

function tokenTotal(assistant: AssistantMessageInfo) {
  return (
    assistant.tokens.input +
    assistant.tokens.output +
    assistant.tokens.reasoning +
    assistant.tokens.cache.read +
    assistant.tokens.cache.write
  )
}

function lastAssistantWithTokens(messages: MessageWithParts[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.info.role !== 'assistant') continue
    if (tokenTotal(message.info) <= 0) continue
    return message.info
  }
}

export function getSessionContextMetrics(
  messages: MessageWithParts[] = [],
  providers: ProviderInfo[] = [],
): SessionContextMetrics {
  const totalCost = messages.reduce((sum, message) => {
    if (message.info.role !== 'assistant') return sum
    return sum + message.info.cost
  }, 0)

  const message = lastAssistantWithTokens(messages)
  if (!message) {
    return {
      totalCost,
      context: undefined,
    }
  }

  const provider = providers.find((item) => item.id === message.providerID)
  const model = provider?.models.find((item) => item.id === message.modelID)
  const limit = model?.limit.context
  const total = tokenTotal(message)

  return {
    totalCost,
    context: {
      message,
      provider,
      model,
      providerLabel: provider?.name ?? message.providerID,
      modelLabel: model?.name ?? message.modelID,
      limit,
      input: message.tokens.input,
      output: message.tokens.output,
      reasoning: message.tokens.reasoning,
      cacheRead: message.tokens.cache.read,
      cacheWrite: message.tokens.cache.write,
      total,
      usage: limit ? Math.round((total / limit) * 100) : null,
      remaining: typeof limit === 'number' ? Math.max(limit - total, 0) : undefined,
    },
  }
}

export function computeTokenContextMetrics(input: {
  assistant: AssistantMessageInfo
  providers: ProviderInfo[]
}): TokenContextMetrics {
  const used = tokenTotal(input.assistant)

  const provider = input.providers.find((item) => item.id === input.assistant.providerID)
  const model = provider?.models.find((item) => item.id === input.assistant.modelID)
  const limit = model?.limit.context

  if (typeof limit !== 'number' || limit <= 0) {
    return { used }
  }

  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
  }
}
