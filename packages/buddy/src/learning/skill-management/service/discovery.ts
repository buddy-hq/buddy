import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Config } from "@buddy/backend/config"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensureOpenCodeProjectOverlay } from "@buddy/backend/config/runtime"
import { fetchOpenCode } from "../../../http"
import { SkillServiceError, type OpenCodeSkill } from "./contracts"
import { loadManagedSkillFile } from "./documents"
import { OPENCODE_SKILL_CACHE_ROOT, isWithinPath, managedSkillsRoot } from "./paths"

async function readDirectoryEntries(directory: string) {
  return fsp
    .readdir(directory, {
      withFileTypes: true,
    })
    .catch(() => [])
}

async function collectSkillFiles(root: string) {
  const entries = await readDirectoryEntries(root)

  const matches: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      matches.push(...(await collectSkillFiles(fullPath)))
      continue
    }

    if (entry.isFile() && entry.name === "SKILL.md") {
      matches.push(fullPath)
    }
  }

  return matches
}

function expandSkillPath(skillPath: string, directory: string) {
  const expanded = skillPath.startsWith("~/")
    ? path.join(os.homedir(), skillPath.slice(2))
    : skillPath
  return path.isAbsolute(expanded) ? expanded : path.join(directory, expanded)
}

function mergeSkillsByName(skills: OpenCodeSkill[]) {
  const merged = new Map<string, OpenCodeSkill>()
  for (const skill of skills) {
    merged.set(skill.name, skill)
  }
  return Array.from(merged.values())
}

async function appendSkillsFromRoot(root: string, skills: Map<string, OpenCodeSkill>) {
  const stats = await fsp.stat(root).catch(() => undefined)
  if (!stats?.isDirectory()) {
    return
  }

  const matches = await collectSkillFiles(root)
  for (const match of matches) {
    const skill = await loadManagedSkillFile(match)
    if (skill) {
      skills.set(skill.name, skill)
    }
  }
}

async function loadCachedOpenCodeSkills(directory: string): Promise<OpenCodeSkill[]> {
  const response = await fetchOpenCode({
    directory,
    method: "GET",
    path: "/skill",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: string; message?: string }
      | undefined
    throw new SkillServiceError(
      "upstream_failure",
      payload?.error ?? payload?.message ?? `Failed to list skills (${response.status})`,
    )
  }

  return (await response.json()) as OpenCodeSkill[]
}

async function loadFreshLocalOpenCodeSkills(directory: string): Promise<OpenCodeSkill[]> {
  const runtimeContext = await OpenCodeInstance.provide({
    directory,
    fn: async () => {
      const config = await OpenCodeConfig.get()
      const configDirectories = await OpenCodeConfig.directories()

      return {
        config,
        configDirectories,
      }
    },
  })

  const skills = new Map<string, OpenCodeSkill>()

  for (const configDirectory of runtimeContext.configDirectories) {
    await appendSkillsFromRoot(path.join(configDirectory, "skill"), skills)
    await appendSkillsFromRoot(path.join(configDirectory, "skills"), skills)
  }

  for (const skillPath of runtimeContext.config.skills?.paths ?? []) {
    const resolved = expandSkillPath(skillPath, directory)
    await appendSkillsFromRoot(resolved, skills)
  }

  return Array.from(skills.values())
}

function isCachedRemoteSkill(skill: OpenCodeSkill) {
  return isWithinPath(OPENCODE_SKILL_CACHE_ROOT, skill.location)
}

function mergeRefreshedOpenCodeSkills(
  cachedSkills: OpenCodeSkill[],
  freshLocalSkills: OpenCodeSkill[],
) {
  return mergeSkillsByName([...cachedSkills.filter(isCachedRemoteSkill), ...freshLocalSkills])
}

async function loadBuddyManagedSkills() {
  const root = managedSkillsRoot()
  const entries = await readDirectoryEntries(root)

  const skills: OpenCodeSkill[] = []

  for (const group of entries) {
    if (!group.isDirectory()) continue
    const groupPath = path.join(root, group.name)
    const groupEntries = await readDirectoryEntries(groupPath)

    for (const skillDir of groupEntries) {
      if (!skillDir.isDirectory()) continue
      const skill = await loadManagedSkillFile(path.join(groupPath, skillDir.name, "SKILL.md"))
      if (skill) {
        skills.push(skill)
      }
    }
  }

  return skills
}

async function loadOpenCodeSkills(directory: string, refresh: boolean | undefined) {
  if (!refresh) {
    return loadCachedOpenCodeSkills(directory)
  }

  const [cachedSkills, freshLocalSkills] = await Promise.all([
    loadCachedOpenCodeSkills(directory),
    loadFreshLocalOpenCodeSkills(directory),
  ])
  return mergeRefreshedOpenCodeSkills(cachedSkills, freshLocalSkills)
}

function mergeOpenCodeAndManagedSkills(
  openCodeSkills: OpenCodeSkill[],
  managedSkills: OpenCodeSkill[],
) {
  const merged = new Map(managedSkills.map((skill) => [skill.name, skill]))
  for (const skill of openCodeSkills) {
    if (!merged.has(skill.name)) {
      merged.set(skill.name, skill)
    }
  }
  return Array.from(merged.values())
}

function isExternalVendorSkill(location: string) {
  const segments = path.resolve(location).split(path.sep)
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index]
    const next = segments[index + 1]
    if ((current === ".claude" || current === ".agents") && next === "skills") {
      return true
    }
  }

  return false
}

function filterOpenCodeSkillsByProjectSettings(input: {
  openCodeSkills: OpenCodeSkill[]
  externalVendorRootsEnabled: boolean
}) {
  if (input.externalVendorRootsEnabled) {
    return input.openCodeSkills
  }

  return input.openCodeSkills.filter((skill) => !isExternalVendorSkill(skill.location))
}

export async function loadVisibleSkills(
  directory: string,
  options?: {
    refresh?: boolean
  },
) {
  const globalConfig = await Config.getGlobal()
  await ensureOpenCodeProjectOverlay(directory)

  const [openCodeSkills, managedSkills] = await Promise.all([
    loadOpenCodeSkills(directory, options?.refresh),
    loadBuddyManagedSkills(),
  ])

  return mergeOpenCodeAndManagedSkills(
    filterOpenCodeSkillsByProjectSettings({
      openCodeSkills,
      externalVendorRootsEnabled: globalConfig.skills_external_vendor_roots_enabled === true,
    }),
    managedSkills,
  )
}

export async function resolveInstalledSkillByName(name: string, directory: string) {
  const skills = await loadVisibleSkills(directory, {
    refresh: true,
  })
  return skills.find((skill) => skill.name === name)
}
