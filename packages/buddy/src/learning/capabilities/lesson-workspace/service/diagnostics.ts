import { Instance as OpenCodeInstance } from '@buddy/opencode-adapter/instance'
import { LSP } from '@buddy/opencode-adapter/lsp'
import { loadOpenCodeApp } from '@buddy/backend/opencode-runtime/runtime'
import type { TeachingDiagnostic, TeachingWorkspaceRecord } from '../model/types'
import { syncDerivedFields } from './workspace'

function normalizeDiagnosticSeverity(severity?: number): TeachingDiagnostic['severity'] {
  switch (severity) {
    case 1:
      return 'error'
    case 2:
      return 'warning'
    case 3:
      return 'info'
    default:
      return 'hint'
  }
}

function normalizeDiagnostics(
  diagnostics: Array<{
    range?: {
      start?: {
        line?: number
        character?: number
      }
      end?: {
        line?: number
        character?: number
      }
    }
    message?: string
    severity?: number
    source?: string
    code?: string | number
  }>,
): TeachingDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    message: diagnostic.message ?? 'Unknown diagnostic',
    severity: normalizeDiagnosticSeverity(diagnostic.severity),
    source: diagnostic.source,
    code:
      typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number'
        ? diagnostic.code
        : undefined,
    startLine: (diagnostic.range?.start?.line ?? 0) + 1,
    startColumn: (diagnostic.range?.start?.character ?? 0) + 1,
    endLine: (diagnostic.range?.end?.line ?? diagnostic.range?.start?.line ?? 0) + 1,
    endColumn: (diagnostic.range?.end?.character ?? diagnostic.range?.start?.character ?? 0) + 1,
  }))
}

async function ensureOpenCodeRuntimeForDirectory(directory: string) {
  const app = await loadOpenCodeApp()
  const response = await app.fetch(
    new Request('http://opencode.local/agent', {
      method: 'GET',
      headers: {
        'x-opencode-directory': directory,
      },
    }),
  )

  if (!response.ok) {
    throw new Error(`Failed to initialize OpenCode runtime (${response.status})`)
  }
}

export async function readActiveDiagnostics(directory: string, record: TeachingWorkspaceRecord) {
  try {
    await ensureOpenCodeRuntimeForDirectory(directory)

    return OpenCodeInstance.provide({
      directory,
      async fn() {
        const filePath = syncDerivedFields(directory, record).lessonFilePath
        const available = await LSP.hasClients(filePath)
        if (!available) {
          return {
            lspAvailable: false,
            diagnostics: [] as TeachingDiagnostic[],
          }
        }

        await LSP.touchFile(filePath, true)
        const diagnostics = await LSP.diagnostics()

        return {
          lspAvailable: true,
          diagnostics: normalizeDiagnostics(diagnostics[filePath] ?? []),
        }
      },
    })
  } catch {
    return {
      lspAvailable: false,
      diagnostics: [] as TeachingDiagnostic[],
    }
  }
}
