import { afterEach, describe, expect, test } from "bun:test"
import {
  BENCH_TOGGLE_DIAGNOSTIC_CHANNEL,
  logBenchToggleStep,
} from "../src/lib/bench-toggle-diagnostics"
import {
  clearDiagnosticLog,
  setDiagnosticLogEnabled,
} from "../src/lib/diagnostic-log"

afterEach(async () => {
  setDiagnosticLogEnabled(BENCH_TOGGLE_DIAGNOSTIC_CHANNEL, false)
  await clearDiagnosticLog(BENCH_TOGGLE_DIAGNOSTIC_CHANNEL)
})

describe("Bench toggle diagnostics", () => {
  test("evaluates lazy details only while the channel is enabled", () => {
    let evaluationCount = 0
    const details = () => {
      evaluationCount += 1
      return { evaluationCount }
    }

    logBenchToggleStep("disabled", details)
    expect(evaluationCount).toBe(0)

    setDiagnosticLogEnabled(BENCH_TOGGLE_DIAGNOSTIC_CHANNEL, true)
    logBenchToggleStep("enabled", details)
    expect(evaluationCount).toBe(1)
  })
})
