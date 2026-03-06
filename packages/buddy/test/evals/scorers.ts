import { expect } from "bun:test"
import type { RuntimeProfile } from "../../src/learning/runtime/types.js"

export function expectAllowedTools(profile: RuntimeProfile, toolIds: string[]) {
  for (const toolId of toolIds) {
    expect(profile.capabilityEnvelope.tools[toolId as keyof typeof profile.capabilityEnvelope.tools]).toBe("allow")
  }
}

export function expectDeniedTools(profile: RuntimeProfile, toolIds: string[]) {
  for (const toolId of toolIds) {
    expect(profile.capabilityEnvelope.tools[toolId as keyof typeof profile.capabilityEnvelope.tools]).toBe("deny")
  }
}

export function expectPreferredHelpers(profile: RuntimeProfile, helperIds: string[]) {
  for (const helperId of helperIds) {
    expect(profile.capabilityEnvelope.subagents[helperId as keyof typeof profile.capabilityEnvelope.subagents]).toBe("prefer")
  }
}

export function expectVisibleSurfaces(profile: RuntimeProfile, surfaces: string[]) {
  expect(profile.capabilityEnvelope.visibleSurfaces).toEqual(expect.arrayContaining(surfaces))
}
