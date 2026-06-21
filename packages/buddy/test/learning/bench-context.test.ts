import { afterEach, describe, expect, test } from "bun:test"
import {
  BENCH_CONTEXT_HISTORY_LIMIT,
  BenchContextWriteConflictError,
  clearBenchContextRegistry,
  publishSequencedBenchContext,
} from "../../src/learning/features/bench/context"

const DIRECTORY = "/tmp/buddy-bench-context"
const SESSION_ID = "session-context"
const HISTORY_OVERFLOW_COUNT = BENCH_CONTEXT_HISTORY_LIMIT + 1

afterEach(() => {
  clearBenchContextRegistry()
})

function publish(input: {
  idempotencyKey: string
  instanceID: string
  generation: number
  leaseEpoch: number
  publicationSequence: number
}) {
  return publishSequencedBenchContext({
    directory: DIRECTORY,
    sessionID: SESSION_ID,
    body: {
      lease: {
        instanceID: input.instanceID,
        generation: input.generation,
        leaseEpoch: input.leaseEpoch,
      },
      publicationSequence: input.publicationSequence,
      idempotencyKey: input.idempotencyKey,
      value: { status: "closed" },
    },
  })
}

describe("Bench context history bounds", () => {
  test("evicts the oldest idempotency tombstone while retaining recent conflicts", () => {
    for (let index = 0; index < HISTORY_OVERFLOW_COUNT; index += 1) {
      publish({
        idempotencyKey: `write-${index}`,
        instanceID: "instance-1",
        generation: 1,
        leaseEpoch: 1,
        publicationSequence: index + 1,
      })
    }

    const reusedOldest = publish({
      idempotencyKey: "write-0",
      instanceID: "instance-1",
      generation: 1,
      leaseEpoch: 1,
      publicationSequence: HISTORY_OVERFLOW_COUNT + 1,
    })
    expect(reusedOldest.revision).toBe(HISTORY_OVERFLOW_COUNT + 1)

    expect(() =>
      publish({
        idempotencyKey: `write-${HISTORY_OVERFLOW_COUNT - 1}`,
        instanceID: "instance-1",
        generation: 1,
        leaseEpoch: 1,
        publicationSequence: HISTORY_OVERFLOW_COUNT + 2,
      }),
    ).toThrow(BenchContextWriteConflictError)
  })

  test("evicts the oldest lease sequence while retaining recent monotonicity", () => {
    for (let index = 0; index < HISTORY_OVERFLOW_COUNT; index += 1) {
      publish({
        idempotencyKey: `lease-write-${index}`,
        instanceID: `instance-${index}`,
        generation: 1,
        leaseEpoch: index + 1,
        publicationSequence: 1,
      })
    }

    expect(
      publish({
        idempotencyKey: "oldest-lease-reused",
        instanceID: "instance-0",
        generation: 1,
        leaseEpoch: 1,
        publicationSequence: 1,
      }).revision,
    ).toBe(HISTORY_OVERFLOW_COUNT + 1)

    expect(() =>
      publish({
        idempotencyKey: "recent-lease-reused",
        instanceID: `instance-${HISTORY_OVERFLOW_COUNT - 1}`,
        generation: 1,
        leaseEpoch: HISTORY_OVERFLOW_COUNT,
        publicationSequence: 1,
      }),
    ).toThrow(BenchContextWriteConflictError)
  })
})
