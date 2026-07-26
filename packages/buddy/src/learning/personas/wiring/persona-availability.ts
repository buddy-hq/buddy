import { InstallationChannel } from "@buddy/opencode-adapter/installation"
import {
  BUDDY_CHANNEL_ENV,
  BUDDY_DEFAULT_DEV_CHANNEL,
  OPENCODE_DEV_CHANNEL,
  OPENCODE_PROD_CHANNEL,
  resolveBuddyReleaseChannel,
} from "@buddy/script/channel"
import { DEVELOPMENT_PERSONAS, type Persona } from "../../shared/teaching-vocabulary"

type DevelopmentPersonasInput = {
  installationChannel: string
  buddyChannel: string | undefined
}

function resolveDevelopmentPersonasEnabled(input: DevelopmentPersonasInput): boolean {
  if (input.installationChannel === OPENCODE_DEV_CHANNEL) {
    return true
  }
  if (input.installationChannel === OPENCODE_PROD_CHANNEL) {
    return false
  }

  return (
    resolveBuddyReleaseChannel({
      raw: input.buddyChannel?.trim(),
    }) === BUDDY_DEFAULT_DEV_CHANNEL
  )
}

const DEVELOPMENT_PERSONAS_ENABLED = resolveDevelopmentPersonasEnabled({
  installationChannel: InstallationChannel,
  buddyChannel: process.env[BUDDY_CHANNEL_ENV],
})

function personaIsAvailable(
  persona: Persona,
  developmentPersonasEnabled = DEVELOPMENT_PERSONAS_ENABLED,
): boolean {
  return (
    developmentPersonasEnabled ||
    !DEVELOPMENT_PERSONAS.some((developmentPersona) => developmentPersona === persona)
  )
}

export { DEVELOPMENT_PERSONAS_ENABLED, personaIsAvailable, resolveDevelopmentPersonasEnabled }
export type { DevelopmentPersonasInput }
