import type {
  SkillsCreateData,
  SkillsCreateResponses,
  SkillsDeleteResponses,
  SkillsLibraryDeleteResponses,
  SkillsLibraryInstallResponses,
  SkillsListResponses,
  SkillsSettingsPatchResponses,
  SkillsUpdateData,
  SkillsUpdateResponses,
} from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "../lib/buddy-client"

export type SkillLibraryEntry = {
  id: string
  displayName: string
  summary: string
  categories: string[]
  tags: string[]
  sourceKind: "github"
  sourceLabel: string
  state: "available" | "installed" | "withdrawn_installed"
}
export type SkillsCatalog = Omit<SkillsListResponses[200], "library"> & {
  library: SkillLibraryEntry[]
}
export type InstalledSkillInfo = SkillsCatalog["installed"][number]
export type CreateCustomSkillInput = NonNullable<SkillsCreateData["body"]>
export type SkillRuleAction = NonNullable<NonNullable<SkillsUpdateData["body"]>["action"]>
export type SkillPermissionAction = Exclude<SkillRuleAction, "inherit">
export type SkillSource = InstalledSkillInfo["source"]
export type SkillScope = InstalledSkillInfo["scope"]
export type SkillPermissionSource = InstalledSkillInfo["permissionSource"]

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return Object.fromEntries(Object.entries(value))
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) return undefined
  return value
}

function parseSkillLibraryEntry(value: unknown): SkillLibraryEntry {
  const record = objectRecord(value)
  const categories = stringArray(record?.categories)
  const tags = stringArray(record?.tags)
  if (
    !record ||
    typeof record.id !== "string" ||
    typeof record.displayName !== "string" ||
    typeof record.summary !== "string" ||
    !categories ||
    !tags ||
    record.sourceKind !== "github" ||
    typeof record.sourceLabel !== "string" ||
    (record.state !== "available" &&
      record.state !== "installed" &&
      record.state !== "withdrawn_installed")
  ) {
    throw new Error("Invalid skill library response")
  }

  return {
    id: record.id,
    displayName: record.displayName,
    summary: record.summary,
    categories,
    tags,
    sourceKind: record.sourceKind,
    sourceLabel: record.sourceLabel,
    state: record.state,
  }
}

function parseSkillsCatalog(rawCatalog: SkillsListResponses[200]): SkillsCatalog {
  return {
    ...rawCatalog,
    library: rawCatalog.library.map((entry) => parseSkillLibraryEntry(entry)),
  }
}

export async function loadSkillsCatalog(
  directory?: string,
  options?: {
    refresh?: boolean
  },
) {
  const result = await getBuddyClient(directory).skills.list({
    refresh: options?.refresh ? "1" : undefined,
  })
  return parseSkillsCatalog(requireBuddyData<SkillsListResponses[200]>(result))
}

export async function installLibrarySkill(skillID: string, directory?: string) {
  const result = await getBuddyClient(directory).skills.library.install({
    skillID,
  })
  return requireBuddyData<SkillsLibraryInstallResponses[200]>(result)
}

export async function removeLibrarySkill(skillID: string, directory?: string) {
  const result = await getBuddyClient(directory).skills.library.delete({
    skillID,
  })
  return requireBuddyData<SkillsLibraryDeleteResponses[200]>(result)
}

export async function createCustomSkill(input: CreateCustomSkillInput, directory?: string) {
  const result = await getBuddyClient(directory).skills.create({
    ...input,
  })
  return requireBuddyData<SkillsCreateResponses[200]>(result)
}

export async function setSkillPermissionAction(
  name: string,
  action: SkillRuleAction,
  directory?: string,
) {
  const result = await getBuddyClient(directory).skills.update({
    name,
    action,
  })
  return requireBuddyData<SkillsUpdateResponses[200]>(result)
}

export async function removeSkill(name: string, directory?: string) {
  const result = await getBuddyClient(directory).skills.delete({
    name,
  })
  return requireBuddyData<SkillsDeleteResponses[200]>(result)
}

export async function updateSkillsSettings(
  externalVendorRootsEnabled: boolean,
  directory?: string,
) {
  const result = await getBuddyClient(directory).skills.settings.patch({
    externalVendorRootsEnabled,
  })
  return requireBuddyData<SkillsSettingsPatchResponses[200]>(result)
}
