import { describe, expect, test } from "bun:test"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import type { PermissionRule } from "@buddy/opencode-adapter/permission"
import { Config } from "@buddy/backend/config"

describe("custom permission contract", () => {
  test("must accept learner_snapshot_read, python_calculator, render_figure, render_freeform_figure, and render_mermaid custom permissions", async () => {
    const customPermissionConfig = {
      learner_snapshot_read: "allow",
      python_calculator: "allow",
      render_figure: "allow",
      render_freeform_figure: "allow",
      render_mermaid: "allow",
    }

    const parsed = Config.Permission.parse(customPermissionConfig)

    expect(parsed).toHaveProperty("learner_snapshot_read")
    expect(parsed).toHaveProperty("python_calculator")
    expect(parsed).toHaveProperty("render_figure")
    expect(parsed).toHaveProperty("render_freeform_figure")
    expect(parsed).toHaveProperty("render_mermaid")

    const ruleset = PermissionNext.fromConfig(parsed)
    const customRuleActions = new Map(
      ruleset
        .filter(
          (rule: PermissionRule) =>
            rule.permission === "learner_snapshot_read" ||
            rule.permission === "python_calculator" ||
            rule.permission === "render_figure" ||
            rule.permission === "render_freeform_figure" ||
            rule.permission === "render_mermaid",
        )
        .map((rule: PermissionRule) => [rule.permission, rule.action]),
    )

    expect(customRuleActions.get("learner_snapshot_read")).toBe("allow")
    expect(customRuleActions.get("python_calculator")).toBe("allow")
    expect(customRuleActions.get("render_figure")).toBe("allow")
    expect(customRuleActions.get("render_freeform_figure")).toBe("allow")
    expect(customRuleActions.get("render_mermaid")).toBe("allow")
  })

  test("must accept learner_snapshot_read with pattern-based rules", async () => {
    const customPermissionConfig = {
      learner_snapshot_read: {
        ".buddy/context.json": "allow",
        ".buddy/**": "ask",
      },
    }

    const parsed = Config.Permission.parse(customPermissionConfig)

    expect(parsed).toHaveProperty("learner_snapshot_read")
    expect(typeof parsed.learner_snapshot_read).toBe("object")

    const ruleset = PermissionNext.fromConfig(parsed)
    const learnerSnapshotRules = ruleset.filter(
      (rule: PermissionRule) => rule.permission === "learner_snapshot_read",
    )
    const byPattern = new Map(
      learnerSnapshotRules.map((rule: PermissionRule) => [rule.pattern, rule.action]),
    )

    expect(byPattern.get(".buddy/context.json")).toBe("allow")
    expect(byPattern.get(".buddy/**")).toBe("ask")
  })

  test("custom permissions must survive round-trip through Config.Permission parsing", async () => {
    const input = {
      learner_snapshot_read: "deny",
      python_calculator: "allow",
      render_figure: "allow",
      render_freeform_figure: "ask",
      render_mermaid: "allow",
      other_standard_permission: "allow",
    }

    const parsed = Config.Permission.parse(input)
    const reParsed = Config.Permission.parse(parsed)

    expect(reParsed.learner_snapshot_read).toBe("deny")
    expect(reParsed.python_calculator).toBe("allow")
    expect(reParsed.render_figure).toBe("allow")
    expect(reParsed.render_freeform_figure).toBe("ask")
    expect(reParsed.render_mermaid).toBe("allow")
    expect(reParsed.other_standard_permission).toBe("allow")
  })
})
