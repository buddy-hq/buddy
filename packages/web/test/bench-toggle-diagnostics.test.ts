import { afterEach, describe, expect, spyOn, test } from "bun:test"
import {
  BENCH_TOGGLE_DIAGNOSTIC_CHANNEL,
  logBenchToggleStep,
} from "../src/lib/bench-toggle-diagnostics"
import { clearDiagnosticLog, setDiagnosticLogEnabled } from "../src/lib/diagnostic-log"

const DIAGNOSTIC_LOG_CONSOLE_KEY = "buddy.diagnostic-log.console"

afterEach(async () => {
  localStorage.removeItem(DIAGNOSTIC_LOG_CONSOLE_KEY)
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

  test("redacts screenshot payloads from persisted and console diagnostics", async () => {
    const pngBase64 = "screenshot-base64-payload"
    const redaction = `[redacted ${pngBase64.length} characters]`
    const consoleInfo = spyOn(console, "info").mockImplementation(() => undefined)
    setDiagnosticLogEnabled(BENCH_TOGGLE_DIAGNOSTIC_CHANNEL, true)
    localStorage.setItem(DIAGNOSTIC_LOG_CONSOLE_KEY, "true")

    try {
      logBenchToggleStep("captured", {
        completion: { outcome: "captured", pngBase64 },
      })
      await Bun.sleep(0)

      const stored = localStorage.getItem(BENCH_TOGGLE_DIAGNOSTIC_CHANNEL) ?? ""
      expect(stored).not.toContain(pngBase64)
      expect(stored).toContain(redaction)
      expect(consoleInfo).toHaveBeenCalledWith(
        `[diagnostic:${BENCH_TOGGLE_DIAGNOSTIC_CHANNEL}] captured`,
        { completion: { outcome: "captured", pngBase64: redaction } },
      )
    } finally {
      consoleInfo.mockRestore()
    }
  })
})
