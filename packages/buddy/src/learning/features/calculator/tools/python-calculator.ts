import PYTHON_CALCULATOR_DESCRIPTION from "./python-calculator.md"
import z from "zod"
import { AdvancedMathRuntimeService } from "../../../../local-runtimes/advanced-math/service"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"

const pythonCalculatorInputSchema = z.object({
  code: z.string().trim().min(1),
})

export const pythonCalculatorTool = createBuddyTool({
  id: "python_calculator",
  description: PYTHON_CALCULATOR_DESCRIPTION,
  parameters: pythonCalculatorInputSchema,
  presentation: {
    archetype: "inline-output",
    icon: "calculator",
    renderer: "calculator",
    layoutRole: "compact-output",
    phases: {
      pending: { action: "Calculating" },
      running: { action: "Calculating" },
      completed: { action: "Calculated" },
      error: { action: "Failed to calculate" },
    },
  },
  async execute(args, ctx) {
    await ctx.ask({
      permission: "python_calculator",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        codeLength: args.code.length,
      },
    })

    const result = await AdvancedMathRuntimeService.runCalculator(args.code, ctx.abort)
    return {
      title: "Python calculator",
      output: result.output,
      metadata: {
        artifact: "PythonCalculatorOutput",
        value: result.result,
      },
      attachments: result.attachments,
    }
  },
  constraints: {
    runtime: "advanced-math",
  },
})
