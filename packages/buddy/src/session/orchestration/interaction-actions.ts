import type { Context } from "hono"
import { withConfigSync } from "../../http/route-helpers"
import { runE2EDeterministicCommand, runE2EDeterministicPrompt } from "../../e2e/interactions"
import { isE2EModeEnabled, registerE2EInteraction } from "../../e2e/runtime"
import { createSessionCommandTransform } from "../../learning/agent-execution/transforms/command-transform"
import { createSessionMessageTransform } from "../../learning/agent-execution/transforms/message-transform"
import type { SessionTransformContext } from "../../learning/agent-execution/transforms/types"
import { mapSessionTransformError, runSessionTransformProxy } from "./proxy-transform"

function toJsonRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export async function postSessionPrompt(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "prompt",
  })
  if (!syncResult.ok) return syncResult.response

  const promptFault = registerE2EInteraction("prompt")
  if (promptFault) {
    return c.json({ error: promptFault }, 500)
  }

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
    if (isE2EModeEnabled()) {
      const requestBody = toJsonRecord(await c.req.json())
      if (!requestBody) {
        return c.json({ error: "Invalid prompt payload" }, 400)
      }
      const transformedBody = await promptTransform.onTransform(requestBody)
      const response = await runE2EDeterministicPrompt({
        directory: syncResult.value.directory,
        sessionID,
        transformedBody,
      })
      if (promptTransform.onAccepted) {
        await promptTransform.onAccepted().catch((error) => {
          console.warn("Failed to record learner evidence after accepted prompt:", error)
        })
      }
      return c.json(response)
    }

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
  const syncResult = await withConfigSync(c, {
    operation: "command",
  })
  if (!syncResult.ok) return syncResult.response

  const commandFault = registerE2EInteraction("command")
  if (commandFault) {
    return c.json({ error: commandFault }, 500)
  }

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
    if (isE2EModeEnabled()) {
      const requestBody = toJsonRecord(await c.req.json())
      if (!requestBody) {
        return c.json({ error: "Invalid command payload" }, 400)
      }
      const transformedBody = await commandTransform.onTransform(requestBody)
      const response = await runE2EDeterministicCommand({
        directory: syncResult.value.directory,
        sessionID,
        transformedBody,
      })
      return c.json(response)
    }

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
