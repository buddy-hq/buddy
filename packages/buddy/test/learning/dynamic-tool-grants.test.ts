import { describe, expect, test } from "bun:test"
import { readTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import { dynamicReflectionTool } from "../../src/learning/features/teaching-guidance/tools/reflection"
import { grantDynamicLearningToolsForSession } from "../../src/learning/runtime/dynamic-tool-grants"
import { tmpdir } from "../helpers/tmpdir"

describe("dynamic tool grants", () => {
  test("seeds missing teaching runtime state before granting tools", async () => {
    await using project = await tmpdir({ git: true })

    const granted = await grantDynamicLearningToolsForSession({
      directory: project.path,
      sessionID: "ses_dynamic_seed",
      tools: [dynamicReflectionTool],
    })

    expect(granted).toEqual([dynamicReflectionTool.id])
    expect(
      readTeachingSessionState(project.path, "ses_dynamic_seed")?.sessionRuntime?.access.tools[
        dynamicReflectionTool.id
      ],
    ).toBe("allow")
  })
})
