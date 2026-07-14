import type { IndigoSemanticFormat } from "./validation"

export type IndigoWorkerRenderRequest = {
  type: "render"
  requestID: string
  source: string
  format: IndigoSemanticFormat
}

export type IndigoWorkerRenderSuccess = {
  type: "rendered"
  requestID: string
  rendererVersion: string
  svg: string
  warnings: string[]
}

export type IndigoWorkerRenderFailure = {
  type: "error"
  requestID: string
  code: "indigo_render_failed" | "indigo_runtime_unavailable" | "invalid_source"
  message: string
}

export type IndigoWorkerRenderResponse =
  | IndigoWorkerRenderSuccess
  | IndigoWorkerRenderFailure
