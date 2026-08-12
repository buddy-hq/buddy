import { describe, expect, test } from "bun:test"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { BUDDY } from "../../src/learning/personas/buddy"
import { TEACHING_BUDDY } from "../../src/learning/personas/teaching-buddy"
import { writeProjectConfig } from "../helpers/project-config"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { withRepo } from "./helpers"

function requireValue<T>(value: T | undefined, label: string): T {
  if (value !== undefined) {
    return value
  }

  throw new Error(`Missing ${label}`)
}

describe("parity.agent", () => {
  test("preserves Buddy agent defaults when applying partial overrides", async () => {
    await withRepo(async (directory) => {
      writeProjectConfig(
        directory,
        JSON.stringify({
          agent: {
            "teaching-buddy": {
              description: "patched only",
            },
          },
        }),
      )

      const teachingBuddyAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("teaching-buddy")),
        "teaching-buddy agent",
      )

      expect(teachingBuddyAgent.description).toBe("patched only")
      expect(teachingBuddyAgent.mode).toBe("primary")
      if (typeof teachingBuddyAgent.steps === "number") {
        expect(teachingBuddyAgent.steps).toBe(8)
      }
      const teachingBuddyPrompt = requireValue(teachingBuddyAgent.prompt, "teaching-buddy prompt")
      expect(typeof teachingBuddyPrompt).toBe("string")
      expect(teachingBuddyPrompt.length).toBeGreaterThan(0)
    })
  })

  test("preserves distinct learner and teaching prompts through runtime overlays", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        buddyAgent: await OpenCodeAgent.get("buddy"),
        teachingBuddyAgent: await OpenCodeAgent.get("teaching-buddy"),
      }))

      const buddyPrompt = requireValue(result.buddyAgent?.prompt, "buddy prompt")
      const teachingBuddyPrompt = requireValue(
        result.teachingBuddyAgent?.prompt,
        "teaching-buddy prompt",
      )

      expect(buddyPrompt.trim()).toBe(BUDDY.runtime.prompt.trim())
      expect(teachingBuddyPrompt.trim()).toBe(TEACHING_BUDDY.runtime.prompt.trim())
      expect(teachingBuddyPrompt).not.toBe(buddyPrompt)
      expect(buddyPrompt).not.toContain("## Persona: Buddy")
      expect(teachingBuddyPrompt).not.toContain("## Persona: Teaching Buddy")
    })
  }, 15_000)

  test("preserves curriculum-orchestrator defaults when applying partial overrides", async () => {
    await withRepo(async (directory) => {
      writeProjectConfig(
        directory,
        JSON.stringify({
          agent: {
            "curriculum-orchestrator": {
              description: "patched curriculum only",
            },
          },
        }),
      )

      const curriculumAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () =>
          OpenCodeAgent.get("curriculum-orchestrator"),
        ),
        "curriculum-orchestrator agent",
      )

      expect(curriculumAgent.description).toBe("patched curriculum only")
      expect(curriculumAgent.mode).toBe("subagent")
      if (typeof curriculumAgent.steps === "number") {
        expect(curriculumAgent.steps).toBe(8)
      }
      const curriculumPrompt = requireValue(
        curriculumAgent.prompt,
        "curriculum-orchestrator prompt",
      )
      expect(typeof curriculumPrompt).toBe("string")
      expect(curriculumPrompt.length).toBeGreaterThan(0)
      expect(PermissionNext.evaluate("task", "general", curriculumAgent.permission).action).toBe(
        "allow",
      )
    })
  })

  test("preserves wildcard permission rules when adding scoped overrides", async () => {
    await withRepo(async (directory) => {
      writeProjectConfig(
        directory,
        JSON.stringify({
          agent: {
            "teaching-buddy": {
              permission: {
                task: {
                  "notes/*": "allow",
                },
              },
            },
          },
        }),
      )

      const teachingBuddyAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("teaching-buddy")),
        "teaching-buddy agent",
      )

      expect(
        PermissionNext.evaluate("task", "notes/lesson.md", teachingBuddyAgent.permission).action,
      ).toBe("allow")
      expect(
        PermissionNext.evaluate("task", "tmp/scratch.md", teachingBuddyAgent.permission).action,
      ).toBe("deny")
    })
  })

  test("derives persona task permissions from the persona catalog defaults", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        buddyAgent: await OpenCodeAgent.get("buddy"),
        teachingBuddyAgent: await OpenCodeAgent.get("teaching-buddy"),
      }))

      const buddyAgent = requireValue(result.buddyAgent, "buddy agent")
      const teachingBuddyAgent = requireValue(result.teachingBuddyAgent, "teaching-buddy agent")

      expect(
        PermissionNext.evaluate("task", "curriculum-orchestrator", buddyAgent.permission).action,
      ).toBe("deny")
      expect(PermissionNext.evaluate("task", "general", buddyAgent.permission).action).toBe("allow")
      expect(PermissionNext.evaluate("task", "practice-agent", buddyAgent.permission).action).toBe(
        "deny",
      )
      expect(
        PermissionNext.evaluate("task", "question-set-author", buddyAgent.permission).action,
      ).toBe("allow")
      expect(
        PermissionNext.evaluate("task", "flashcard-author", buddyAgent.permission).action,
      ).toBe("allow")
      expect(
        PermissionNext.evaluate("task", "learner-memory-consolidator", buddyAgent.permission)
          .action,
      ).toBe("deny")

      expect(
        PermissionNext.evaluate("task", "curriculum-orchestrator", teachingBuddyAgent.permission)
          .action,
      ).toBe("deny")
      expect(
        PermissionNext.evaluate("task", "practice-agent", teachingBuddyAgent.permission).action,
      ).toBe("deny")
      expect(
        PermissionNext.evaluate("task", "assessment-agent", teachingBuddyAgent.permission).action,
      ).toBe("deny")
      expect(
        PermissionNext.evaluate("task", "question-set-author", teachingBuddyAgent.permission)
          .action,
      ).toBe("allow")
      expect(PermissionNext.evaluate("task", "general", teachingBuddyAgent.permission).action).toBe(
        "allow",
      )
      expect(PermissionNext.evaluate("task", "explore", teachingBuddyAgent.permission).action).toBe(
        "deny",
      )
      expect(
        PermissionNext.evaluate("task", "flashcard-author", teachingBuddyAgent.permission).action,
      ).toBe("allow")
      expect(
        PermissionNext.evaluate(
          "task",
          "learner-memory-consolidator",
          teachingBuddyAgent.permission,
        ).action,
      ).toBe("deny")
    })
  })

  test("derives persona learning-tool permissions from canonical Buddy capability policy", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        buddyAgent: await OpenCodeAgent.get("buddy"),
        teachingBuddyAgent: await OpenCodeAgent.get("teaching-buddy"),
      }))

      const buddyAgent = requireValue(result.buddyAgent, "buddy agent")
      const teachingBuddyAgent = requireValue(result.teachingBuddyAgent, "teaching-buddy agent")

      expect(PermissionNext.evaluate("search_standards", "*", buddyAgent.permission).action).toBe(
        "allow",
      )
      expect(PermissionNext.evaluate("render_figure", "*", buddyAgent.permission).action).toBe(
        "allow",
      )
      expect(PermissionNext.evaluate("python_calculator", "*", buddyAgent.permission).action).toBe(
        "allow",
      )
      expect(
        PermissionNext.evaluate(
          "teaching_start_lesson",
          "teaching/lesson.ts",
          buddyAgent.permission,
        ).action,
      ).toBe("deny")
      expect(
        PermissionNext.evaluate("python_calculator", "*", teachingBuddyAgent.permission).action,
      ).toBe("allow")
    })
  })

  test("does not leak persona subagent config into provider-facing agent options", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        buddyAgent: await OpenCodeAgent.get("buddy"),
        teachingBuddyAgent: await OpenCodeAgent.get("teaching-buddy"),
      }))

      const agents = [
        requireValue(result.buddyAgent, "buddy agent"),
        requireValue(result.teachingBuddyAgent, "teaching-buddy agent"),
      ]

      for (const agent of agents) {
        expect(agent.options?.subagents).toBeUndefined()
      }
    })
  })
})
