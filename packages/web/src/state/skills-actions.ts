import type {
  SkillsCreateData,
  SkillsCreateResponses,
  SkillsDeleteResponses,
  SkillsLibraryInstallResponses,
  SkillsListResponses,
  SkillsSettingsPatchResponses,
  SkillsUpdateData,
  SkillsUpdateResponses,
} from '@buddy/sdk'
import { getBuddyClient, requireBuddyData } from '../lib/buddy-client'

export type SkillsCatalog = SkillsListResponses[200]
export type InstalledSkillInfo = SkillsCatalog['installed'][number]
export type SkillLibraryEntry = SkillsCatalog['library'][number]
export type CreateCustomSkillInput = NonNullable<SkillsCreateData['body']>
export type SkillRuleAction = NonNullable<NonNullable<SkillsUpdateData['body']>['action']>
export type SkillPermissionAction = Exclude<SkillRuleAction, 'inherit'>
export type SkillSource = InstalledSkillInfo['source']
export type SkillScope = InstalledSkillInfo['scope']
export type SkillPermissionSource = InstalledSkillInfo['permissionSource']

export async function loadSkillsCatalog(
  directory?: string,
  options?: {
    refresh?: boolean
  },
) {
  const result = await getBuddyClient(directory).skills.list({
    refresh: options?.refresh ? '1' : undefined,
  })
  return requireBuddyData<SkillsListResponses[200]>(result)
}

export async function installLibrarySkill(skillID: string, directory?: string) {
  const result = await getBuddyClient(directory).skills.library.install({
    skillID,
  })
  return requireBuddyData<SkillsLibraryInstallResponses[200]>(result)
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
