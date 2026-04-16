import CALCULATOR_CONTEXT_TEMPLATE_SOURCE from "./calculator-context.t.md"
import { defineRuntimeSection } from "./definition"
import { definePromptTemplate } from "../template/engine"

const PYTHON_CALCULATOR_ALLOW_ACCESS = "allow" as const
const CALCULATOR_CONTEXT_TEMPLATE = definePromptTemplate({
  source: CALCULATOR_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/calculator-context.t.md",
})

export const calculatorSection = defineRuntimeSection({
  key: "calculator",
  when: (context) =>
    context.capabilityEnvelope.tools.python_calculator === PYTHON_CALCULATOR_ALLOW_ACCESS,
  render: () => CALCULATOR_CONTEXT_TEMPLATE.render({}),
})
