import type { Context } from "hono"
import { LearnerService } from "../service.js"
import {
  LearnerWorkspacePatchSchema,
  parseArtifactListQuery,
  parseDecisionPlanRequest,
  parseSnapshotQuery,
  readWorkspaceStateFromSession,
} from "../orchestration/http-request.js"
import { zodIssuesResponse } from "../../../http/request-json.js"
import { withDirectoryContext, withJsonBody } from "../../../http/route-helpers.js"

function shouldGenerateDecision(value: unknown) {
  if (!value || typeof value !== "object") return false
  const candidate = value as { generateDecision?: unknown }
  return candidate.generateDecision === true
}

async function learnerSnapshotHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const parsed = parseSnapshotQuery(contextResult.value.requestURL)
  if (!parsed.success) {
    return zodIssuesResponse(parsed.error)
  }

  const snapshot = await LearnerService.getWorkspaceSnapshot({
    directory: contextResult.value.directory,
    query: {
      ...parsed.data,
      workspaceState:
        parsed.data.workspaceState ??
        readWorkspaceStateFromSession({
          directory: contextResult.value.directory,
          sessionId: parsed.data.sessionId,
        }),
    },
  })
  return c.json(snapshot)
}

async function learnerPlanHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const bodyResult = await withJsonBody(c.req.raw, {
    optional: true,
    fallbackBody: {},
  })
  if (!bodyResult.ok) return bodyResult.response
  const allowGenerate = shouldGenerateDecision(bodyResult.value)

  const parsed = parseDecisionPlanRequest({
    requestURL: contextResult.value.requestURL,
    body: bodyResult.value,
  })
  if (!parsed.success) {
    return zodIssuesResponse(parsed.error)
  }

  const decision = await LearnerService.ensurePlanDecision({
    directory: contextResult.value.directory,
    query: {
      ...parsed.data,
      workspaceState:
        parsed.data.workspaceState ??
        readWorkspaceStateFromSession({
          directory: contextResult.value.directory,
          sessionId: parsed.data.sessionId,
        }),
    },
    allowGenerate,
  })
  return c.json(decision)
}

async function learnerArtifactsHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const parsed = parseArtifactListQuery(contextResult.value.requestURL)
  if (!parsed.success) {
    return zodIssuesResponse(parsed.error)
  }

  const artifacts = await LearnerService.listArtifacts({
    directory: contextResult.value.directory,
    kind: parsed.data.kind,
    goalId: parsed.data.goalId,
    status: parsed.data.status,
    includeRaw: parsed.data.includeRaw,
  })

  return c.json({ artifacts })
}

async function learnerWorkspacePatchHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const parsed = LearnerWorkspacePatchSchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return zodIssuesResponse(parsed.error)
  }

  const patched = await LearnerService.patchWorkspace({
    directory: contextResult.value.directory,
    workspace: parsed.data.workspace,
    profile: parsed.data.profile,
  })

  return c.json(patched)
}

export {
  learnerArtifactsHandler,
  learnerPlanHandler,
  learnerSnapshotHandler,
  learnerWorkspacePatchHandler,
}
