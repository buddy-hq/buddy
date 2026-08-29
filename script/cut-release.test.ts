import { describe, expect, test } from "bun:test"
import { resolveReleaseExecution, selectWorkflowRunUrls, type WorkflowRun } from "./cut-release"
import { parseReleasePlan } from "./release/plan"

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
