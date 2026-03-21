import { describe, expect, test } from 'bun:test'
import {
  appendPartDelta,
  inferBusyFromMessages,
  upsertMessage,
  upsertPart,
} from '../src/state/chat-reducer'
import type { MessageWithParts } from '../src/state/chat-types'

function makeMessages(): MessageWithParts[] {
  return [
    {
      info: {
        id: 'message_1',
        sessionID: 'session_1',
        role: 'assistant',
      },
      parts: [],
    },
  ]
}

describe('chat reducer', () => {
  test('upsertMessage appends new message', () => {
    const next = upsertMessage([], {
      id: 'message_1',
      sessionID: 'session_1',
      role: 'assistant',
    })

    expect(next).toHaveLength(1)
    expect(next[0]?.info.id).toBe('message_1')
  })

  test('upsertPart appends part to existing message', () => {
    const current = makeMessages()
    const next = upsertPart(current, {
      id: 'part_1',
      sessionID: 'session_1',
      messageID: 'message_1',
      type: 'text',
      text: 'hello',
    })
    expect(next[0]?.parts).toHaveLength(1)
  })

  test('appendPartDelta appends delta to string fields', () => {
    const withPart = upsertPart(makeMessages(), {
      id: 'part_1',
      sessionID: 'session_1',
      messageID: 'message_1',
      type: 'text',
      text: 'hello',
    })
    const next = appendPartDelta(withPart, {
      messageID: 'message_1',
      partID: 'part_1',
      field: 'text',
      delta: ' world',
    })
    const textPart = next[0]?.parts[0]
    expect(textPart?.type).toBe('text')
    if (textPart?.type === 'text') {
      expect(textPart.text).toBe('hello world')
    }
  })

  test('inferBusyFromMessages checks assistant finish state', () => {
    expect(
      inferBusyFromMessages([
        {
          info: {
            id: 'message_1',
            sessionID: 'session_1',
            role: 'assistant',
          },
          parts: [],
        },
      ]),
    ).toBe(true)

    expect(
      inferBusyFromMessages([
        {
          info: {
            id: 'message_1',
            sessionID: 'session_1',
            role: 'assistant',
            finish: 'stop',
          },
          parts: [],
        },
      ]),
    ).toBe(false)
  })
})
