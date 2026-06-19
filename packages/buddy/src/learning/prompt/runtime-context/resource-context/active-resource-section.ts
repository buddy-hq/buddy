import ACTIVE_RESOURCE_CONTEXT_TEMPLATE_SOURCE from "./active-resource-context.t.md"
import { defineRuntimeSection } from "../definition"
import { definePromptTemplate } from "../../template/engine"

const ACTIVE_RESOURCE_CONTEXT_TEMPLATE = definePromptTemplate({
  source: ACTIVE_RESOURCE_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/resource-context/active-resource-context.t.md",
})

export const activeResourceSection = defineRuntimeSection({
  key: "active-resource",
  when: (context) => context.activeResource !== undefined,
  render: (context) => {
    const resource = context.activeResource!
    const fields = [
      ...(resource.objectID ? [`object_id=${resource.objectID}`] : []),
      ...(resource.alias ? [`alias=${resource.alias}`] : []),
      ...(resource.status ? [`status=${resource.status}`] : []),
    ]

    const optional_fields = fields.length === 0 ? "" : `${fields.join("\n")}\n`

    return ACTIVE_RESOURCE_CONTEXT_TEMPLATE.render({
      title: resource.title,
      path: resource.path,
      optional_fields,
    })
  },
})
