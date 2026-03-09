import type { Context } from "hono"
import { withConfigSync } from "../../http"
import { createSessionCommandTransform } from "../../learning/agent-execution"
import { createSessionMessageTransform } from "../../learning/agent-execution"
import type { SessionTransformContext } from "../../learning/agent-execution"
import { mapSessionTransformError, runSessionTransformProxy } from "./proxy-transform"

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
