import * as OpenCodeLSP from "opencode/lsp/lsp"
import { AppNodeBuilderV1 } from "opencode/effect/app-node-builder-v1"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"

const runtime = makeRuntime(OpenCodeLSP.Service, AppNodeBuilderV1.build(OpenCodeLSP.node))

export namespace LSP {
  export async function init() {
    return runtime.runPromise((svc) => withCurrentInstance(svc.init()))
  }

  export async function hasClients(file: string) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.hasClients(file)))
  }

  export async function touchFile(file: string, waitForDiagnostics?: boolean) {
    const diagnosticsMode = waitForDiagnostics ? "full" : undefined
    return runtime.runPromise((svc) => withCurrentInstance(svc.touchFile(file, diagnosticsMode)))
  }

  export async function diagnostics() {
    return runtime.runPromise((svc) => withCurrentInstance(svc.diagnostics()))
  }
}
