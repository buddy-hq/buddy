import type { TeachingDiagnostic, TeachingWorkspaceRecord } from "../model/types"

export async function readActiveDiagnostics(
  _directory: string,
  _record: TeachingWorkspaceRecord,
): Promise<{
  lspAvailable: boolean
  diagnostics: TeachingDiagnostic[]
}> {
  return {
    lspAvailable: false,
    diagnostics: [],
  }
}
