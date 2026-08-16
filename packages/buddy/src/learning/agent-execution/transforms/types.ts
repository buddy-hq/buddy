import type { TJsonObject } from "../../prompt/utils"

export type SessionTransformContext = {
  directory: string
  sessionID: string
  request: Request
}

export type SessionTransform = {
  onTransform: (body: TJsonObject) => Promise<TJsonObject>
  onAccepted?: () => Promise<void>
  rollbackState?: () => void
}
