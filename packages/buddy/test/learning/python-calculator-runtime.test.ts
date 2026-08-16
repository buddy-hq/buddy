import { describe, expect, test } from "bun:test"
import { AdvancedMathRuntimeService } from "../../src/local-runtimes/advanced-math/service"
import {
  withInstalledMockAdvancedMathRuntime,
  withLocalMockAdvancedMathRuntimeAssets,
} from "../helpers/advanced-math-runtime"

describe("python_calculator runtime", () => {
  test("repairs an enabled local runtime when the local asset bundle changes", async () => {
    await withLocalMockAdvancedMathRuntimeAssets(async ({ replaceAssets }) => {
      const installed = await AdvancedMathRuntimeService.install()
      expect(installed.ready).toBe(true)

      await replaceAssets({ marker: "updated-runtime" })

      const staleStatus = await AdvancedMathRuntimeService.getStatus()
      expect(staleStatus.ready).toBe(false)
      expect(staleStatus.state).toBe("error")
      expect(staleStatus.lastError).toContain("does not match the current local asset bundle")

      const result = await AdvancedMathRuntimeService.runCalculator("__runtime_marker__")
      expect(result.output).toBe("updated-runtime")

      const repairedStatus = await AdvancedMathRuntimeService.getStatus()
      expect(repairedStatus.ready).toBe(true)
      expect(repairedStatus.state).toBe("ready")
    })
  })

  test("reports a configured self-check timeout when runtime verification takes too long", async () => {
    await withLocalMockAdvancedMathRuntimeAssets(async ({ replaceAssets }) => {
      const previousTimeout = process.env.BUDDY_ADVANCED_MATH_SELF_CHECK_TIMEOUT_MS
      process.env.BUDDY_ADVANCED_MATH_SELF_CHECK_TIMEOUT_MS = "50"
      try {
        await replaceAssets({
          selfCheckDelayMs: 200,
        })

        const status = await AdvancedMathRuntimeService.install()
        expect(status.ready).toBe(false)
        expect(status.state).toBe("error")
        expect(status.lastError).toContain("timed out after 50ms")
      } finally {
        if (previousTimeout === undefined)
          delete process.env.BUDDY_ADVANCED_MATH_SELF_CHECK_TIMEOUT_MS
        else process.env.BUDDY_ADVANCED_MATH_SELF_CHECK_TIMEOUT_MS = previousTimeout
      }
    })
  })

  test("waits for active calculator processes to exit before removing the runtime", async () => {
    await withInstalledMockAdvancedMathRuntime(async () => {
      let calculatorSettled = false
      const execution = AdvancedMathRuntimeService.runCalculator("__sleep__")
        .then(
          () => ({ ok: true as const }),
          (cause) => ({ ok: false as const, error: cause }),
        )
        .finally(() => {
          calculatorSettled = true
        })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const removed = await AdvancedMathRuntimeService.remove()
      expect(removed.state).toBe("not_installed")
      expect(removed.ready).toBe(false)
      expect(calculatorSettled).toBe(true)
      const result = await execution
      expect(result.ok).toBe(false)
      expect(result.ok ? "" : String(result.error)).toContain("Calculator execution failed")
    })
  })
})
