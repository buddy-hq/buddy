import type { SessionInfo } from "@/state/chat-types"

export type OrganizeMode = "project" | "chronological"
export type SortMode = "created" | "updated"
export type ShowMode = "all" | "relevant"
export type DropPosition = "before" | "after"

export type RenameState = {
  directory: string
  sessionID: string
  title: string
}

export type ArchiveState = {
  directory: string
  sessionID: string
  title: string
}

export type DirectoryGroup = {
  directory: string
  sessions: SessionInfo[]
}
