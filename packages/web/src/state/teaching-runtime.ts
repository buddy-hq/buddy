import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import { createPlatformJsonStorage } from "../context/platform"

export const TEACHING_RUNTIME_STORAGE_KEY = "buddy.teaching.runtime.v2"
export const TEACHING_WORKSPACE_SCOPE = "__workspace__"

export const TEACHING_LANGUAGE_OPTIONS = [
  { value: "txt", label: "Plain Text", monacoLanguage: "plaintext" },
  { value: "ts", label: "TypeScript", monacoLanguage: "typescript" },
  { value: "tsx", label: "TSX / React", monacoLanguage: "typescript" },
  { value: "js", label: "JavaScript", monacoLanguage: "javascript" },
  { value: "jsx", label: "JSX / React", monacoLanguage: "javascript" },
  { value: "py", label: "Python", monacoLanguage: "python" },
  { value: "go", label: "Go", monacoLanguage: "go" },
  { value: "rs", label: "Rust", monacoLanguage: "rust" },
  { value: "java", label: "Java", monacoLanguage: "java" },
  { value: "kt", label: "Kotlin", monacoLanguage: "kotlin" },
  { value: "php", label: "PHP", monacoLanguage: "php" },
  { value: "rb", label: "Ruby", monacoLanguage: "ruby" },
  { value: "swift", label: "Swift", monacoLanguage: "swift" },
  { value: "cs", label: "C#", monacoLanguage: "csharp" },
  { value: "fs", label: "F#", monacoLanguage: "fsharp" },
  { value: "c", label: "C", monacoLanguage: "c" },
  { value: "cpp", label: "C++", monacoLanguage: "cpp" },
  { value: "sh", label: "Shell", monacoLanguage: "shell" },
  { value: "yaml", label: "YAML", monacoLanguage: "yaml" },
  { value: "json", label: "JSON", monacoLanguage: "json" },
  { value: "md", label: "Markdown", monacoLanguage: "markdown" },
  { value: "html", label: "HTML", monacoLanguage: "html" },
  { value: "css", label: "CSS", monacoLanguage: "css" },
  { value: "sql", label: "SQL", monacoLanguage: "sql" },
  { value: "lua", label: "Lua", monacoLanguage: "lua" },
  { value: "dart", label: "Dart", monacoLanguage: "dart" },
  { value: "zig", label: "Zig", monacoLanguage: "plaintext" },
  { value: "vue", label: "Vue", monacoLanguage: "html" },
  { value: "svelte", label: "Svelte", monacoLanguage: "html" },
  { value: "astro", label: "Astro", monacoLanguage: "html" },
  { value: "ml", label: "OCaml", monacoLanguage: "plaintext" },
  { value: "ex", label: "Elixir", monacoLanguage: "plaintext" },
  { value: "gleam", label: "Gleam", monacoLanguage: "plaintext" },
  { value: "nix", label: "Nix", monacoLanguage: "plaintext" },
  { value: "tf", label: "Terraform", monacoLanguage: "hcl" },
  { value: "typ", label: "Typst", monacoLanguage: "plaintext" },
  { value: "clj", label: "Clojure", monacoLanguage: "clojure" },
  { value: "hs", label: "Haskell", monacoLanguage: "haskell" },
  { value: "jl", label: "Julia", monacoLanguage: "plaintext" },
  { value: "xml", label: "XML", monacoLanguage: "xml" },
] as const

export type TeachingLanguage = (typeof TEACHING_LANGUAGE_OPTIONS)[number]["value"]

type TeachingLanguageOption = (typeof TEACHING_LANGUAGE_OPTIONS)[number]

function createTeachingLanguageOptionIndex() {
  const index: Partial<Record<TeachingLanguage, TeachingLanguageOption>> = {}
  for (const option of TEACHING_LANGUAGE_OPTIONS) {
    index[option.value] = option
  }
  return index
}

const TEACHING_LANGUAGE_OPTION_INDEX = createTeachingLanguageOptionIndex()

export function teachingLanguageLabel(language: TeachingLanguage) {
  return TEACHING_LANGUAGE_OPTION_INDEX[language]?.label ?? language
}

export function teachingMonacoLanguage(language: TeachingLanguage) {
  return TEACHING_LANGUAGE_OPTION_INDEX[language]?.monacoLanguage ?? "plaintext"
}

export type TeachingSelection = {
  selectionStartLine?: number
  selectionStartColumn?: number
  selectionEndLine?: number
  selectionEndColumn?: number
}

export type TeachingWorkspace = {
  sessionID: string
  workspaceRoot: string
  language: TeachingLanguage
  lessonFilePath: string
  checkpointFilePath: string
  files: TeachingWorkspaceFile[]
  activeRelativePath: string
  revision: number
  code: string
  lspAvailable: boolean
  diagnostics: TeachingDiagnostic[]
}

export type TeachingWorkspaceFile = {
  relativePath: string
  filePath: string
  checkpointFilePath: string
  language: TeachingLanguage
}

export type TeachingDiagnosticSeverity = "error" | "warning" | "info" | "hint"

export type TeachingDiagnostic = {
  message: string
  severity: TeachingDiagnosticSeverity
  source?: string
  code?: string | number
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export type TeachingPromptContext = {
  active: boolean
  sessionID: string
  lessonFilePath: string
  checkpointFilePath: string
  language: TeachingLanguage
  revision: number
} & TeachingSelection

export type TeachingConflict = {
  code: string
  revision: number
  files: TeachingWorkspaceFile[]
  activeRelativePath: string
  lessonFilePath: string
  checkpointFilePath: string
  language: TeachingLanguage
  lspAvailable: boolean
  diagnostics: TeachingDiagnostic[]
}

export type TeachingWorkspaceState = TeachingWorkspace & {
  savedCode: string
  pendingSave: boolean
  saveError?: string
  conflict?: TeachingConflict
  selection?: TeachingSelection
}

export type TeachingRuntimeState = {
  selectedPersonaBySession: Record<string, string>
  preferredLanguageBySession: Record<string, TeachingLanguage>
  workspaceBySession: Record<string, TeachingWorkspaceState>
  setSessionPersona: (sessionKey: string, persona: string) => void
  clearSessionPersona: (sessionKey: string) => void
  setPreferredLanguage: (sessionKey: string, language: TeachingLanguage) => void
  migrateWorkspaceSelection: (directory: string, sessionID: string) => void
  setWorkspace: (sessionKey: string, workspace: TeachingWorkspace) => void
  updateWorkspaceCode: (sessionKey: string, code: string) => void
  setSelection: (sessionKey: string, selection?: TeachingSelection) => void
  setPendingSave: (sessionKey: string, pending: boolean) => void
  setSaveError: (sessionKey: string, error?: string) => void
  applySaveSuccess: (
    sessionKey: string,
    input: { requestCode: string; workspace: TeachingWorkspace },
  ) => void
  setConflict: (sessionKey: string, conflict?: TeachingConflict) => void
  loadConflictVersion: (sessionKey: string) => void
  applyRemoteSnapshot: (sessionKey: string, workspace: TeachingWorkspace) => void
}

export function teachingSessionKey(directory: string, sessionID: string) {
  return `${directory}::${sessionID}`
}

export function teachingSelectionKey(directory: string, sessionID?: string) {
  return `${directory}::${sessionID ?? TEACHING_WORKSPACE_SCOPE}`
}

export const useTeachingRuntime = create<TeachingRuntimeState>()(
  persist(
    immer((set) => {
      const selectionSlice: Pick<
        TeachingRuntimeState,
        | "selectedPersonaBySession"
        | "preferredLanguageBySession"
        | "setSessionPersona"
        | "clearSessionPersona"
        | "setPreferredLanguage"
        | "migrateWorkspaceSelection"
      > = {
        selectedPersonaBySession: {},
        preferredLanguageBySession: {},
        setSessionPersona(sessionKey, persona) {
          set((state) => {
            state.selectedPersonaBySession[sessionKey] = persona
          })
        },
        clearSessionPersona(sessionKey) {
          set((state) => {
            delete state.selectedPersonaBySession[sessionKey]
          })
        },
        setPreferredLanguage(sessionKey, language) {
          set((state) => {
            state.preferredLanguageBySession[sessionKey] = language
          })
        },
        migrateWorkspaceSelection(directory, sessionID) {
          const sourceKey = teachingSelectionKey(directory)
          const targetKey = teachingSessionKey(directory, sessionID)

          set((state) => {
            if (
              sourceKey in state.selectedPersonaBySession &&
              !(targetKey in state.selectedPersonaBySession)
            ) {
              state.selectedPersonaBySession[targetKey] =
                state.selectedPersonaBySession[sourceKey] ?? ""
            }
            delete state.selectedPersonaBySession[sourceKey]

            if (
              sourceKey in state.preferredLanguageBySession &&
              !(targetKey in state.preferredLanguageBySession)
            ) {
              state.preferredLanguageBySession[targetKey] =
                state.preferredLanguageBySession[sourceKey] ?? "ts"
            }
            delete state.preferredLanguageBySession[sourceKey]
          })
        },
      }

      const workspaceSlice: Pick<
        TeachingRuntimeState,
        | "workspaceBySession"
        | "setWorkspace"
        | "updateWorkspaceCode"
        | "setSelection"
        | "setPendingSave"
        | "setSaveError"
        | "applySaveSuccess"
        | "setConflict"
        | "loadConflictVersion"
        | "applyRemoteSnapshot"
      > = {
        workspaceBySession: {},
        setWorkspace(sessionKey, workspace) {
          set((state) => {
            const current = state.workspaceBySession[sessionKey]
            state.workspaceBySession[sessionKey] = {
              ...workspace,
              savedCode: workspace.code,
              pendingSave: false,
              saveError: undefined,
              conflict: undefined,
              selection: current?.selection,
            }
          })
        },
        updateWorkspaceCode(sessionKey, code) {
          set((state) => {
            const workspace = state.workspaceBySession[sessionKey]
            if (workspace) {
              workspace.code = code
            }
          })
        },
        setSelection(sessionKey, selection) {
          set((state) => {
            const workspace = state.workspaceBySession[sessionKey]
            if (workspace) {
              workspace.selection = selection
            }
          })
        },
        setPendingSave(sessionKey, pending) {
          set((state) => {
            const workspace = state.workspaceBySession[sessionKey]
            if (workspace) {
              workspace.pendingSave = pending
            }
          })
        },
        setSaveError(sessionKey, error) {
          set((state) => {
            const workspace = state.workspaceBySession[sessionKey]
            if (workspace) {
              workspace.saveError = error
            }
          })
        },
        applySaveSuccess(sessionKey, input) {
          set((state) => {
            const workspace = state.workspaceBySession[sessionKey]
            if (workspace) {
              Object.assign(workspace, input.workspace)
              workspace.code =
                workspace.code === input.requestCode ? input.workspace.code : workspace.code
              workspace.savedCode = input.workspace.code
              workspace.pendingSave = false
              workspace.saveError = undefined
              workspace.conflict = undefined
            }
          })
        },
        setConflict(sessionKey, conflict) {
          set((state) => {
            const workspace = state.workspaceBySession[sessionKey]
            if (workspace) {
              workspace.pendingSave = false
              workspace.conflict = conflict
            }
          })
        },
        loadConflictVersion(sessionKey) {
          set((state) => {
            const workspace = state.workspaceBySession[sessionKey]
            if (workspace?.conflict) {
              workspace.code = workspace.conflict.code
              workspace.savedCode = workspace.conflict.code
              workspace.revision = workspace.conflict.revision
              workspace.files = workspace.conflict.files
              workspace.activeRelativePath = workspace.conflict.activeRelativePath
              workspace.lessonFilePath = workspace.conflict.lessonFilePath
              workspace.checkpointFilePath = workspace.conflict.checkpointFilePath
              workspace.language = workspace.conflict.language
              workspace.lspAvailable = workspace.conflict.lspAvailable
              workspace.diagnostics = workspace.conflict.diagnostics
              workspace.conflict = undefined
              workspace.saveError = undefined
              workspace.pendingSave = false
            }
          })
        },
        applyRemoteSnapshot(sessionKey, workspace) {
          set((state) => {
            const current = state.workspaceBySession[sessionKey]
            if (!current) {
              state.workspaceBySession[sessionKey] = {
                ...workspace,
                savedCode: workspace.code,
                pendingSave: false,
              }
              return
            }

            const hasLocalEdits = current.code !== current.savedCode
            const sameActiveFile = current.activeRelativePath === workspace.activeRelativePath

            if (current.code === workspace.code || !hasLocalEdits) {
              state.workspaceBySession[sessionKey] = {
                ...current,
                ...workspace,
                code: workspace.code,
                savedCode: workspace.code,
                saveError: undefined,
                pendingSave: false,
                conflict: undefined,
              }
              return
            }

            state.workspaceBySession[sessionKey] = {
              ...current,
              ...workspace,
              activeRelativePath: sameActiveFile
                ? workspace.activeRelativePath
                : current.activeRelativePath,
              lessonFilePath: sameActiveFile ? workspace.lessonFilePath : current.lessonFilePath,
              checkpointFilePath: sameActiveFile
                ? workspace.checkpointFilePath
                : current.checkpointFilePath,
              language: sameActiveFile ? workspace.language : current.language,
              lspAvailable: sameActiveFile ? workspace.lspAvailable : current.lspAvailable,
              diagnostics: sameActiveFile ? workspace.diagnostics : current.diagnostics,
              code: current.code,
              savedCode: current.savedCode,
              conflict: {
                code: workspace.code,
                revision: workspace.revision,
                files: workspace.files,
                activeRelativePath: workspace.activeRelativePath,
                lessonFilePath: workspace.lessonFilePath,
                checkpointFilePath: workspace.checkpointFilePath,
                language: workspace.language,
                lspAvailable: workspace.lspAvailable,
                diagnostics: workspace.diagnostics,
              },
              saveError: undefined,
              pendingSave: false,
            }
          })
        },
      }

      return {
        ...selectionSlice,
        ...workspaceSlice,
      }
    }),
    {
      name: TEACHING_RUNTIME_STORAGE_KEY,
      version: 6,
      storage: createPlatformJsonStorage("buddy.teaching.dat"),
      migrate() {
        return {
          selectedPersonaBySession: {},
          preferredLanguageBySession: {},
          workspaceBySession: {},
        }
      },
      partialize(state) {
        return {
          selectedPersonaBySession: state.selectedPersonaBySession,
          preferredLanguageBySession: state.preferredLanguageBySession,
        }
      },
    },
  ),
)
