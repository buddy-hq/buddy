import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "../context/platform"

export const TEACHING_MODE_STORAGE_KEY = "buddy.teaching.v2"

export const TEACHING_LANGUAGE_OPTIONS = [
  { value: "txt", label: "Plain Text", monacoLanguage: "plaintext" },
  { value: "ts", label: "TypeScript", monacoLanguage: "typescript" },
  { value: "tsx", label: "TSX / React", monacoLanguage: "typescriptreact" },
  { value: "js", label: "JavaScript", monacoLanguage: "javascript" },
  { value: "jsx", label: "JSX / React", monacoLanguage: "javascriptreact" },
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

const TEACHING_LANGUAGE_OPTION_INDEX = Object.fromEntries(
  TEACHING_LANGUAGE_OPTIONS.map((option) => [option.value, option]),
) as Record<TeachingLanguage, (typeof TEACHING_LANGUAGE_OPTIONS)[number]>

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
  lessonFilePath: string
}

export type TeachingWorkspaceState = TeachingWorkspace & {
  savedCode: string
  pendingSave: boolean
  saveError?: string
  conflict?: TeachingConflict
  selection?: TeachingSelection
}

export type TeachingModeState = {
  selectedModeBySession: Record<string, string>
  preferredLanguageBySession: Record<string, TeachingLanguage>
  workspaceBySession: Record<string, TeachingWorkspaceState>
  setSessionMode: (sessionKey: string, mode: string) => void
  setPreferredLanguage: (sessionKey: string, language: TeachingLanguage) => void
  setWorkspace: (sessionKey: string, workspace: TeachingWorkspace) => void
  updateWorkspaceCode: (sessionKey: string, code: string) => void
  setSelection: (sessionKey: string, selection?: TeachingSelection) => void
  setPendingSave: (sessionKey: string, pending: boolean) => void
  setSaveError: (sessionKey: string, error?: string) => void
  applySaveSuccess: (sessionKey: string, input: { requestCode: string; workspace: TeachingWorkspace }) => void
  setConflict: (sessionKey: string, conflict?: TeachingConflict) => void
  loadConflictVersion: (sessionKey: string) => void
  applyRemoteSnapshot: (sessionKey: string, workspace: TeachingWorkspace) => void
}

export function teachingSessionKey(directory: string, sessionID: string) {
  return `${directory}::${sessionID}`
}

function withWorkspace(
  state: TeachingModeState,
  sessionKey: string,
  fn: (workspace: TeachingWorkspaceState) => TeachingWorkspaceState,
) {
  const current = state.workspaceBySession[sessionKey]
  if (!current) return state.workspaceBySession
  return {
    ...state.workspaceBySession,
    [sessionKey]: fn(current),
  }
}

export const useTeachingMode = create<TeachingModeState>()(
  persist(
    (set) => ({
      selectedModeBySession: {},
      preferredLanguageBySession: {},
      workspaceBySession: {},
      setSessionMode(sessionKey, mode) {
        set((state) => ({
          selectedModeBySession: {
            ...state.selectedModeBySession,
            [sessionKey]: mode,
          },
        }))
      },
      setPreferredLanguage(sessionKey, language) {
        set((state) => ({
          preferredLanguageBySession: {
            ...state.preferredLanguageBySession,
            [sessionKey]: language,
          },
        }))
      },
      setWorkspace(sessionKey, workspace) {
        set((state) => {
          const current = state.workspaceBySession[sessionKey]
          return {
            workspaceBySession: {
              ...state.workspaceBySession,
              [sessionKey]: {
                ...workspace,
                savedCode: workspace.code,
                pendingSave: false,
                saveError: undefined,
                conflict: undefined,
                selection: current?.selection,
              },
            },
          }
        })
      },
      updateWorkspaceCode(sessionKey, code) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            code,
          })),
        }))
      },
      setSelection(sessionKey, selection) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            selection,
          })),
        }))
      },
      setPendingSave(sessionKey, pending) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            pendingSave: pending,
          })),
        }))
      },
      setSaveError(sessionKey, error) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            saveError: error,
          })),
        }))
      },
      applySaveSuccess(sessionKey, input) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            ...input.workspace,
            code: workspace.code === input.requestCode ? input.workspace.code : workspace.code,
            savedCode: input.workspace.code,
            pendingSave: false,
            saveError: undefined,
            conflict: undefined,
            selection: workspace.selection,
          })),
        }))
      },
      setConflict(sessionKey, conflict) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            pendingSave: false,
            conflict,
          })),
        }))
      },
      loadConflictVersion(sessionKey) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => {
            if (!workspace.conflict) return workspace
            return {
              ...workspace,
              code: workspace.conflict.code,
              savedCode: workspace.conflict.code,
              revision: workspace.conflict.revision,
              lessonFilePath: workspace.conflict.lessonFilePath,
              conflict: undefined,
              saveError: undefined,
              pendingSave: false,
            }
          }),
        }))
      },
      applyRemoteSnapshot(sessionKey, workspace) {
        set((state) => {
          const current = state.workspaceBySession[sessionKey]
          if (!current) {
            return {
              workspaceBySession: {
                ...state.workspaceBySession,
                [sessionKey]: {
                  ...workspace,
                  savedCode: workspace.code,
                  pendingSave: false,
                },
              },
            }
          }

          const hasLocalEdits = current.code !== current.savedCode
          const sameActiveFile = current.activeRelativePath === workspace.activeRelativePath

          if (current.code === workspace.code || !hasLocalEdits) {
            return {
              workspaceBySession: {
                ...state.workspaceBySession,
                [sessionKey]: {
                  ...current,
                  ...workspace,
                  code: workspace.code,
                  savedCode: workspace.code,
                  saveError: undefined,
                  pendingSave: false,
                  conflict: undefined,
                },
              },
            }
          }

          return {
            workspaceBySession: {
              ...state.workspaceBySession,
              [sessionKey]: {
                ...current,
                ...workspace,
                activeRelativePath: sameActiveFile ? workspace.activeRelativePath : current.activeRelativePath,
                lessonFilePath: sameActiveFile ? workspace.lessonFilePath : current.lessonFilePath,
                checkpointFilePath: sameActiveFile ? workspace.checkpointFilePath : current.checkpointFilePath,
                language: sameActiveFile ? workspace.language : current.language,
                lspAvailable: sameActiveFile ? workspace.lspAvailable : current.lspAvailable,
                diagnostics: sameActiveFile ? workspace.diagnostics : current.diagnostics,
                code: current.code,
                savedCode: current.savedCode,
                conflict: {
                  code: workspace.code,
                  revision: workspace.revision,
                  lessonFilePath: workspace.lessonFilePath,
                },
                saveError: undefined,
                pendingSave: false,
              },
            },
          }
        })
      },
    }),
    {
      name: TEACHING_MODE_STORAGE_KEY,
      version: 3,
      storage: createPlatformJsonStorage("buddy.teaching.dat"),
      migrate(persistedState) {
        const state =
          (persistedState as
            | (Partial<TeachingModeState> & {
                selectedAgentBySession?: Record<string, string>
              })
            | undefined) ?? undefined
        return {
          selectedModeBySession: state?.selectedModeBySession ?? state?.selectedAgentBySession ?? {},
          preferredLanguageBySession: state?.preferredLanguageBySession ?? {},
          workspaceBySession: {},
        }
      },
      partialize(state) {
        return {
          selectedModeBySession: state.selectedModeBySession,
          preferredLanguageBySession: state.preferredLanguageBySession,
        }
      },
    },
  ),
)
