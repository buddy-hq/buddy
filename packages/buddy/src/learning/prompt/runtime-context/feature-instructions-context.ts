import { allBuddyFeatures } from "../../runtime/feature-registry"
import { defineRuntimeSection } from "./definition"

export const featureInstructionsSection = defineRuntimeSection({
  key: "feature-instructions",
  render: (context) => {
    const enabledFeatureIDs = new Set(context.sessionRuntime.enabledFeatureIDs)
    const instructions = allBuddyFeatures()
      .filter((feature) => enabledFeatureIDs.has(feature.id))
      .flatMap((feature) =>
        feature.prompt?.instructions ? [feature.prompt.instructions.trim()] : [],
      )

    if (instructions.length === 0) {
      return undefined
    }

    return `<feature_instructions>\n${instructions.join("\n\n")}\n</feature_instructions>`
  },
})
