import { create } from "zustand"

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

const largeFileApprovalKeys = new Set<string>()

function largeFileApprovalKey(directory: string, path: string) {
  return `${directory}\u0000${path}`
}

export function grantWorkspaceFileLargeOpenApproval(directory: string, path: string): void {
  largeFileApprovalKeys.add(largeFileApprovalKey(directory, path))
}

export function revokeWorkspaceFileLargeOpenApproval(directory: string, path: string): void {
  largeFileApprovalKeys.delete(largeFileApprovalKey(directory, path))
}

export function consumeWorkspaceFileLargeOpenApproval(directory: string, path: string): boolean {
  const key = largeFileApprovalKey(directory, path)
  if (!largeFileApprovalKeys.has(key)) return false
  largeFileApprovalKeys.delete(key)
  return true
}
