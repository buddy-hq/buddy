type DevelopmentFeaturesInput = {
  viteDevelopment: boolean
  buddyChannel: string | undefined
}

export function resolveDevelopmentFeaturesEnabled(input: DevelopmentFeaturesInput): boolean {
  return input.viteDevelopment || input.buddyChannel === "dev"
}

export const DEVELOPMENT_FEATURES_ENABLED = resolveDevelopmentFeaturesEnabled({
  viteDevelopment: import.meta.env.DEV,
  buddyChannel: import.meta.env.BUDDY_CHANNEL,
})
