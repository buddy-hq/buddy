import type { ModelMessage } from "ai"
import { OpenCodeAdapterProviderTransform } from "@buddy/opencode-adapter/provider-transform"
import { Flag } from "../flag/flag.js"
import { Provider } from "../provider/provider.js"
import type { ProviderModel } from "../provider/provider.js"
import type { ModelIdentity } from "./model-resolver.js"

export namespace ProviderTransform {
  const OUTPUT_TOKEN_CAP = Flag.BUDDY_EXPERIMENTAL_OUTPUT_TOKEN_MAX
  const OUTPUT_TOKEN_FALLBACK = 32_000

  export async function maxOutputTokens(model?: ModelIdentity) {
    return OpenCodeAdapterProviderTransform.maxOutputTokens({
      model,
      outputTokenCap: OUTPUT_TOKEN_CAP,
      fallback: OUTPUT_TOKEN_FALLBACK,
      resolveModel(input) {
        return Provider.findModel({
          providerID: input?.providerID,
          modelID: input?.modelID,
        })
      },
    })
  }

  export function providerOptions(model: ModelIdentity): Record<string, any> | undefined {
    return OpenCodeAdapterProviderTransform.providerOptions({
      model,
      outputTokenCap: OUTPUT_TOKEN_CAP,
      fallback: OUTPUT_TOKEN_FALLBACK,
    })
  }

  export function message(messages: ModelMessage[], model?: ProviderModel) {
    return OpenCodeAdapterProviderTransform.message(messages, model)
  }
}
