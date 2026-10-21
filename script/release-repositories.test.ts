import { describe, expect, test } from "bun:test"
import { releaseRepository, repositoryParts, sourceRepository } from "./release-repositories"

describe("release repositories", () => {
  test("defaults source and release repositories independently", () => {
    expect(sourceRepository({})).toBe("buddy-hq/buddy")
    expect(releaseRepository({})).toBe("prashantbhudwal/buddy-releases")
  })

  test("keeps workflow source repository separate from release repository", () => {
    const env = {
      BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
      BUDDY_SOURCE_REPO: "example/source",
      GITHUB_REPOSITORY: "example/current",
    }

    expect(sourceRepository(env)).toBe("example/source")
    expect(releaseRepository(env)).toBe("prashantbhudwal/buddy-releases")
  })

  test("falls back to GitHub repository only for source repository", () => {
    const env = {
      GITHUB_REPOSITORY: "example/source",
    }

    expect(sourceRepository(env)).toBe("example/source")
    expect(releaseRepository(env)).toBe("prashantbhudwal/buddy-releases")
  })

  test("splits valid repository names", () => {
    expect(repositoryParts("owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    })
  })

  test("rejects malformed repository names", () => {
    expect(() => repositoryParts("owner")).toThrow("Invalid GitHub repository")
    expect(() => repositoryParts("owner/repo/extra")).toThrow("Invalid GitHub repository")
  })
})

describe("distribution release repositories", () => {
  test("selects beta independently of the source repository", () => {
    expect(releaseRepository({ BUDDY_CHANNEL: "beta", GITHUB_REPOSITORY: "buddy-hq/buddy" })).toBe(
      "prashantbhudwal/buddy-releases",
    )
  })

  test.each(["BUDDY_RELEASE_REPO", "GH_REPO"])(
    "rejects unrelated and obsolete %s overrides",
    (key) => {
      expect(() =>
        releaseRepository({ BUDDY_CHANNEL: "beta", [key]: "prashantbhudwal/buddy-beta-releases" }),
      ).toThrow("conflicts with beta")
      expect(() => releaseRepository({ [key]: "prashantbhudwal/buddy-beta-releases" })).toThrow(
        "conflicts with prod",
      )
      expect(() => releaseRepository({ [key]: "example/releases" })).toThrow(
        "expected prashantbhudwal/buddy-releases",
      )
    },
  )

  test("checks both overrides, including a shadowed conflicting value", () => {
    expect(() =>
      releaseRepository({
        BUDDY_CHANNEL: "beta",
        BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-beta-releases",
        GH_REPO: "prashantbhudwal/buddy-releases",
      }),
    ).toThrow("conflicts with beta")
  })

  test.each(["dev", "preview", "betaa"])("rejects unpublishable channel %s", (channel) => {
    expect(() => releaseRepository({ BUDDY_CHANNEL: channel })).toThrow("must be prod or beta")
  })
})
