export type SessionTransformContext = {
  directory: string
  sessionID: string
  request: Request
}

export type SessionTransform = {
  onTransform: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
  onAccepted?: () => Promise<void>
  rollbackState?: () => void
}
