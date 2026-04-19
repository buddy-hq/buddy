import ACTIVE_RESOURCE_CONTEXT_TEMPLATE_SOURCE from "../runtime-context/resource-context/active-resource-context.t.md"
import { definePromptTemplate } from "../template/engine"
import { defineTurnReminder } from "./definition"

const ACTIVE_RESOURCE_CONTEXT_TEMPLATE = definePromptTemplate({
  source: ACTIVE_RESOURCE_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/user-prelude/active-resource-reminder",
})

export const activeResourceReminder = defineTurnReminder({
  key: "active-resource",
  when: (context) => context.activeResource !== undefined,
  render: (context) => {
    const resource = context.activeResource!
    const fields = [
      ...(resource.id ? [`id=${resource.id}`] : []),
      ...(resource.alias ? [`alias=${resource.alias}`] : []),
      ...(resource.status ? [`status=${resource.status}`] : []),
      ...(resource.tocLabel ? [`toc=${resource.tocLabel}`] : []),
      ...(resource.pageLabel ? [`page=${resource.pageLabel}`] : []),
      ...(resource.locationLabel ? [`location=${resource.locationLabel}`] : []),
    ]

    const optional_fields = fields.length === 0 ? "" : `${fields.join("\n")}\n`

    return ACTIVE_RESOURCE_CONTEXT_TEMPLATE.render({
      title: resource.title,
      path: resource.path,
      optional_fields,
    })
  },
})
