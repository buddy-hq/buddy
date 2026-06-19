import { describe, expect, test } from "bun:test"
import { releaseRepository, repositoryParts, sourceRepository } from "./release-repositories"

describe("release repositories", () => {
  test("defaults source and release repositories independently", () => {
    expect(sourceRepository({})).toBe("prashantbhudwal/buddy")
    expect(releaseRepository({})).toBe("prashantbhudwal/buddy-releases")
  })

  test("keeps workflow source repository separate from release repository", () => {
    const env = {
      BUDDY_RELEASE_REPO: "example/releases",
      BUDDY_SOURCE_REPO: "example/source",
      GITHUB_REPOSITORY: "example/current",
    }

    expect(sourceRepository(env)).toBe("example/source")
    expect(releaseRepository(env)).toBe("example/releases")
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
