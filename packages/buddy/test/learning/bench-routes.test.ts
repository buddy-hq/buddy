import { describe, expect, test } from "bun:test"
import { app } from "../../src/index"
import { BENCH_CLIENT_ACTION_COMPLETION_MAX_REQUEST_BODY_BYTES } from "../../src/learning/features/bench/capture-limits"

const OVERSIZED_ACTION_ID = "oversized-capture"

describe("Bench routes", () => {
  test("rejects oversized client-action completions before JSON parsing", async () => {
    const response = await app.request(
      `/api/bench/client-actions/${OVERSIZED_ACTION_ID}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(BENCH_CLIENT_ACTION_COMPLETION_MAX_REQUEST_BODY_BYTES + 1),
      },
    )

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: "Bench client action completion exceeds the request size limit.",
    })
  })
})
