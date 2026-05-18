import { describe, expect, test } from "bun:test"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { applySkillPermissionDefaults } from "../../src/config/store/permission-overrides"
import type { Info } from "../../src/config/store/types"

function evaluateSkillAction(config: Info, skillName: string) {
  const permission = config.permission
  if (!permission) {
    throw new Error("Expected permission to be defined")
  }

  return PermissionNext.evaluate("skill", skillName, PermissionNext.fromConfig(permission)).action
}

describe("skill permission defaults", () => {
  test("defaults skills to allow when no permission policy exists", () => {
    const config: Info = {}

    applySkillPermissionDefaults(config)

    expect(config.permission?.skill).toBe("allow")
    expect(evaluateSkillAction(config, "any-skill")).toBe("allow")
  })

  test("preserves wildcard deny-all policies for skills", () => {
    const config: Info = {
      permission: {
        "*": "deny",
      },
    }

    applySkillPermissionDefaults(config)

    expect(config.permission?.["*"]).toBe("deny")
    expect(config.permission?.skill).toBe("deny")
    expect(evaluateSkillAction(config, "any-skill")).toBe("deny")
  })

  test("preserves inherited wildcard object rules for skills", () => {
    const config: Info = {
      permission: {
        "*": {
          "*": "allow",
          "private-*": "deny",
        },
      },
    }

    applySkillPermissionDefaults(config)

    expect(config.permission?.skill).toEqual({
      "*": "allow",
      "private-*": "deny",
    })
    expect(evaluateSkillAction(config, "public-docs")).toBe("allow")
    expect(evaluateSkillAction(config, "private-docs")).toBe("deny")
  })

  test("preserves inherited permission-key wildcards for skills", () => {
    const config: Info = {
      permission: {
        "s*": "deny",
      },
    }

    applySkillPermissionDefaults(config)

    expect(config.permission?.skill).toBe("deny")
    expect(evaluateSkillAction(config, "any-skill")).toBe("deny")
  })

  test("normalizes explicit skill ask rules to allow for toggle mode", () => {
    const config: Info = {
      permission: {
        skill: "ask",
      },
    }

    applySkillPermissionDefaults(config)

    expect(config.permission?.skill).toBe("allow")
  })
})
