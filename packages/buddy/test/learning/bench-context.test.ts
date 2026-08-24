import { afterEach, describe, expect, test } from "bun:test"
import { IN_APP_BROWSER_URL_MAX_LENGTH } from "@buddy/browser-contract"
import {
  BENCH_CONTEXT_HISTORY_LIMIT,
  BENCH_DRAWER_KIND_VALUES,
  BenchContextWriteConflictError,
  BenchDrawerContextSchema,
  BenchReadContextInputSchema,
  BenchReadContextOutputSchema,
  benchTargetKey,
  clearBenchContextRegistry,
  publishSequencedBenchContext,
} from "../../src/learning/features/bench/context"

const DIRECTORY = "/tmp/buddy-bench-context"
const SESSION_ID = "session-context"
const HISTORY_OVERFLOW_COUNT = BENCH_CONTEXT_HISTORY_LIMIT + 1
const BENCH_TARGET_KEY_PART_SEPARATOR = "\u0000"
const BENCH_TARGET_KEY_NULL_PART = "\u2400"

afterEach(() => {
  clearBenchContextRegistry()
})

describe("Bench read context contract", () => {
  test("uses an explicit response format instead of a capture boolean", () => {
    expect(BenchReadContextInputSchema.parse({ responseFormat: "context_only" })).toEqual({
      responseFormat: "context_only",
    })
    expect(
      BenchReadContextInputSchema.parse({ responseFormat: "context_and_bench_screenshot" }),
    ).toEqual({ responseFormat: "context_and_bench_screenshot" })
    expect(BenchReadContextInputSchema.parse({ responseFormat: "bench_screenshot_only" })).toEqual({
      responseFormat: "bench_screenshot_only",
    })
    expect(
      BenchReadContextInputSchema.parse({
        responseFormat: "context_only",
        tabSearch: "  chapter 4  ",
      }),
    ).toEqual({ responseFormat: "context_only", tabSearch: "chapter 4" })
    expect(() =>
      BenchReadContextInputSchema.parse({ responseFormat: "context_only", tabSearch: null }),
    ).toThrow()
    expect(() =>
      BenchReadContextInputSchema.parse({ responseFormat: "context_only", tabSearch: "  " }),
    ).toThrow()
    expect(() => BenchReadContextInputSchema.parse({ capture: true })).toThrow()
  })

  test("keeps parked tab identity while excluding selected surface content", () => {
    const value = BenchReadContextOutputSchema.parse({
      status: "open",
      visibility: "parked",
      mode: "docked",
      selectedTabKey: "file:markdown:notes.md",
      tabs: [
        {
          tabKey: "file:markdown:notes.md",
          title: "notes.md",
          target: { type: "workspace-file", path: "notes.md", viewer: "markdown" },
        },
      ],
      selectedBrowser: null,
      drawer: null,
    })

    expect(value).not.toHaveProperty("content")
    expect(value).not.toHaveProperty("targetKey")
  })

  test("rejects oversized Browser URLs at the published context boundary", () => {
    const oversizedUrl = `https://example.com/${"x".repeat(IN_APP_BROWSER_URL_MAX_LENGTH)}`
    expect(() =>
      BenchReadContextOutputSchema.parse({
        status: "open",
        visibility: "parked",
        mode: "docked",
        selectedTabKey: "browser:oversized",
        tabs: [
          {
            tabKey: "browser:oversized",
            title: "Oversized",
            target: { type: "browser", tabID: "oversized", url: oversizedUrl },
          },
        ],
        selectedBrowser: {
          tabID: "oversized",
          url: oversizedUrl,
          title: "Oversized",
          loading: false,
        },
        drawer: null,
      }),
    ).toThrow()
  })
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

describe("bench target keys", () => {
  test("preserves exact rendered target identity", () => {
    expect(
      benchTargetKey({
        type: "workspace-file",
        path: "docs/intro notes.md",
        viewer: "markdown",
      }),
    ).toBe(
      ["workspace-file", "markdown", "docs%2Fintro%20notes.md"].join(
        BENCH_TARGET_KEY_PART_SEPARATOR,
      ),
    )

    expect(
      benchTargetKey({
        type: "workspace-file",
        path: "docs/intro notes.md",
        viewer: "file",
      }),
    ).toBe(
      ["workspace-file", "file", "docs%2Fintro%20notes.md"].join(BENCH_TARGET_KEY_PART_SEPARATOR),
    )

    expect(
      benchTargetKey({
        type: "object",
        ref: {
          kind: "resource",
          objectID: "01KG1A0KH77HJ9QGAQ5QK0N4BD",
          revisionID: null,
          itemID: null,
        },
        viewID: "reader",
      }),
    ).toBe(
      [
        "object",
        "resource",
        "01KG1A0KH77HJ9QGAQ5QK0N4BD",
        BENCH_TARGET_KEY_NULL_PART,
        BENCH_TARGET_KEY_NULL_PART,
        "reader",
      ].join(BENCH_TARGET_KEY_PART_SEPARATOR),
    )

    expect(
      benchTargetKey({
        type: "object",
        ref: {
          kind: "resource",
          objectID: "01KG1A0KH77HJ9QGAQ5QK0N4BD",
          revisionID: "rev 2",
          itemID: "item/3",
        },
        viewID: "reader notes",
      }),
    ).toBe(
      [
        "object",
        "resource",
        "01KG1A0KH77HJ9QGAQ5QK0N4BD",
        "rev%202",
        "item%2F3",
        "reader%20notes",
      ].join(BENCH_TARGET_KEY_PART_SEPARATOR),
    )
  })
})

describe("Bench drawer context", () => {
  test("accepts every right-workspace drawer and rejects the removed Library taxonomy", () => {
    expect(BENCH_DRAWER_KIND_VALUES).toContain("search")
    expect(BENCH_DRAWER_KIND_VALUES).toContain("skills")
    for (const kind of BENCH_DRAWER_KIND_VALUES) {
      expect(
        BenchDrawerContextSchema.parse({
          kind,
          presentation: "drawer",
        }),
      ).toEqual({
        kind,
        presentation: "drawer",
      })
    }

    expect(() =>
      BenchDrawerContextSchema.parse({
        kind: "library",
        presentation: "drawer",
      }),
    ).toThrow()
  })
})
