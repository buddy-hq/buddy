import { describe, expect, test } from "bun:test"
import {
  INTENT_CAPABILITY_MANIFESTS,
  SKILL_CAPABILITY_REGISTRY,
  TOOL_CAPABILITY_REGISTRY,
  validateIntentCapabilityBindings,
} from "../src/learning/intents/capabilities"
import { pedagogyExplanationTool, pedagogyGuidedPracticeTool } from "../src/learning/capabilities/pedagogy/tools/definitions"
import type { IntentCapabilityManifest } from "../src/learning/intents/capabilities/intent-manifests"
import type { SkillCapability } from "../src/learning/intents/capabilities/skill-capabilities"
import { createToolCapability, toolCapabilityKey, type ToolCapability } from "../src/learning/intents/capabilities/tool-capabilities"

function cloneManifests(): IntentCapabilityManifest[] {
  return INTENT_CAPABILITY_MANIFESTS.map((manifest) => ({
    intent: manifest.intent,
    toolCapabilities: [...manifest.toolCapabilities],
    skillCapabilityKeys: [...manifest.skillCapabilityKeys],
  }))
}

describe("validateIntentCapabilityBindings", () => {
  test("fails on unknown capability keys in a manifest", () => {
    const toolCapabilities = TOOL_CAPABILITY_REGISTRY.filter(
      (capability) => toolCapabilityKey(capability) !== "pedagogy_guided_practice",
    )

    expect(() =>
      validateIntentCapabilityBindings({
        manifests: INTENT_CAPABILITY_MANIFESTS,
        toolCapabilities,
        skillCapabilities: SKILL_CAPABILITY_REGISTRY,
      }),
    ).toThrow("unknown tool capability keys")
  })

  test("fails on duplicate capability keys inside one intent manifest", () => {
    const manifests = cloneManifests()
    const practiceManifest = manifests.find((manifest) => manifest.intent === "practice")
    if (!practiceManifest) {
      throw new Error("Expected practice intent manifest")
    }

    practiceManifest.skillCapabilityKeys.push("explanation-playbook")
    practiceManifest.skillCapabilityKeys.push("explanation-playbook")

    expect(() =>
      validateIntentCapabilityBindings({
        manifests,
        toolCapabilities: TOOL_CAPABILITY_REGISTRY,
        skillCapabilities: SKILL_CAPABILITY_REGISTRY,
      }),
    ).toThrow("duplicate skill capability keys")
  })

  test("fails when two capability keys map to the same pedagogy tool id", () => {
    const toolCapabilities: ToolCapability[] = [
      ...TOOL_CAPABILITY_REGISTRY,
      createToolCapability(pedagogyGuidedPracticeTool),
    ]

    expect(() =>
      validateIntentCapabilityBindings({
        manifests: INTENT_CAPABILITY_MANIFESTS,
        toolCapabilities,
        skillCapabilities: SKILL_CAPABILITY_REGISTRY,
      }),
    ).toThrow("Colliding pedagogy tool IDs")
  })

  test("fails when two capability keys map to the same skill name", () => {
    const skillCapabilities: SkillCapability[] = [
      ...SKILL_CAPABILITY_REGISTRY,
      {
        key: "alternate-explanation-playbook",
        skillName: "buddy-pedagogy-explanation",
      },
    ]

    expect(() =>
      validateIntentCapabilityBindings({
        manifests: INTENT_CAPABILITY_MANIFESTS,
        toolCapabilities: TOOL_CAPABILITY_REGISTRY,
        skillCapabilities,
      }),
    ).toThrow("Colliding skill names")
  })

  test("allows reusing the same capability key across multiple intents", () => {
    const manifests = cloneManifests()
    const practiceManifest = manifests.find((manifest) => manifest.intent === "practice")
    const assessManifest = manifests.find((manifest) => manifest.intent === "assess")
    if (!practiceManifest || !assessManifest) {
      throw new Error("Expected practice and assess intent manifests")
    }

    assessManifest.toolCapabilities.push(createToolCapability(pedagogyGuidedPracticeTool))
    practiceManifest.skillCapabilityKeys.push("explanation-playbook")

    expect(() =>
      validateIntentCapabilityBindings({
        manifests,
        toolCapabilities: TOOL_CAPABILITY_REGISTRY,
        skillCapabilities: SKILL_CAPABILITY_REGISTRY,
      }),
    ).not.toThrow()
  })

  test("fails when the same capability topic is bound as both tool and skill", () => {
    const manifests = cloneManifests()
    const learnManifest = manifests.find((manifest) => manifest.intent === "learn")
    if (!learnManifest) {
      throw new Error("Expected learn intent manifest")
    }

    learnManifest.toolCapabilities.push(createToolCapability(pedagogyExplanationTool))

    expect(() =>
      validateIntentCapabilityBindings({
        manifests,
        toolCapabilities: [
          ...TOOL_CAPABILITY_REGISTRY,
          createToolCapability(pedagogyExplanationTool),
        ],
        skillCapabilities: SKILL_CAPABILITY_REGISTRY,
      }),
    ).toThrow("cannot be both tool and skill")
  })
})
