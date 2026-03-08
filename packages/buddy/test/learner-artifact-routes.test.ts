import { describe, expect, test } from "bun:test"
import { app } from "../src/index.js"
import { LearnerService } from "../src/learning/learner/service.js"
import { tmpdir } from "./fixture/fixture"

describe("learner artifact routes", () => {
  test("serves snapshot, plan, artifacts, and workspace endpoints", async () => {
    await using project = await tmpdir({ git: true })

    const committed = await LearnerService.replaceGoalSet({
      directory: project.path,
      scope: "topic",
      contextLabel: "Type narrowing",
      learnerRequest: "Learn to narrow unknown values safely.",
      goals: [
        {
          statement: "At the end of this topic, you will be able to narrow unknown values with guards.",
          actionVerb: "narrow",
          task: "Narrow unknown values with guards.",
          cognitiveLevel: "Application",
          howToTest: "Implement and run guard-based narrowing across mixed inputs.",
        },
      ],
    })

    await LearnerService.recordPracticeEvent({
      directory: project.path,
      goalIds: committed.goalIds,
      learnerResponseSummary: "Could narrow strings and numbers, but array checks were inconsistent.",
      outcome: "partial",
      sessionId: "ses_snapshot",
    })

    const snapshotResponse = await app.request("/api/learner/snapshot?persona=code-buddy&intent=practice", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })
    expect(snapshotResponse.status).toBe(200)
    const snapshotBody = (await snapshotResponse.json()) as {
      markdown: string
      goals: Array<{ id: string }>
    }
    expect(snapshotBody.markdown).toContain("# Learning Snapshot")
    expect(snapshotBody.goals.map((goal) => goal.id)).toContain(committed.goalIds[0]!)

    const planResponse = await app.request("/api/learner/plan?persona=code-buddy&intent=practice", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    })
    expect(planResponse.status).toBe(200)
    const planBody = (await planResponse.json()) as {
      plan: {
        suggestedActivity: string
      }
      snapshot: {
        markdown: string
      }
    }
    expect(planBody.plan.suggestedActivity.length).toBeGreaterThan(0)
    expect(planBody.snapshot.markdown).toContain("# Learning Snapshot")

    const artifactsResponse = await app.request("/api/learner/artifacts?kind=goal", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })
    expect(artifactsResponse.status).toBe(200)
    const artifactsBody = (await artifactsResponse.json()) as {
      artifacts: Array<{ id: string; kind: string }>
    }
    expect(artifactsBody.artifacts.some((record) => record.kind === "goal")).toBe(true)

    const workspacePatchResponse = await app.request("/api/learner/workspace", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspace: {
          motivationContext: "Ship one robust narrowing utility this sprint",
        },
        profile: {
          motivationAnchors: ["Use this in the real project"],
        },
      }),
    })
    expect(workspacePatchResponse.status).toBe(200)
    const workspacePatchBody = (await workspacePatchResponse.json()) as {
      workspace: {
        motivationContext?: string
      }
      profile: {
        motivationAnchors: string[]
      }
    }
    expect(workspacePatchBody.workspace.motivationContext).toContain("narrowing utility")
    expect(workspacePatchBody.profile.motivationAnchors).toContain("Use this in the real project")
  })
})
