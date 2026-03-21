import type z from "zod"

export function invalidJsonResponse(): Response {
  return Response.json({ error: "Invalid JSON body" }, { status: 400 })
}

export function zodIssuesResponse(error: z.ZodError): Response {
  return Response.json(
    { error: error.issues.map((issue) => issue.message).join(", ") },
    { status: 400 },
  )
}
