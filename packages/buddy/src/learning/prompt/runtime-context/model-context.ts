import MODEL_CONTEXT_TEMPLATE_SOURCE from "./model-context.t.md"
import { defineRuntimeSection } from "./definition"
import { definePromptTemplate } from "../template/engine"

const MODEL_CONTEXT_TEMPLATE = definePromptTemplate({
  source: MODEL_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/model-context.t.md",
})

export const modelSection = defineRuntimeSection({
  key: "model",
  when: (context) => context.model !== undefined,
  render: (context) => {
    const model = context.model!
    return MODEL_CONTEXT_TEMPLATE.render({
      active_model: `${model.providerID}/${model.modelID}`,
      context_window: `${model.contextWindow}`,
      input_window_line:
        model.inputWindow !== undefined ? `Input window: ${model.inputWindow}\n` : "",
      output_window: `${model.outputWindow}`,
    })
  },
})
