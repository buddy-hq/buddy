import { OPENAI_PROVIDER_ID } from "./provider-ids"

export function canEditImagesForModel(input: {
  providerID?: string
  acceptsImages: boolean
  chatGptOAuthReady: boolean
}): boolean {
  return (
    input.providerID === OPENAI_PROVIDER_ID &&
    input.acceptsImages &&
    input.chatGptOAuthReady
  )
}
