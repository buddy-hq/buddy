import { describe, expect, test } from "bun:test"
import { shouldCloseSelectedQuestionSet } from "../src/components/question-set/question-set-sidebar-state"

describe("shouldCloseSelectedQuestionSet", () => {
  test("only closes when the active question set is clicked again", () => {
    expect(
      shouldCloseSelectedQuestionSet({
        rightSidebarOpen: true,
        rightSidebarTab: "question-set",
        selectedObjectID: "object-1",
        objectID: "object-1",
      }),
    ).toBe(true)

    expect(
      shouldCloseSelectedQuestionSet({
        rightSidebarOpen: false,
        rightSidebarTab: "question-set",
        selectedObjectID: "object-1",
        objectID: "object-1",
      }),
    ).toBe(false)

    expect(
      shouldCloseSelectedQuestionSet({
        rightSidebarOpen: true,
        rightSidebarTab: "curriculum",
        selectedObjectID: "object-1",
        objectID: "object-1",
      }),
    ).toBe(false)
  })
})
