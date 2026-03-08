import type { Context } from "hono"
import { isJsonContentType, parseJsonText } from "../../shared/http.js"
import {
  resolveBodyRegistrationFlags,
  resolveInitialRegistrationFlags,
} from "./registration.js"
import type { ProxyRegistrationFlags, ProxyToOpenCodeInput } from "./types.js"

type PrepareProxyBodyResult =
  | {
      ok: true
      body: BodyInit | undefined
      registrationFlags: ProxyRegistrationFlags
      method: string
      headers: Headers
    }
  | {
      ok: false
      response: Response
    }

async function prepareProxyBody(
  c: Context,
  input: ProxyToOpenCodeInput,
): Promise<PrepareProxyBodyResult> {
  const method = c.req.method.toUpperCase()
  const headers = new Headers(c.req.raw.headers)
  let body: BodyInit | undefined
  let registrationFlags = resolveInitialRegistrationFlags(input)

  if (method !== "GET" && method !== "HEAD") {
    if (input.transformJsonBody) {
      const contentType = headers.get("content-type")
      if (isJsonContentType(contentType)) {
        const raw = await c.req.raw.text()
        const parsedResult = raw.trim().length > 0 ? parseJsonText(raw) : { ok: true as const, value: {} as unknown }
        if (!parsedResult.ok || !parsedResult.value || typeof parsedResult.value !== "object" || Array.isArray(parsedResult.value)) {
          return {
            ok: false,
            response: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
          }
        }

        const parsed = parsedResult.value as Record<string, unknown>
        const transformed = await input.transformJsonBody(parsed)
        registrationFlags = resolveBodyRegistrationFlags(transformed, input)
        body = JSON.stringify(transformed)
      } else {
        body = await c.req.raw.arrayBuffer()
      }
    } else {
      const buffer = await c.req.raw.arrayBuffer()
      body = buffer.byteLength > 0 ? buffer : undefined
    }
  }

  return {
    ok: true,
    body,
    registrationFlags,
    method,
    headers,
  }
}

export { prepareProxyBody }
