import z from "zod"
import { AdvancedMathRuntimeService } from "../../../../local-runtimes/advanced-math/service"
import { createBuddyTool } from "../../../tools/create-buddy-tool"

const pythonCalculatorInputSchema = z.object({
  code: z.string().trim().min(1),
})

export const pythonCalculatorTool = createBuddyTool("python_calculator", {
  description:
    "Evaluate Python code for mathematical calculations, analysis, and plotting. Prefer exact symbolic forms such as fractions, radicals, and symbolic constants before decimal approximations when possible. Import libraries before using them. Supported scientific libraries: math, sympy, numpy, pandas, xarray, scipy, matplotlib, seaborn. Use this before making mathematical claims or validating worked results. Use this tool for function graphs and data plots; reserve figure-rendering tools for explicit geometry diagrams.",
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
})
