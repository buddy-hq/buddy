import { describe, expect, test } from "bun:test"
import {
  consumeCitationCommentRequest,
  requestCitationComment,
  type CitationCommentSource,
} from "@/lib/citations/comment-request"

const source: CitationCommentSource = {
  getBoundingClientRect: () => new DOMRect(0, 0, 10, 10),
  contextElement: new DOMParser().parseFromString("<p></p>", "text/html").body,
  mark: () => () => {},
}

describe("citation comment request", () => {
  test("opens the comment editor once, only for the requested citation", () => {
    requestCitationComment("cite_a", source)
    expect(consumeCitationCommentRequest("cite_b")).toBeUndefined()
    expect(consumeCitationCommentRequest("cite_a")).toEqual({ source })
    expect(consumeCitationCommentRequest("cite_a")).toBeUndefined()
  })

  test("a newer cite replaces an unclaimed request", () => {
    requestCitationComment("cite_a", source)
    requestCitationComment("cite_b")
    expect(consumeCitationCommentRequest("cite_a")).toBeUndefined()
    expect(consumeCitationCommentRequest("cite_b")).toEqual({ source: undefined })
  })
})
