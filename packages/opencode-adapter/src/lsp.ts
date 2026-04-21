import * as OpenCodeLSP from "opencode/lsp/lsp"
import { makeRuntime } from "opencode/effect/run-service"

const runtime = makeRuntime(OpenCodeLSP.Service, OpenCodeLSP.defaultLayer)

export namespace LSP {
  export async function init() {
    return runtime.runPromise((svc) => svc.init())
  }

  export async function hasClients(file: string) {
    return runtime.runPromise((svc) => svc.hasClients(file))
  }

  export async function touchFile(file: string, waitForDiagnostics?: boolean) {
    return runtime.runPromise((svc) => svc.touchFile(file, waitForDiagnostics))
  }

  export async function diagnostics() {
    return runtime.runPromise((svc) => svc.diagnostics())
  }
}
