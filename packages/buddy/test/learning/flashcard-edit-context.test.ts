import { afterEach, describe, expect, test } from "bun:test"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import {
  clearBenchContextRegistry,
  publishSequencedBenchContext,
} from "../../src/learning/features/bench/context"
import { FLASHCARD_AUTHOR_AGENT } from "../../src/learning/features/flashcards/subagents/flashcard-author"
import { QUESTION_SET_AUTHOR_AGENT } from "../../src/learning/features/question-sets/subagents/question-set-author"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { tmpdir } from "../helpers/tmpdir"

const SESSION_ID = "ses_flashcard_edit_context"
const OBJECT_ID = "01KG1A0KH77HJ9QGAQ5QK0N4BD"
const QUESTION_SET_OBJECT_ID = "01KG1A0KH77HJ9QGAQ5QK0N4BE"
const QUESTION_SET_REVISION_ID = "01KG1A0KH77HJ9QGAQ5QK0N4BF"
const FLASHCARD_TAB_KEY = `object:flashcard-deck:${OBJECT_ID}:review`
const QUESTION_SET_TAB_KEY = `object:question-set:${QUESTION_SET_OBJECT_ID}:practice`

function readSyntheticReminderText(parts: unknown): string {
  if (!Array.isArray(parts)) throw new Error("Expected transformed prompt parts")
  const reminder = parts.find(
    (part) =>
      typeof part === "object" &&
      part !== null &&
      "synthetic" in part &&
      part.synthetic === true &&
      "text" in part &&
      typeof part.text === "string",
  )
  if (
    typeof reminder !== "object" ||
    reminder === null ||
    !("text" in reminder) ||
    typeof reminder.text !== "string"
  ) {
    throw new Error("Expected a synthetic Bench reminder")
  }
  return reminder.text
}

afterEach(() => {
  clearBenchContextRegistry()
})

describe("flashcard edit context", () => {
  test("gives the main agent the absolute state file and content-only edit boundary", async () => {
    await using project = await tmpdir({ git: true })
    const projectConfig = await readProjectConfig(project.path)
    const editPath = `${project.path}/.buddy/objects/v1/flashcard-deck/${OBJECT_ID}/state/deck.json`

    publishSequencedBenchContext({
      directory: project.path,
      sessionID: SESSION_ID,
      body: {
        lease: {
          instanceID: "instance-flashcard-edit",
          generation: 1,
          leaseEpoch: 1,
        },
        publicationSequence: 1,
        idempotencyKey: "flashcard-edit-context-1",
        value: {
          status: "open",
          visibility: "visible",
          mode: "docked",
          selectedTabKey: FLASHCARD_TAB_KEY,
          tabs: [
            {
              tabKey: FLASHCARD_TAB_KEY,
              title: "Biology Review",
              target: {
                type: "object",
                ref: {
                  kind: "flashcard-deck",
                  objectID: OBJECT_ID,
                  revisionID: null,
                  itemID: null,
                },
                viewID: "review",
              },
            },
          ],
          targetKey: "flashcard-edit-target",
          target: {
            type: "object",
            title: "Biology Review",
            workspaceRoot: project.path,
            ref: {
              kind: "flashcard-deck",
              objectID: OBJECT_ID,
              revisionID: null,
              itemID: null,
            },
            viewID: "review",
            route: "/bench/flashcards",
            status: "ready",
          },
          drawer: null,
          metadata: [
            `edit_path: ${editPath}`,
            "deck_mode: deck",
            "review_phase: card",
            "revealed: false",
            "cards_reviewed: 0",
            "standing: due",
          ],
          content: "Flashcard deck open on Bench: Biology Review",
          refs: [
            {
              kind: "file",
              value: editPath,
              note: "Authoritative flashcard deck state for minor text edits.",
            },
          ],
          hints: [],
        },
      },
    })

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: SESSION_ID,
      },
      body: {
        content: "Change a typo in the third card",
        persona: "buddy",
      },
      projectConfig,
    })
    const reminderText = readSyntheticReminderText(result.transformed.parts)

    expect(reminderText).toContain(`- edit_path: ${editPath}`)
    expect(reminderText).toContain("edit only notes[].fields text at edit_path")
    expect(reminderText).toContain("Preserve IDs, cards, configuration")
    expect(reminderText).toContain("Use the flashcard-author flow for structural")
    expect(reminderText).not.toContain("/revisions/")
  })

  test("requires the flashcard author handoff to return only the absolute mutable state path", () => {
    expect(FLASHCARD_AUTHOR_AGENT.prompt).toContain('"edit_path"')
    expect(FLASHCARD_AUTHOR_AGENT.prompt).toContain(
      "actual, fully resolved OS path to the mutable state file",
    )
    expect(FLASHCARD_AUTHOR_AGENT.prompt).toContain(
      "Never return `.buddy/...`, a workspace-relative",
    )
    expect(FLASHCARD_AUTHOR_AGENT.prompt).toContain("a path under `revisions/`")
    expect(FLASHCARD_AUTHOR_AGENT.prompt).toContain(
      "edit only notes[].fields text at edit_path without delegating",
    )
  })

  test("gives the main agent the absolute current question-set payload and content boundary", async () => {
    await using project = await tmpdir({ git: true })
    const projectConfig = await readProjectConfig(project.path)
    const editPath = `${project.path}/.buddy/objects/v1/question-set/${QUESTION_SET_OBJECT_ID}/revisions/${QUESTION_SET_REVISION_ID}/question-set.json`

    publishSequencedBenchContext({
      directory: project.path,
      sessionID: SESSION_ID,
      body: {
        lease: {
          instanceID: "instance-question-set-edit",
          generation: 1,
          leaseEpoch: 1,
        },
        publicationSequence: 1,
        idempotencyKey: "question-set-edit-context-1",
        value: {
          status: "open",
          visibility: "visible",
          mode: "docked",
          selectedTabKey: QUESTION_SET_TAB_KEY,
          tabs: [
            {
              tabKey: QUESTION_SET_TAB_KEY,
              title: "Biology Quiz",
              target: {
                type: "object",
                ref: {
                  kind: "question-set",
                  objectID: QUESTION_SET_OBJECT_ID,
                  revisionID: QUESTION_SET_REVISION_ID,
                  itemID: null,
                },
                viewID: "practice",
              },
            },
          ],
          targetKey: "question-set-edit-target",
          target: {
            type: "object",
            title: "Biology Quiz",
            workspaceRoot: project.path,
            ref: {
              kind: "question-set",
              objectID: QUESTION_SET_OBJECT_ID,
              revisionID: QUESTION_SET_REVISION_ID,
              itemID: null,
            },
            viewID: "practice",
            route: "/bench/question-sets",
            status: "ready",
          },
          drawer: null,
          metadata: [
            `edit_path: ${editPath}`,
            "group_type: quiz",
            "question_count: 10",
            "view_mode: wizard",
            "current_step: 1",
            "result_state: not-submitted",
          ],
          content: "Question set: Biology Quiz",
          refs: [
            {
              kind: "file",
              value: editPath,
              note: "Authoritative question-set payload for minor text edits.",
            },
          ],
          hints: [],
        },
      },
    })

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: SESSION_ID,
      },
      body: {
        content: "Fix the wording of the visible question",
        persona: "buddy",
      },
      projectConfig,
    })
    const reminderText = readSyntheticReminderText(result.transformed.parts)

    expect(reminderText).toContain(`- edit_path: ${editPath}`)
    expect(reminderText).toContain("questions[].payload.choices[].content")
    expect(reminderText).toContain("Preserve object, revision, question, and choice IDs")
    expect(reminderText).toContain("Do not change object.json or create or repoint revisions")
  })

  test("requires the question-set author handoff to return the concrete revision path", () => {
    expect(QUESTION_SET_AUTHOR_AGENT.prompt).toContain('"edit_path"')
    expect(QUESTION_SET_AUTHOR_AGENT.prompt).toContain(
      "actual, fully resolved OS path to the saved current-revision payload",
    )
    expect(QUESTION_SET_AUTHOR_AGENT.prompt).toContain(
      "Never return `.buddy/...`, a workspace-relative path",
    )
    expect(QUESTION_SET_AUTHOR_AGENT.prompt).toContain("questions[].payload.choices[].content")
    expect(QUESTION_SET_AUTHOR_AGENT.prompt).toContain(
      "Do not change object.json or create or repoint revisions",
    )
  })
})
