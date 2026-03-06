import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

function readPrompt(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

describe("prompt contracts", () => {
  test("practice-agent prompt keeps the deliberate-practice contract", () => {
    const prompt = readPrompt("../src/learning/curriculum/practice-agent.p.md")

    expect(prompt).toContain("# Role")
    expect(prompt).toContain("# Available context")
    expect(prompt).toContain("# Workflow")
    expect(prompt).toContain("# Tool rules")
    expect(prompt).toContain("# Success criteria")
    expect(prompt).toContain("# Avoid")
    expect(prompt).toContain("# Output expectations")
    expect(prompt).toContain("goal IDs")
    expect(prompt).toContain("expert-thinking")
    expect(prompt).toContain("realistic scenario")
    expect(prompt).toContain("task constraints")
    expect(prompt).toContain("deliverable")
    expect(prompt).toContain("self-check")
    expect(prompt).toContain("why the task matters")
    expect(prompt).toContain("practice_record")
  })

  test("assessment-agent prompt keeps the evidence-first inline-check contract", () => {
    const prompt = readPrompt("../src/learning/curriculum/assessment-agent.p.md")

    expect(prompt).toContain("# Role")
    expect(prompt).toContain("# Available context")
    expect(prompt).toContain("# Workflow")
    expect(prompt).toContain("# Tool rules")
    expect(prompt).toContain("# Success criteria")
    expect(prompt).toContain("# Avoid")
    expect(prompt).toContain("# Output expectations")
    expect(prompt).toContain("goal IDs")
    expect(prompt).toContain("one assessment format")
    expect(prompt).toContain("evidence criteria")
    expect(prompt).toContain("follow-up action")
    expect(prompt).toContain("current conversation")
    expect(prompt).toContain("assessment_record")
  })

  test("curriculum-orchestrator prompt keeps routing and delegation explicit", () => {
    const prompt = readPrompt("../src/learning/curriculum/curriculum-orchestrator.p.md")

    expect(prompt).toContain("# Role")
    expect(prompt).toContain("# Available context")
    expect(prompt).toContain("# Workflow")
    expect(prompt).toContain("# Delegation rules")
    expect(prompt).toContain("# Success criteria")
    expect(prompt).toContain("# Avoid")
    expect(prompt).toContain("# Output expectations")
    expect(prompt).toContain("goal-writer")
    expect(prompt).toContain("practice-agent")
    expect(prompt).toContain("assessment-agent")
    expect(prompt).toContain("Use the `task` tool")
    expect(prompt).toContain("Do not call `curriculum_update`")
  })

  test("bundled activity skills keep the procedural contract shape", () => {
    const prompt = readPrompt("../src/skills/system/buddy-practice-guided/SKILL.md")

    expect(prompt).toContain("name: buddy-practice-guided")
    expect(prompt).toContain("intent: practice")
    expect(prompt).toContain("activity: guided-practice")
    expect(prompt).toContain("# Role")
    expect(prompt).toContain("# Use When")
    expect(prompt).toContain("# Workflow")
    expect(prompt).toContain("# Tool Hints")
    expect(prompt).toContain("# Avoid")
    expect(prompt).toContain("# Output")
    expect(prompt).toContain("practice_record")
  })
})
