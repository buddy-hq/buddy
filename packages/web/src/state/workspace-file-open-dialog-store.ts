import { create } from "zustand"
import { canonicalProjectDirectory } from "@/lib/project-directory"
import { normalizeRelativePath } from "@/lib/workspace-file-paths"

export type WorkspaceFileOpenApprovalChoice = "open" | "default-app" | "cancel"

type WorkspaceFileOpenApprovalRequest = {
  id: number
  path: string
  sizeBytes: number
  canOpenDefaultApp: boolean
  resolve: (choice: WorkspaceFileOpenApprovalChoice) => void
}

type WorkspaceFileOpenDialogState = {
  nextRequestID: number
  request: WorkspaceFileOpenApprovalRequest | undefined
  requestApproval(input: {
    path: string
    sizeBytes: number
    canOpenDefaultApp: boolean
  }): Promise<WorkspaceFileOpenApprovalChoice>
  resolveRequest(choice: WorkspaceFileOpenApprovalChoice): void
}

export const useWorkspaceFileOpenDialogStore = create<WorkspaceFileOpenDialogState>((set, get) => ({
  nextRequestID: 1,
  request: undefined,
  requestApproval: (input) =>
    new Promise((resolve) => {
      const current = get().request
      current?.resolve("cancel")
      const id = get().nextRequestID
      set({
        nextRequestID: id + 1,
        request: { id, ...input, resolve },
      })
    }),
  resolveRequest: (choice) => {
    const current = get().request
    if (!current) return
    set({ request: undefined })
    current.resolve(choice)
  },
}))

const sessionApprovalKeys = new Set<string>()
const handoffApprovalKeys = new Set<string>()

function largeFileApprovalKey(directory: string, path: string) {
  const canonicalDirectory = canonicalProjectDirectory(directory) ?? directory
  return `${canonicalDirectory}\u0000${normalizeRelativePath(path)}`
}

export function grantWorkspaceFileLargeOpenApproval(directory: string, path: string): void {
  const key = largeFileApprovalKey(directory, path)
  sessionApprovalKeys.add(key)
  handoffApprovalKeys.add(key)
}

export function revokeWorkspaceFileLargeOpenApproval(directory: string, path: string): void {
  const key = largeFileApprovalKey(directory, path)
  sessionApprovalKeys.delete(key)
  handoffApprovalKeys.delete(key)
}

export function hasWorkspaceFileLargeOpenSessionApproval(directory: string, path: string): boolean {
  return sessionApprovalKeys.has(largeFileApprovalKey(directory, path))
}

export function consumeWorkspaceFileLargeOpenApproval(directory: string, path: string): boolean {
  const key = largeFileApprovalKey(directory, path)
  if (!handoffApprovalKeys.has(key)) return false
  handoffApprovalKeys.delete(key)
  return true
}

export function releaseWorkspaceFileLargeOpenHandoff(directory: string, path: string): void {
  handoffApprovalKeys.delete(largeFileApprovalKey(directory, path))
}
