import type { PermissionAction } from "@buddy/opencode-adapter/permission"

export type SkillSource = "custom" | "library" | "system" | "external"
export type SkillScope = "global" | "workspace"
export type SkillPermissionSource = "explicit" | "inherited" | "default"
export type SkillRuleAction = "allow" | "deny"

export type InstalledSkillInfo = {
  name: string
  description: string
  location: string
  directory: string
  content: string
  examplePrompt?: string
  enabled: boolean
  permissionAction: SkillRuleAction
  permissionSource: SkillPermissionSource
  source: SkillSource
  scope: SkillScope
  managed: boolean
  removable: boolean
  libraryID?: string
}

export type SkillLibraryItemState =
  | "available"
  | "installed"
  | "update_available"
  | "withdrawn_installed"

export type SkillLibraryItemView = {
  id: string
  summary: string
  displayName: string
  categories: string[]
  tags: string[]
  sourceKind: "github"
  sourceLabel: string
  state: SkillLibraryItemState
}

export type SkillsCatalog = {
  directory: string
  managedRoot: string
  externalVendorRootsEnabled: boolean
  installed: InstalledSkillInfo[]
  library: SkillLibraryItemView[]
  librarySyncError?: string
}

export type CreateCustomSkillInput = {
  name: string
  description: string
  examplePrompt?: string
  content: string
}

export type SkillServiceErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "forbidden"
  | "upstream_failure"

export class SkillServiceError extends Error {
  constructor(
    readonly code: SkillServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "SkillServiceError"
  }
}

export type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}

export type PermissionRuleset = PermissionRule[]

export type OpenCodeSkill = {
  name: string
  description: string
  location: string
  content: string
}

export type ManagedSkillSource = {
  source: SkillSource
  managed: boolean
  removable: boolean
  libraryID?: string
}
