import { describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { mathTools } from "../../src/learning/capabilities/math/tools/tools"
import { registerBuddyTools } from "../../src/learning/tools/register-buddy-tools"
import { AdvancedMathRuntimeService } from "../../src/local-runtimes/advanced-math/service"
import {
  withInstalledMockAdvancedMathRuntime,
  withLocalMockAdvancedMathRuntimeAssets,
} from "../helpers/advanced-math-runtime"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

describe("python_calculator runtime", () => {
  test("installs the optional runtime and returns text plus plot attachments", async () => {
    await withInstalledMockAdvancedMathRuntime(async () => {
      const status = await AdvancedMathRuntimeService.getStatus()
      expect(status.ready).toBe(true)
      expect(status.supportedLibraries).toEqual([
        "math",
        "sympy",
        "numpy",
        "pandas",
        "xarray",
        "scipy",
        "matplotlib",
        "seaborn",
      ])

      const result = await AdvancedMathRuntimeService.runCalculator(
        "print('hello')\n2 + 2\nmake_plot",
      )

      expect(result.output).toContain("hello")
      expect(result.output).toContain("4")
      expect(result.attachments).toHaveLength(1)
      expect(result.attachments[0]?.mime).toBe("image/png")
      expect(result.attachments[0]?.url.startsWith("data:image/png;base64,")).toBe(true)
    })
  })

  test("accepts null last-expression payloads and suppresses Python None output", async () => {
    await withInstalledMockAdvancedMathRuntime(async () => {
      const nullResult = await AdvancedMathRuntimeService.runCalculator("null_last_expression")
      expect(nullResult.output).toBe("Execution completed with no output.")

      const noneResult = await AdvancedMathRuntimeService.runCalculator("none_last_expression")
      expect(noneResult.output).toBe("Execution completed with no output.")

      const plotOnlyResult = await AdvancedMathRuntimeService.runCalculator("make_plot")
      expect(plotOnlyResult.output).toBe("Generated 1 plot.")
      expect(plotOnlyResult.attachments).toHaveLength(1)
    })
  })

  test("registers python_calculator as a callable math tool when the runtime is available", async () => {
    await withInstalledMockAdvancedMathRuntime(async () => {
      await using project = await tmpdir({ git: true })

      const result = await OpenCodeInstance.provide({
        directory: project.path,
        async fn() {
          await registerBuddyTools(project.path, mathTools)

          const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
          const calculator = requireTool(tools, "python_calculator")

          return calculator.execute(
            {
              code: "print('hello')\n2+2\nmake_plot",
            },
            createToolContext({
              sessionID: "ses_math",
              messageID: "msg_math",
              agent: "math-buddy",
            }),
          )
        },
      })

      expect(result.title).toBe("Python calculator")
      expect(result.output).toContain("hello")
      expect(result.output).toContain("4")
      expect(result.attachments).toHaveLength(1)
    })
  })

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
          (error: unknown) => ({ ok: false as const, error }),
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
