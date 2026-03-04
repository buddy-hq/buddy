import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { composeLearningSystemPrompt } from "../src/learning/shared/compose-system-prompt.js"
import { readNormalizedPromptFixture } from "../src/learning/shared/prompt-fixture.js"
import { tmpdir } from "./fixture/fixture"
import { withSyncedOpenCodeConfig } from "./helpers/opencode.js"

const BUDDY_BASE_PROMPT = readFileSync(new URL("../src/learning/companion/buddy-base.p.md", import.meta.url), "utf8")
const TEACHING_POLICY_PROMPT = readFileSync(new URL("../src/learning/teaching/teaching-policy.p.md", import.meta.url), "utf8")
const CODE_BUDDY_OVERLAY = readFileSync(
  new URL("../src/learning/teaching/teacher/coding/code-buddy-overlay.p.md", import.meta.url),
  "utf8",
)
const MATH_BUDDY_OVERLAY = readFileSync(
  new URL("../src/learning/teaching/teacher/math/math-buddy-overlay.p.md", import.meta.url),
  "utf8",
)

function fixturePath(filename: string): string {
  return fileURLToPath(new URL(`./fixtures/prompts/${filename}`, import.meta.url))
}

function sessionMode(lines: string[]): string {
  return ["<session_mode>", ...lines, "</session_mode>"].join("\n")
}

function composeStaticPrompt(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join("\n\n")
}

describe("prompt assemblies", () => {
  test("loads shared prompt assets byte-for-byte from fixtures", async () => {
    const learningFixture = await readNormalizedPromptFixture(fixturePath("learning-companion.txt"))
    const teachingPolicyFixture = await readNormalizedPromptFixture(fixturePath("teaching-policy.txt"))

    expect(BUDDY_BASE_PROMPT.trimEnd()).toBe(learningFixture)
    expect(TEACHING_POLICY_PROMPT.trimEnd()).toBe(teachingPolicyFixture)
  })

  test("preserves buddy chat-mode system prompt", async () => {
    await using project = await tmpdir()

    const system = await composeLearningSystemPrompt({
      directory: project.path,
      modeID: "buddy",
      userContent: "hello",
    })

    const expected = sessionMode([
      "Mode: chat",
      "No interactive workspace is active. Teach through normal chat. If the learner wants a hands-on editor lesson, ask them to switch to Buddy's code-buddy mode or start it from the Editor tab.",
    ])

    expect(system).toBe(expected)
  })

  test("preserves code-buddy chat-mode system prompt", async () => {
    await using project = await tmpdir()

    const system = await composeLearningSystemPrompt({
      directory: project.path,
      modeID: "code-buddy",
      userContent: "teach me arrays",
    })

    expect(system).toBe(
      sessionMode([
        "Mode: chat",
        "No interactive workspace is active. Teach through normal chat unless the learner explicitly wants a hands-on editor lesson. If they do, use teaching_start_lesson to create the workspace first, then switch into editor-based teaching.",
      ]),
    )
  })

  test("preserves code-buddy interactive system prompt with completion-claim policy", async () => {
    await using project = await tmpdir()
    const teachingPolicyFixture = await readNormalizedPromptFixture(fixturePath("teaching-policy.txt"))

    const system = await composeLearningSystemPrompt({
      directory: project.path,
      modeID: "code-buddy",
      userContent: "done",
      teachingContext: {
        active: true,
        sessionID: "ses_teach",
        lessonFilePath: "/tmp/lesson.ts",
        checkpointFilePath: "/tmp/checkpoint/lesson.ts",
        language: "ts",
        revision: 3,
      },
    })

    const expectedTeachingPolicy = teachingPolicyFixture.replace(
      "\n</teaching_policy>",
      "\nThe learner's latest message is only a completion claim. It is a request to verify the current exercise, not permission to advance automatically.\n</teaching_policy>",
    )

    const expected = [
      sessionMode([
        "Mode: interactive",
        "An interactive workspace is active for this session. Teaching workspace tools are now available: teaching_start_lesson, teaching_add_file, teaching_checkpoint, teaching_set_lesson, teaching_restore_checkpoint.",
      ]),
      [
        "<teaching_workspace>",
        "Session: ses_teach",
        "Lesson file: /tmp/lesson.ts",
        "Checkpoint file: /tmp/checkpoint/lesson.ts",
        "Language: ts",
        "Revision: 3",
        "The lesson file is the in-app editor surface. Prefer reading and editing that file directly when guiding the learner.",
        "</teaching_workspace>",
      ].join("\n"),
      expectedTeachingPolicy,
    ].join("\n\n")

    expect(system).toBe(expected)
  })

  test("preserves math-buddy chat-mode system prompt", async () => {
    await using project = await tmpdir()

    const system = await composeLearningSystemPrompt({
      directory: project.path,
      modeID: "math-buddy",
      userContent: "teach me reflection",
    })

    expect(system).toBe(
      sessionMode([
        "Mode: chat",
        "Teach through normal chat. Inline figure rendering is available via render_figure and render_freeform_figure when a diagram will materially improve the explanation. Do not rely on interactive workspace tools.",
      ]),
    )
  })

  test("keeps the registered code-buddy prompt byte-identical", async () => {
    await using project = await tmpdir({ git: true })
    const expected = composeStaticPrompt(BUDDY_BASE_PROMPT, CODE_BUDDY_OVERLAY)

    const agent = await withSyncedOpenCodeConfig(project.path, () => OpenCodeAgent.get("code-buddy"))

    expect(agent).toBeDefined()
    expect(agent?.prompt?.trimEnd()).toBe(expected)
  })

  test("composes code-buddy from the base buddy prompt plus the code overlay", async () => {
    const prompt = composeStaticPrompt(BUDDY_BASE_PROMPT, CODE_BUDDY_OVERLAY)

    expect(prompt).toContain("You are Buddy, a learning companion that helps you learn by doing.")
    expect(prompt).toContain("For coding sessions, act as Buddy in `code-buddy` mode.")
    expect(prompt).toContain("Treat the lesson file shown in <teaching_workspace> as the shared whiteboard for the lesson.")
  })

  test("composes math-buddy from the base buddy prompt plus the math overlay", async () => {
    const prompt = composeStaticPrompt(BUDDY_BASE_PROMPT, MATH_BUDDY_OVERLAY)

    expect(prompt).toContain("Figure trigger policy:")
    expect(prompt).toContain("Figure authoring:")
    expect(prompt).toContain("Constrained figure protocol:")
    expect(prompt).toContain("Freeform figure protocol:")
    expect(prompt).toContain("Figure layout:")
    expect(prompt).toContain("Figure self-check:")
    expect(prompt).toContain("Be proactive about using a figure tool; do not wait for the learner to explicitly ask for a diagram if the explanation depends on layout.")
    expect(prompt).toContain("Default to using `render_figure` when the explanation depends on exact geometry, spatial arrangement, intersections, perpendiculars, similar triangles, area decomposition, or named points and segments.")
    expect(prompt).toContain("Use `render_freeform_figure` when the figure needs arbitrary curves, custom SVG paths, non-standard shapes, or a layout that does not fit the constrained geometry schema.")
    expect(prompt).toContain("Design each figure to communicate one mathematical relationship, construction, or proof step at a time.")
    expect(prompt).toContain("The renderers add a light text halo for readability")
    expect(prompt).toContain("Use `constraints` for relationships that should be exact, especially when a point must lie on a segment, be a perpendicular foot, or be the intersection of two lines.")
    expect(prompt).toContain("Let the backend resolve constrained points instead of hand-placing every derived coordinate manually.")
    expect(prompt).toContain("Use `kind: \"geometry.v1\"` exactly.")
    expect(prompt).toContain("Use `kind: \"svg.v1\"` exactly.")
    expect(prompt).toContain("Use `constraints` when the geometry depends on exact incidence, projection, or intersection.")
    expect(prompt).toContain("Never send empty strings for optional point labels, polygon labels, or captions.")
    expect(prompt).toContain("the UI will show the figure automatically after the tool call, so continue the explanation in normal text.")
    expect(prompt).toContain("Do not paste, rewrite, shorten, or manually reconstruct the returned image markdown or URL.")
    expect(prompt).toContain("Do not alter the returned `figureID` or the `directory` query parameter.")
    expect(prompt).toContain("You may use any valid SVG elements, paths, curves, groups, gradients, masks, markers, or text needed for the figure.")
    expect(prompt).toContain("`render_freeform_figure` only lints for SVG compilation and parse errors; it does not constrain the drawing to the geometry schema.")
    expect(prompt).toContain("Choose coordinates so the main figure occupies a substantial, clearly visible portion of the canvas.")
    expect(prompt).toContain("After a tool error, immediately retry with a corrected figure spec when the diagram is still needed.")
    expect(prompt).toContain("Points that should lie on a segment must lie on that segment.")
    expect(prompt).toContain("If the layout is uncertain, simplify the figure rather than adding more construction.")
    expect(prompt).not.toContain("always draw triangles")
  })
})
