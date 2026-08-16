import type {
  SkillsCreateData,
  SkillsListResponses,
  SkillsPresentationsResponses,
  SkillsUpdateResponses,
} from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "../lib/buddy-client"
import { z } from "zod"
import { parseWithSchema } from "./parse-external"

export type SkillLibraryEntry = {
  id: string
  displayName: string
  icon?: string
  summary: string
  categories: string[]
  tags: string[]
  sourceKind: "github"
  sourceLabel: string
  state: "available" | "installed" | "update_available" | "withdrawn_installed"
}

export type SkillPermissionAction = "allow" | "deny"
type RawInstalledSkillInfo = SkillsListResponses[200]["installed"][number]
export type InstalledSkillInfo = Omit<RawInstalledSkillInfo, "permissionAction"> & {
  permissionAction: SkillPermissionAction
}
type RawSkillsUpdateResult = SkillsUpdateResponses[200]
export type SkillsUpdateResult = Omit<RawSkillsUpdateResult, "skill" | "action"> & {
  skill: InstalledSkillInfo
  action: SkillRuleAction
}
export type SkillsCatalog = Omit<SkillsListResponses[200], "library" | "installed"> & {
  installed: InstalledSkillInfo[]
  library: SkillLibraryEntry[]
}
export type CreateCustomSkillInput = NonNullable<SkillsCreateData["body"]>
export type SkillRuleAction = SkillPermissionAction
export type SkillSource = InstalledSkillInfo["source"]
export type SkillScope = InstalledSkillInfo["scope"]

const skillLibraryEntrySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  icon: z.string().optional(),
  summary: z.string(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  sourceKind: z.literal("github"),
  sourceLabel: z.string(),
  state: z.enum(["available", "installed", "update_available", "withdrawn_installed"]),
})

function parseSkillLibraryEntry<TValue>(value: TValue): SkillLibraryEntry {
  const entry = parseWithSchema(skillLibraryEntrySchema, value)
  if (!entry) {
    throw new Error("Invalid skill library response")
  }
  return Object.assign(
    {
      id: entry.id,
      displayName: entry.displayName,
      summary: entry.summary,
      categories: entry.categories,
      tags: entry.tags,
      sourceKind: "github" as const,
      sourceLabel: entry.sourceLabel,
      state: entry.state,
    },
    entry.icon ? { icon: entry.icon } : undefined,
  )
}

function normalizeInstalledSkill(skill: RawInstalledSkillInfo): InstalledSkillInfo {
  return {
    ...skill,
    permissionAction: skill.permissionAction === "deny" ? "deny" : "allow",
  }
}

function parseSkillsCatalog(rawCatalog: SkillsListResponses[200]): SkillsCatalog {
  return {
    ...rawCatalog,
    installed: rawCatalog.installed.map((skill) => normalizeInstalledSkill(skill)),
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
  return parseSkillsCatalog(requireBuddyData(result))
}

export type SkillPresentation = SkillsPresentationsResponses[200][number]

/**
 * Name, label and artwork for every visible skill. Cheap enough for surfaces
 * that only draw skills — the slash menu, the composer pill — which have no use
 * for the full catalog's documents and permission state.
 */
export async function loadSkillPresentations(directory?: string) {
  const result = await getBuddyClient(directory).skills.presentations()
  return requireBuddyData(result)
}

export async function installLibrarySkill(skillID: string, directory?: string) {
  const result = await getBuddyClient(directory).skills.library.install({
    skillID,
  })
  return requireBuddyData(result)
}

export async function removeLibrarySkill(skillID: string, directory?: string) {
  const result = await getBuddyClient(directory).skills.library.delete({
    skillID,
  })
  return requireBuddyData(result)
}

export async function createCustomSkill(input: CreateCustomSkillInput, directory?: string) {
  const result = await getBuddyClient(directory).skills.create({
    ...input,
  })
  return requireBuddyData(result)
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
  const raw = requireBuddyData(result)
  return {
    ...raw,
    action: raw.action === "deny" ? "deny" : "allow",
    skill: {
      ...raw.skill,
      permissionAction: raw.skill.permissionAction === "deny" ? "deny" : "allow",
    },
  } satisfies SkillsUpdateResult
}

export async function removeSkill(name: string, directory?: string) {
  const result = await getBuddyClient(directory).skills.delete({
    name,
  })
  return requireBuddyData(result)
}

export async function updateSkillsSettings(
  externalVendorRootsEnabled: boolean,
  directory?: string,
) {
  const result = await getBuddyClient(directory).skills.settings.patch({
    externalVendorRootsEnabled,
  })
  return requireBuddyData(result)
}
