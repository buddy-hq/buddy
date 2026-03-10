import { readProjectConfig } from "@buddy/backend/config/runtime"
import { assertSessionExistsInDirectory } from "../../../session"
import { syncBuddyRuntimeSessionPermissions } from "../permissions/runtime-session-permissions"
import { readTeachingSessionState, writeTeachingSessionState } from "../state/session-state"
import { restoreTeachingSessionState, writeLastLlmOutbound } from "../state/transform-state"
import type { SessionTransformContext } from "./types"
import { runMessagePromptPipeline } from "../../prompt/message-prompt-pipeline"

export type SessionMessageTransformOrchestrationResult = {
  transformed: Record<string, unknown>
  rollbackState?: () => void
}

export async function orchestrateSessionMessageTransform(input: {
  context: SessionTransformContext
  body: Record<string, unknown>
}): Promise<SessionMessageTransformOrchestrationResult> {
  const projectConfig = await readProjectConfig(input.context.directory)
  const previousState = readTeachingSessionState(input.context.directory, input.context.sessionID)

  const pipelineResult = await runMessagePromptPipeline({
    context: {
      directory: input.context.directory,
      sessionID: input.context.sessionID,
    },
    body: input.body,
    projectConfig,
    previousState,
  })

  await assertSessionExistsInDirectory({
    directory: input.context.directory,
    sessionID: input.context.sessionID,
    request: input.context.request,
  })

  let rollbackTeachingState: (() => void) | undefined
  if (pipelineResult.nextTeachingState) {
    rollbackTeachingState = () =>
      restoreTeachingSessionState({
        directory: input.context.directory,
        sessionID: input.context.sessionID,
        previousState,
      })
    writeTeachingSessionState(input.context.directory, pipelineResult.nextTeachingState)
  }

  await syncBuddyRuntimeSessionPermissions({
    directory: input.context.directory,
    sessionID: input.context.sessionID,
    runtimeProfile: pipelineResult.runtimeProfileForPermissions,
  })

  writeLastLlmOutbound({
    directory: input.context.directory,
    sessionID: input.context.sessionID,
    kind: "message",
    payload: pipelineResult.transformed,
  })

  return {
    transformed: pipelineResult.transformed,
    rollbackState: rollbackTeachingState,
  }
}
