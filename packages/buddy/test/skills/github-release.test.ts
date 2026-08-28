import { describe, expect, test } from "bun:test"
import { ensureGitHubReleaseExists, type GitHubReleaseTarget } from "../../script/github-release"

const TARGET: GitHubReleaseTarget = {
  environment: {},
  notes: "Release notes",
  repository: "example/releases",
  tag: "skill-artifacts",
  title: "Skill Artifacts",
}

function createDependencies(input: {
  createStatus?: number | null
  responseStatuses: readonly number[]
}) {
  const responseStatuses = [...input.responseStatuses]
  let createCount = 0

  return {
    createCount: () => createCount,
    dependencies: {
      createRelease: () => {
        createCount += 1
        return input.createStatus ?? 0
      },
      fetch: async () => {
        const status = responseStatuses.shift()
        if (status === undefined) throw new Error("Unexpected GitHub release query")
        return new Response(null, { status })
      },
    },
  }
}

describe("GitHub release provisioning", () => {
  test("reuses an existing release", async () => {
    const fixture = createDependencies({ responseStatuses: [200] })

    await ensureGitHubReleaseExists(TARGET, fixture.dependencies)

    expect(fixture.createCount()).toBe(0)
  })

  test("creates a release only after an explicit not-found response", async () => {
    const fixture = createDependencies({ responseStatuses: [404] })

    await ensureGitHubReleaseExists(TARGET, fixture.dependencies)

    expect(fixture.createCount()).toBe(1)
  })

  test("preserves GitHub lookup failures instead of attempting creation", async () => {
    const fixture = createDependencies({ responseStatuses: [503] })

    await expect(ensureGitHubReleaseExists(TARGET, fixture.dependencies)).rejects.toThrow("503")
    expect(fixture.createCount()).toBe(0)
  })

  test("accepts a release created concurrently after a not-found response", async () => {
    const fixture = createDependencies({ createStatus: 1, responseStatuses: [404, 200] })

    await ensureGitHubReleaseExists(TARGET, fixture.dependencies)

    expect(fixture.createCount()).toBe(1)
  })

  test("fails when creation fails and the release is still absent", async () => {
    const fixture = createDependencies({ createStatus: 1, responseStatuses: [404, 404] })

    await expect(ensureGitHubReleaseExists(TARGET, fixture.dependencies)).rejects.toThrow(
      "gh exited with status 1",
    )
  })
})
