export type ProjectRef = {
  readonly id: string
  readonly directory: string
  readonly canonical: string
}

export type LocationInfo = {
  readonly directory: string
  readonly workspaceID?: string
  readonly project: ProjectRef
}

export type ProjectInfo = {
  readonly id: string
  readonly worktree: string
  readonly vcs?: string
  readonly name?: string
  readonly icon?: { readonly url?: string; readonly override?: string; readonly color?: string }
  readonly commands?: { readonly start?: string }
  readonly time: {
    readonly created: number
    readonly updated: number
    readonly initialized: number
  }
  readonly sandboxes: readonly string[]
}

export type ProjectUpdate = {
  readonly name?: string
  readonly icon?: ProjectInfo["icon"]
  readonly commands?: ProjectInfo["commands"]
}

export type FileSearch = {
  readonly query: string
  readonly limit?: number
  readonly kind?: "file" | "directory"
}

export interface Workspace {
  projects(): Promise<ProjectInfo[]>
  updateProject(projectID: string, input: ProjectUpdate): Promise<ProjectInfo>
  location(directory: string): Promise<LocationInfo>
  project(directory: string): Promise<ProjectInfo | undefined>
  findFiles(directory: string, search: FileSearch): Promise<string[]>
}
