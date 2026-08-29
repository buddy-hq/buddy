import { describe, expect, test } from "bun:test"
import { assertGithubSourceTagReference, resolveSourceGithubToken } from "./release-source-tag"

const SOURCE_SHA = "1".repeat(40)

describe("release source tag", () => {
  test("accepts only the exact commit reference", () => {
    expect(() =>
      assertGithubSourceTagReference({
        reference: { sha: SOURCE_SHA, type: "commit" },
        repository: "buddy-hq/buddy",
        tag: "v1.2.3",
        target: SOURCE_SHA,
      }),
    ).not.toThrow()
  })

  test("rejects missing, conflicting, and annotated references", () => {
    const input = {
      repository: "buddy-hq/buddy",
      tag: "v1.2.3",
      target: SOURCE_SHA,
    }
    expect(() => assertGithubSourceTagReference({ ...input, reference: undefined })).toThrow(
      "missing",
    )
    expect(() =>
      assertGithubSourceTagReference({
        ...input,
        reference: { sha: "2".repeat(40), type: "commit" },
      }),
    ).toThrow("expected commit")
    expect(() =>
      assertGithubSourceTagReference({
        ...input,
        reference: { sha: SOURCE_SHA, type: "tag" },
      }),
    ).toThrow("expected commit")
  })

  test("uses the dedicated source token before release credentials", () => {
    expect(
      resolveSourceGithubToken({
        BUDDY_SOURCE_GH_TOKEN: "source-token",
        GH_TOKEN: "release-token",
        GITHUB_TOKEN: "workflow-token",
      }),
    ).toBe("source-token")
    expect(resolveSourceGithubToken({ GH_TOKEN: "release-token" })).toBe("release-token")
  })
})
