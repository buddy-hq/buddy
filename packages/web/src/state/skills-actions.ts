import { apiFetch } from "../lib/api-client"

export type SkillPermissionAction = "allow" | "deny" | "ask"
export type SkillRuleAction = SkillPermissionAction | "inherit"
export type SkillSource = "custom" | "library" | "external"
export type SkillScope = "global" | "workspace"
export type SkillPermissionSource = "explicit" | "inherited" | "default"

export type InstalledSkillInfo = {
  name: string
  description: string
  location: string
  directory: string
  content: string
  examplePrompt?: string
  enabled: boolean
  permissionAction: SkillPermissionAction
  permissionSource: SkillPermissionSource
  source: SkillSource
  scope: SkillScope
  managed: boolean
  removable: boolean
  libraryID?: string
}

export type SkillLibraryEntry = {
  id: string
  name: string
  description: string
  summary: string
  examplePrompt: string
  installed: boolean
}

export type SkillsCatalog = {
  directory: string
  managedRoot: string
  installed: InstalledSkillInfo[]
  library: SkillLibraryEntry[]
}

export type CreateCustomSkillInput = {
  name: string
  description: string
  examplePrompt?: string
  content: string
}

async function requestSkillsJson<T>(
  endpoint: string,
  init?: {
    method?: string
    directory?: string
    body?: unknown
  },
) {
  const response = await apiFetch(endpoint, {
    method: init?.method,
    directory: init?.directory,
    body: init?.body,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    throw new Error(payload?.error ?? payload?.message ?? `Request failed (${response.status})`)
  }

  return (await response.json()) as T
}

export async function loadSkillsCatalog(
  directory?: string,
  options?: {
    refresh?: boolean
  },
) {
  const endpoint = options?.refresh ? "/api/skills?refresh=1" : "/api/skills"

  return requestSkillsJson<SkillsCatalog>(endpoint, {
    directory,
  })
}

export async function installLibrarySkill(skillID: string, directory?: string) {
  return requestSkillsJson<{ ok: true; name: string }>(`/api/skills/library/${encodeURIComponent(skillID)}/install`, {
    method: "POST",
    directory,
  })
}

export async function createCustomSkill(input: CreateCustomSkillInput, directory?: string) {
  return requestSkillsJson<{ ok: true; name: string }>("/api/skills", {
    method: "POST",
    directory,
    body: input,
  })
}

export async function setSkillPermissionAction(name: string, action: SkillRuleAction, directory?: string) {
  return requestSkillsJson<{ ok: true; skill: InstalledSkillInfo; action: SkillRuleAction }>(
    `/api/skills/${encodeURIComponent(name)}`,
    {
      method: "PATCH",
      directory,
      body: {
        action,
      },
    },
  )
}

export async function removeSkill(name: string, directory?: string) {
  return requestSkillsJson<{ ok: true; name: string }>(`/api/skills/${encodeURIComponent(name)}`, {
    method: "DELETE",
    directory,
  })
}
