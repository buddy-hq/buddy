import { describe, expect, test } from "bun:test"
import { resolveReleaseExecution, selectWorkflowRunUrls, parseReleaseWizardArgs, type WorkflowRun } from "./cut-release"
import { parseReleasePlan } from "./release/plan"
import { assertReleaseBranch, releaseDistribution } from "./release/distribution-guard"

const CURRENT_SOURCE_SHA = "1".repeat(40)
const PLANNED_SOURCE_SHA = "2".repeat(40)

function plannedRelease() {
  return parseReleasePlan({
    advancedMathInputSha256: "3".repeat(64),
    advancedMathVersion: "runtime-42",
    createdBy: {
      repository: "buddy-hq/buddy",
      runAttempt: "1",
      runId: "123",
      workflow: "publish",
    },
    releaseDate: "2026-08-29T10:00:00+00:00",
    schemaVersion: 1,
    sourceRepository: "buddy-hq/buddy",
    sourceSha: PLANNED_SOURCE_SHA,
    tag: "v1.2.3",
    targets: { macosArm64: true, macosX64: false, windowsX64: true },
    toolchain: {
      bun: "1.3.13",
      python: "3.12",
      runners: {
        macosArm64: "macos-26",
        macosX64: "macos-26-intel",
        windowsX64: "windows-2025-vs2026",
      },
    },
    version: "1.2.3",
  })
}

describe("cut release", () => {
  test.each([
    ["prod", "main", "beta", "Preview release candidates"],
    ["beta", "beta", "main", "Beta releases"],
  ] as const)("requires the %s source branch", (channel, branch, otherBranch, label) => {
    const flags = parseReleaseWizardArgs(channel === "prod" ? [] : ["--channel", channel])
    const distribution = releaseDistribution({ BUDDY_CHANNEL: flags.channel })
    expect(distribution.releaseBranch).toBe(branch)
    expect(() => assertReleaseBranch(branch, distribution)).not.toThrow()
    expect(() => assertReleaseBranch(otherBranch, distribution)).toThrow(
      `${label} must be cut from ${branch}, received '${otherBranch}'`,
    )
    expect(() => assertReleaseBranch("", distribution)).toThrow(
      `${label} must be cut from ${branch}, received ''`,
    )
  })

  test("prefers the exact dispatched release run over an older fallback", () => {
    const run = (displayTitle: string, url: string): WorkflowRun => ({
      createdAt: "2026-08-29T10:00:00Z",
      displayTitle,
      event: "workflow_dispatch",
      headBranch: "main",
      headSha: CURRENT_SOURCE_SHA,
      url,
    })
    expect(
      selectWorkflowRunUrls([run("preview candidate v1.2.2", "https://example.test/old")], "1.2.3"),
    ).toEqual({ exact: undefined, fallback: "https://example.test/old" })
    expect(
      selectWorkflowRunUrls(
        [
          run("preview candidate v1.2.3", "https://example.test/exact"),
          run("preview candidate v1.2.2", "https://example.test/old"),
        ],
        "1.2.3",
      ),
    ).toEqual({
      exact: "https://example.test/exact",
      fallback: "https://example.test/exact",
    })
  })

  test("resumes a planned draft from its pinned source and targets", () => {
    expect(
      resolveReleaseExecution({
        currentSourceSha: CURRENT_SOURCE_SHA,
        plan: plannedRelease(),
        repository: "buddy-hq/buddy",
        requestedTargets: { macosArm64: false, macosX64: true, windowsX64: false },
        tag: "v1.2.3",
        version: "1.2.3",
      }),
    ).toEqual({
      sourceSha: PLANNED_SOURCE_SHA,
      targets: { macosArm64: true, macosX64: false, windowsX64: true },
    })
  })

  test("rejects a plan from another release identity", () => {
    expect(() =>
      resolveReleaseExecution({
        currentSourceSha: CURRENT_SOURCE_SHA,
        plan: plannedRelease(),
        repository: "buddy-hq/buddy",
        requestedTargets: { macosArm64: true, macosX64: true, windowsX64: true },
        tag: "v1.2.4",
        version: "1.2.4",
      }),
    ).toThrow("identity does not match")
  })
})


describe("Beta release wizard", () => {
  test("defaults to prod and accepts explicit Beta targets", () => {
    expect(parseReleaseWizardArgs([]).channel).toBe("prod")
    expect(parseReleaseWizardArgs(["--channel", "beta", "--targets", "all", "--fs"])).toEqual({
      channel: "beta", fast: true, help: false, skipLocalReleaseGates: true,
      targets: { macosArm64: true, macosX64: true, windowsX64: true },
    })
    expect(parseReleaseWizardArgs(["--channel=beta"]).channel).toBe("beta")
    expect(() => parseReleaseWizardArgs(["--channel", "dev"])).toThrow("must be prod or beta")
    expect(() => parseReleaseWizardArgs(["--channel"])).toThrow("must be prod or beta")
  })

  test("selects the Beta workflow run title on beta", () => {
    const run: WorkflowRun = {
      createdAt: "2026-08-29T10:00:00Z", displayTitle: "beta release v0.1.0",
      event: "workflow_dispatch", headBranch: "beta", headSha: CURRENT_SOURCE_SHA, url: "https://example.test/beta",
    }
    expect(selectWorkflowRunUrls([run], "0.1.0", "beta").exact).toBe(run.url)
    expect(selectWorkflowRunUrls([run], "0.1.0", "prod").exact).toBeUndefined()
  })

  test.each(["prod", "beta"] as const)("matches %s exact and fallback runs only on its source branch", (channel) => {
    const branch = channel === "beta" ? "beta" : "main"
    const title = channel === "beta" ? "beta release" : "preview candidate"
    const run: WorkflowRun = {
      createdAt: "2026-08-29T10:00:00Z",
      displayTitle: `${title} v0.1.0`,
      event: "workflow_dispatch",
      headBranch: branch,
      headSha: CURRENT_SOURCE_SHA,
      url: "https://example.test/exact",
    }
    const unrelated = [
      { ...run, headBranch: channel === "beta" ? "main" : "beta" },
      { ...run, event: "push" },
      { ...run, headBranch: "feature" },
    ]
    expect(selectWorkflowRunUrls(unrelated, "0.1.0", channel)).toEqual({
      exact: undefined,
      fallback: undefined,
    })
    const fallback = { ...run, displayTitle: `${title} v0.0.9`, url: "https://example.test/fallback" }
    expect(selectWorkflowRunUrls([...unrelated, fallback], "0.1.0", channel)).toEqual({
      exact: undefined,
      fallback: fallback.url,
    })
    expect(selectWorkflowRunUrls([...unrelated, fallback, run], "0.1.0", channel)).toEqual({
      exact: run.url,
      fallback: fallback.url,
    })
  })

  test("rejects a prod plan when resuming Beta", () => {
    expect(() => resolveReleaseExecution({
      channel: "beta", currentSourceSha: CURRENT_SOURCE_SHA, plan: plannedRelease(),
      repository: "buddy-hq/buddy", requestedTargets: { macosArm64: true, macosX64: true, windowsX64: true },
      tag: "v1.2.3", version: "1.2.3",
    })).toThrow("channel prod conflicts with beta")
  })
})
