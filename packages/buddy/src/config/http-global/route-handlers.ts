import type { Context } from "hono"
import { configErrorMessage, isConfigValidationError } from "../compatibility.js"
import { Config } from "../config.js"
import { configRouteValidationResponse } from "../orchestration/config-operations.js"
import { withJsonBody } from "../../http/route-helpers.js"
import { proxyToOpenCode } from "../../http/proxy.js"

async function getGlobalConfigHandler(c: Context): Promise<Response> {
  try {
    const config = await Config.getGlobal()
    return c.json(config)
  } catch (error) {
    if (isConfigValidationError(error)) {
      return c.json({ error: configErrorMessage(error) }, 400)
    }
    throw error
  }
}

async function patchGlobalConfigHandler(c: Context): Promise<Response> {
  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  try {
    const parsed = Config.Info.parse(bodyResult.value)
    const config = await Config.updateGlobal(parsed)
    return c.json(config)
  } catch (error) {
    if (isConfigValidationError(error)) {
      return c.json({ error: configErrorMessage(error) }, 400)
    }
    const validationResponse = configRouteValidationResponse(error)
    if (validationResponse) return validationResponse
    throw error
  }
}

async function disposeGlobalHandler(c: Context): Promise<Response> {
  return proxyToOpenCode(c, {
    targetPath: "/global/dispose",
  })
}

export {
  disposeGlobalHandler,
  getGlobalConfigHandler,
  patchGlobalConfigHandler,
}
