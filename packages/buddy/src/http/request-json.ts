import type z from "zod"
import { isJsonContentType } from "./http.js"

export function invalidJsonResponse(): Response {
  return Response.json({ error: "Invalid JSON body" }, { status: 400 })
}

export function zodIssuesResponse(error: z.ZodError): Response {
  return Response.json({ error: error.issues.map((issue) => issue.message).join(", ") }, { status: 400 })
}

export async function parseJsonBody(request: Request): Promise<
  | {
      ok: true
      body: unknown
    }
  | {
      ok: false
      response: Response
    }
> {
  try {
    return {
      ok: true,
      body: await request.json(),
    }
  } catch {
    return {
      ok: false,
      response: invalidJsonResponse(),
    }
  }
}

export async function parseOptionalJsonBody(
  request: Request,
  fallbackBody: unknown = {},
): Promise<
  | {
      ok: true
      body: unknown
    }
  | {
      ok: false
      response: Response
    }
> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return { ok: true, body: fallbackBody }
  }

  return parseJsonBody(request)
}
