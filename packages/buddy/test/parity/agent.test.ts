import { describe, expect, test } from "bun:test"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
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
            "code-buddy": {
              description: "patched only",
            },
          },
        }),
      )

      const codeBuddyAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("code-buddy")),
        "code-buddy agent",
      )

      expect(codeBuddyAgent.description).toBe("patched only")
      expect(codeBuddyAgent.mode).toBe("primary")
      if (typeof codeBuddyAgent.steps === "number") {
        expect(codeBuddyAgent.steps).toBe(8)
      }
      const codeBuddyPrompt = requireValue(codeBuddyAgent.prompt, "code-buddy prompt")
      expect(typeof codeBuddyPrompt).toBe("string")
      expect(codeBuddyPrompt.length).toBeGreaterThan(0)
    })
  })

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
            "code-buddy": {
              permission: {
                task: {
                  "notes/*": "allow",
                },
              },
            },
          },
        }),
      )

      const codeBuddyAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("code-buddy")),
        "code-buddy agent",
      )

      expect(
        PermissionNext.evaluate("task", "notes/lesson.md", codeBuddyAgent.permission).action,
      ).toBe("allow")
      expect(
        PermissionNext.evaluate("task", "tmp/scratch.md", codeBuddyAgent.permission).action,
      ).toBe("deny")
    })
  })

  test("derives persona task permissions from the persona catalog defaults", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        buddyAgent: await OpenCodeAgent.get("buddy"),
        codeBuddyAgent: await OpenCodeAgent.get("code-buddy"),
      }))

      const buddyAgent = requireValue(result.buddyAgent, "buddy agent")
      const codeBuddyAgent = requireValue(result.codeBuddyAgent, "code-buddy agent")

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
      ).toBe("allow")

      expect(
        PermissionNext.evaluate("task", "curriculum-orchestrator", codeBuddyAgent.permission)
          .action,
      ).toBe("deny")
      expect(
        PermissionNext.evaluate("task", "practice-agent", codeBuddyAgent.permission).action,
      ).toBe("deny")
      expect(
        PermissionNext.evaluate("task", "assessment-agent", codeBuddyAgent.permission).action,
      ).toBe("deny")
      expect(
        PermissionNext.evaluate("task", "question-set-author", codeBuddyAgent.permission).action,
      ).toBe("allow")
      expect(PermissionNext.evaluate("task", "general", codeBuddyAgent.permission).action).toBe(
        "allow",
      )
      expect(PermissionNext.evaluate("task", "explore", codeBuddyAgent.permission).action).toBe(
        "allow",
      )
      expect(
        PermissionNext.evaluate("task", "flashcard-author", codeBuddyAgent.permission).action,
      ).toBe("allow")
      expect(
        PermissionNext.evaluate("task", "learner-memory-consolidator", codeBuddyAgent.permission)
          .action,
      ).toBe("allow")
    })
  })

  test("derives persona learning-tool permissions from canonical Buddy capability policy", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        buddyAgent: await OpenCodeAgent.get("buddy"),
        codeBuddyAgent: await OpenCodeAgent.get("code-buddy"),
      }))

      const buddyAgent = requireValue(result.buddyAgent, "buddy agent")
      const codeBuddyAgent = requireValue(result.codeBuddyAgent, "code-buddy agent")

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
        PermissionNext.evaluate("python_calculator", "*", codeBuddyAgent.permission).action,
      ).toBe("deny")
    })
  })

  test("does not leak persona subagent config into provider-facing agent options", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        buddyAgent: await OpenCodeAgent.get("buddy"),
        codeBuddyAgent: await OpenCodeAgent.get("code-buddy"),
      }))

      const agents = [
        requireValue(result.buddyAgent, "buddy agent"),
        requireValue(result.codeBuddyAgent, "code-buddy agent"),
      ]

      for (const agent of agents) {
        expect(agent.options?.subagents).toBeUndefined()
      }
    })
  })
})
