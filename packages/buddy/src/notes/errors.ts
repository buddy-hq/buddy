export class NotesError extends Error {
  readonly status: 400 | 404 | 409

  constructor(status: 400 | 404 | 409, message: string) {
    super(message)
    this.name = "NotesError"
    this.status = status
  }
}

export function mapNotesError(error: Error) {
  if (!(error instanceof NotesError)) return undefined
  return Response.json({ error: error.message }, { status: error.status })
}
