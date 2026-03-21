import { describe, expect, test } from 'bun:test'
import type { MessageWithParts, ProviderInfo } from '../../../src/state/chat-types'
import { getSessionContextMetrics } from '../../../src/state/context-metrics'

const assistant = (
  id: string,
  tokens: { input: number; output: number; reasoning: number; read: number; write: number },
  cost: number,
  providerID = 'anthropic',
  modelID = 'k2p5',
): MessageWithParts => ({
  info: {
    id,
    sessionID: 'session_1',
    role: 'assistant',
    parentID: 'user_1',
    providerID,
    modelID,
    mode: 'chat',
    agent: 'build',
    path: {
      cwd: '/tmp',
      root: '/tmp',
    },
    time: { created: 1 },
    cost,
    tokens: {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning,
      cache: {
        read: tokens.read,
        write: tokens.write,
      },
    },
  },
  parts: [],
})

const user = (id: string): MessageWithParts => ({
  info: {
    id,
    sessionID: 'session_1',
    role: 'user',
    agent: 'build',
    model: {
      providerID: 'anthropic',
      modelID: 'k2p5',
    },
    time: { created: 1 },
  },
  parts: [],
})

describe('getSessionContextMetrics', () => {
  test('computes totals and usage from latest assistant with tokens', () => {
    const messages = [
      user('u1'),
      assistant('a1', { input: 0, output: 0, reasoning: 0, read: 0, write: 0 }, 0.5),
      assistant('a2', { input: 300, output: 100, reasoning: 50, read: 25, write: 25 }, 1.25),
    ]

    const providers: ProviderInfo[] = [
      {
        id: 'anthropic',
        name: 'Anthropic',
        env: [],
        models: [
          {
            id: 'k2p5',
            providerID: 'anthropic',
            name: 'Kimi K2.5',
            api: { id: 'k2p5' },
            limit: { context: 1_000, output: 32_000 },
            reasoning: true,
            options: {},
          },
        ],
      },
    ]

    const metrics = getSessionContextMetrics(messages, providers)
    expect(metrics.totalCost).toBe(1.75)
    expect(metrics.context?.message.id).toBe('a2')
    expect(metrics.context?.total).toBe(500)
    expect(metrics.context?.usage).toBe(50)
    expect(metrics.context?.providerLabel).toBe('Anthropic')
    expect(metrics.context?.modelLabel).toBe('Kimi K2.5')
    expect(metrics.context?.remaining).toBe(500)
  })

  test('preserves fallback labels and null usage when model metadata is missing', () => {
    const messages = [
      assistant(
        'a1',
        { input: 40, output: 10, reasoning: 0, read: 0, write: 0 },
        0.1,
        'p-1',
        'm-1',
      ),
    ]
    const providers: ProviderInfo[] = [{ id: 'p-1', name: 'p-1', env: [], models: [] }]

    const metrics = getSessionContextMetrics(messages, providers)
    expect(metrics.context?.providerLabel).toBe('p-1')
    expect(metrics.context?.modelLabel).toBe('m-1')
    expect(metrics.context?.limit).toBeUndefined()
    expect(metrics.context?.usage).toBeNull()
    expect(metrics.context?.remaining).toBeUndefined()
  })
})
