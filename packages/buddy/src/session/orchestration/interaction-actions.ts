import type { Context } from "hono"
import { withConfigSync } from "../../http/route-helpers.js"
import { createSessionCommandTransform } from "../../learning/runtime/session/orchestration/command-transform.js"
import { createSessionMessageTransform } from "../../learning/runtime/session/orchestration/message-transform.js"
import type { SessionTransformContext } from "../../learning/runtime/session/orchestration/transform-types.js"
import { mapSessionTransformError, runSessionTransformProxy } from "./proxy-transform.js"

export async function postSessionPrompt(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c.req.raw, {
    operation: "prompt",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")

  const transformContext: SessionTransformContext = {
    directory: syncResult.value.directory,
    sessionID,
    request: c.req.raw,
  }
  const promptTransform = createSessionMessageTransform({
    context: transformContext,
  })

  try {
    return await runSessionTransformProxy({
      c,
      targetPath: `/session/${encodeURIComponent(sessionID)}/message`,
      onAccepted: promptTransform.onAccepted,
      rollbackState: promptTransform.rollbackState,
      onTransform: promptTransform.onTransform,
    })
  } catch (error) {
    promptTransform.rollbackState?.()
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}

export async function postSessionCommand(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c.req.raw, {
    operation: "command",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")

  const transformContext: SessionTransformContext = {
    directory: syncResult.value.directory,
    sessionID,
    request: c.req.raw,
  }
  const commandTransform = createSessionCommandTransform({
    context: transformContext,
  })

  try {
    return await runSessionTransformProxy({
      c,
      targetPath: `/session/${encodeURIComponent(sessionID)}/command`,
      rollbackState: commandTransform.rollbackState,
      onTransform: commandTransform.onTransform,
    })
  } catch (error) {
    commandTransform.rollbackState?.()
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}
