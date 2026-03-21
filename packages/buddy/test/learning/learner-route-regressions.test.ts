import { describe, expect, test } from 'bun:test'
import { app } from '../../src/index.ts'
import { LearnerService } from '../../src/learning/learner-model'
import { writeTeachingSessionState } from '../../src/learning/agent-execution/state/session-state'
import { tmpdir } from '../helpers/tmpdir'

describe('learner route regressions', () => {
  test('uses the session workspace state when building snapshot fingerprints', async () => {
    await using project = await tmpdir({ git: true })

    writeTeachingSessionState(project.path, {
      sessionId: 'ses_interactive',
      persona: 'code-buddy',
      intent: 'practice',
      currentSurface: 'editor',
      workspaceState: 'interactive',
      focusGoalIds: [],
    })

    const chatResponse = await app.request(
      '/api/learner/snapshot?persona=code-buddy&intent=practice',
      {
        headers: {
          'x-buddy-directory': project.path,
        },
      },
    )
    expect(chatResponse.status).toBe(200)
    const chatBody = (await chatResponse.json()) as {
      decisionInputFingerprint: string
      activityBundles?: unknown
    }
    expect(chatBody.activityBundles).toBeUndefined()
    expect(chatBody.decisionInputFingerprint).toContain('workspaceState:chat')

    const interactiveResponse = await app.request(
      '/api/learner/snapshot?persona=code-buddy&intent=practice&sessionId=ses_interactive',
      {
        headers: {
          'x-buddy-directory': project.path,
        },
      },
    )
    expect(interactiveResponse.status).toBe(200)
    const interactiveBody = (await interactiveResponse.json()) as {
      decisionInputFingerprint: string
      activityBundles?: unknown
    }
    expect(interactiveBody.activityBundles).toBeUndefined()
    expect(interactiveBody.decisionInputFingerprint).toContain('workspaceState:interactive')
  })

  test('scopes artifacts to the requested workspace', async () => {
    await using projectA = await tmpdir({ git: true })
    await using projectB = await tmpdir({ git: true, preserveLearnerStore: true })

    const committedA = await LearnerService.replaceGoalSet({
      directory: projectA.path,
      scope: 'topic',
      contextLabel: 'Closures',
      learnerRequest: 'I want to understand closures.',
      goals: [
        {
          statement: 'At the end of this topic, you will be able to explain closure capture.',
          actionVerb: 'explain',
          task: 'Explain closure capture.',
          cognitiveLevel: 'Comprehension',
          howToTest: 'Describe what a closure captures in a few examples.',
        },
      ],
    })
    const committedB = await LearnerService.replaceGoalSet({
      directory: projectB.path,
      scope: 'topic',
      contextLabel: 'Pointers',
      learnerRequest: 'I want to understand pointer basics.',
      goals: [
        {
          statement: 'At the end of this topic, you will be able to explain pointer indirection.',
          actionVerb: 'explain',
          task: 'Explain pointer indirection.',
          cognitiveLevel: 'Comprehension',
          howToTest: 'Walk through a pointer example and explain what each level references.',
        },
      ],
    })

    await LearnerService.recordAssessmentEvent({
      directory: projectA.path,
      goalIds: committedA.goalIds,
      format: 'concept-check',
      summary: 'Explained closure capture correctly.',
      result: 'demonstrated',
      sessionId: 'ses_a',
    })
    await LearnerService.recordAssessmentEvent({
      directory: projectB.path,
      goalIds: committedB.goalIds,
      format: 'concept-check',
      summary: 'Explained pointer indirection correctly.',
      result: 'demonstrated',
      sessionId: 'ses_b',
    })

    const artifactsResponse = await app.request('/api/learner/artifacts?kind=assessment', {
      headers: {
        'x-buddy-directory': projectA.path,
      },
    })
    expect(artifactsResponse.status).toBe(200)
    const artifactsBody = (await artifactsResponse.json()) as {
      artifacts: Array<{ goalIds: string[] }>
    }

    const allGoalIds = artifactsBody.artifacts.flatMap((artifact) => artifact.goalIds)
    expect(allGoalIds).toContain(committedA.goalIds[0]!)
    expect(allGoalIds).not.toContain(committedB.goalIds[0]!)
  })
})
