import { describe, expect, test } from "bun:test"
import { INTENT_CAPABILITY_MANIFESTS } from "../../src/learning/intents/capabilities/intent-manifests"
import { SKILL_CAPABILITY_REGISTRY } from "../../src/learning/intents/capabilities/skill-capabilities"
import { validateIntentCapabilityBindings } from "../../src/learning/intents/capabilities/validation"
import type { IntentCapabilityManifest } from "../../src/learning/intents/capabilities/intent-manifests"
import type { SkillCapability } from "../../src/learning/intents/capabilities/skill-capabilities"
import type { ToolCapability } from "../../src/learning/intents/capabilities/types"
import { createToolCapability } from "../../src/learning/intents/capabilities/tool-capabilities"
import { pedagogyPrepareResourceTool } from "../../src/learning/capabilities/pedagogy/tools/definitions/prepare-resource"

function cloneManifests(): IntentCapabilityManifest[] {
  return INTENT_CAPABILITY_MANIFESTS.map((manifest) => ({
    intent: manifest.intent,
    toolCapabilities: [...manifest.toolCapabilities],
    skillCapabilityKeys: [...manifest.skillCapabilityKeys],
  }))
}

describe("validateIntentCapabilityBindings", () => {
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
        skillCapabilities: SKILL_CAPABILITY_REGISTRY,
      }),
    ).toThrow("duplicate skill capability keys")
  })

  test("fails when the same tool binding key changes scope across intents", () => {
    const manifests = cloneManifests()
    const assessManifest = manifests.find((manifest) => manifest.intent === "assess")
    if (!assessManifest) {
      throw new Error("Expected assess intent manifest")
    }

    assessManifest.toolCapabilities.push(
      createToolCapability({
        tool: pedagogyPrepareResourceTool,
        personas: ["code-buddy"],
      }),
    )

    expect(() =>
      validateIntentCapabilityBindings({
        manifests,
        skillCapabilities: SKILL_CAPABILITY_REGISTRY,
      }),
    ).toThrow("must keep the same persona/workspace scope")
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

    assessManifest.toolCapabilities.push(createToolCapability(pedagogyPrepareResourceTool))
    practiceManifest.skillCapabilityKeys.push("explanation-playbook")

    expect(() =>
      validateIntentCapabilityBindings({
        manifests,
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

    const toolCapability = {
      tool: { id: "pedagogy_explanation" },
    } satisfies ToolCapability
    learnManifest.toolCapabilities.push(toolCapability)

    expect(() =>
      validateIntentCapabilityBindings({
        manifests,
        skillCapabilities: SKILL_CAPABILITY_REGISTRY,
      }),
    ).toThrow("cannot be both tool and skill")
  })
})
