import { describe, expect, test } from "bun:test"
import { shouldCloseSelectedQuestionSet } from "../src/components/question-set/question-set-sidebar-state"
import { QUESTION_SET_SIDEBAR_TAB } from "../src/components/question-set/question-set-sidebar-state"

describe("shouldCloseSelectedQuestionSet", () => {
  test("only closes when the active question set is clicked again", () => {
    expect(
      shouldCloseSelectedQuestionSet({
        rightSidebarOpen: true,
        rightSidebarTab: "question-set",
        selectedArtifactID: "artifact-1",
        artifactID: "artifact-1",
      }),
    ).toBe(true)

    expect(
      shouldCloseSelectedQuestionSet({
        rightSidebarOpen: false,
        rightSidebarTab: "question-set",
        selectedArtifactID: "artifact-1",
        artifactID: "artifact-1",
      }),
    ).toBe(false)

    expect(
      shouldCloseSelectedQuestionSet({
        rightSidebarOpen: true,
        rightSidebarTab: "curriculum",
        selectedArtifactID: "artifact-1",
        artifactID: "artifact-1",
      }),
    ).toBe(false)
  })

  test("treats question-set as a special tab value", () => {
    expect(QUESTION_SET_SIDEBAR_TAB).toBe("question-set")
  })
})
