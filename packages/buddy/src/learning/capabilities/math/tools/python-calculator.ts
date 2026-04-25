import PYTHON_CALCULATOR_DESCRIPTION from "./python-calculator.md"
import z from "zod"
import { AdvancedMathRuntimeService } from "../../../../local-runtimes/advanced-math/service"
import { ADVANCED_MATH_RUNTIME_DEPENDENCY, createBuddyTool } from "../../../tools/create-buddy-tool"

const pythonCalculatorInputSchema = z.object({
  code: z.string().trim().min(1),
})

export const pythonCalculatorTool = createBuddyTool(
  "python_calculator",
  {
    description: PYTHON_CALCULATOR_DESCRIPTION,
    parameters: pythonCalculatorInputSchema,
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
  },
  {
    runtimeDependency: ADVANCED_MATH_RUNTIME_DEPENDENCY,
  },
)
